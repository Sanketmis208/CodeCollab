import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';
import { downloadProjectAsZip, unzipFileToEntries } from '../lib/projectZip.js';

export default function FileExplorer({ roomId, files, setFiles, setActiveFileId, folders, setFolders }) {
  // folders and setFolders are supplied by the parent to avoid a race where
  // files arrive before folders. The parent is responsible for the initial
  // fetch (see Room.jsx -> refreshTree) and will update these props when
  // server emits 'files:updated' or 'folders:updated'.
  const [creating, setCreating] = useState(null);
  const [name, setName] = useState('');
  const [editingFileId, setEditingFileId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const rootInputRef = useRef(null);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (!roomId) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.isComposing) return;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setCreating({ type: 'file' });
        setName('');
      }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setCreating({ type: 'folder' });
        setName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roomId]);

  const refresh = () => {
    socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
    socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
  };

  const toggle = (id) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const createItem = () => {
    if (!creating || !name.trim()) { setCreating(null); setName(''); return; }
    if (creating.type === 'file') {
      socket.emit('file:create', { roomId, name, folderId: creating.parentId || null }, () => {
        setCreating(null); setName(''); refresh();
      });
    } else {
      socket.emit('folder:create', { roomId, name, parentId: creating.parentId || null }, () => {
        setCreating(null); setName(''); refresh();
      });
    }
  };

  const tree = buildTree(folders, files);

  useEffect(() => {
    if (creating && !creating.parentId) {
      setTimeout(() => {
        try { rootInputRef.current?.focus(); rootInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }, 50);
    }
  }, [creating]);

  const finishRename = (fileId, newName) => {
    if (!fileId) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) { setEditingFileId(null); setEditingName(''); return; }

    // optimistic UI
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: trimmed, language: undefined } : f));

    socket.emit('file:rename', { roomId, fileId, name: trimmed }, (res) => {
      if (res?.error) {
        alert('Rename failed: ' + (res.error || 'unknown'));
        console.error('file:rename', res);
        // revert
        socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
        setEditingFileId(null);
        setEditingName('');
        return;
      }
      // refresh files to ensure language and timestamps are in sync
      socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
      setEditingFileId(null);
      setEditingName('');
    });
  };

  const finishFolderRename = (folderId, newName) => {
    if (!folderId) return;
    const trimmed = (newName || '').trim();
    if (!trimmed) { setEditingFolderId(null); setEditingFolderName(''); return; }

    // optimistic UI: update folders
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f));

    socket.emit('folder:rename', { roomId, folderId, name: trimmed }, (res) => {
      if (res?.error) {
        alert('Rename failed: ' + (res.error || 'unknown'));
        console.error('folder:rename', res);
        // revert
        socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
        setEditingFolderId(null);
        setEditingFolderName('');
        return;
      }
      // refresh folders to ensure timestamps/state
      socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
      setEditingFolderId(null);
      setEditingFolderName('');
    });
  };

  return (
    <div className="flex-1 overflow-auto text-sm">
      {/* Compact Header */}
      <div className="p-2 border-b border-border space-y-2">
        {/* Action Buttons */}
        <div className="flex gap-1 justify-between items-center">
          <div className="flex gap-1">
            <button 
              className="btn btn-xs px-2 py-1 text-xs hover:bg-slate-700 rounded flex items-center gap-1"
              onClick={() => { setCreating({ type: 'file' }); setName(''); }}
              title="New file (Ctrl+Alt+F)"
            >
              <FileIcon size={12} />
              <span>File</span>
            </button>
            <button 
              className="btn btn-xs px-2 py-1 text-xs hover:bg-slate-700 rounded flex items-center gap-1"
              onClick={() => { setCreating({ type: 'folder' }); setName(''); }}
              title="New folder (Ctrl+Alt+D)"
            >
              <FolderIcon size={12} />
              <span>Folder</span>
            </button>
          </div>
          
          {/* Import/Export */}
          <div className="flex gap-1">
            <button
              className="btn btn-xs px-2 py-1 text-xs hover:bg-slate-700 rounded flex items-center gap-1"
              onClick={async () => {
                try {
                  // Prompt the user for a filename (without path). On browsers that support
                  // the File System Access API we will also get a system save dialog that
                  // allows choosing the folder. If that API isn't available the anchor
                  // download will be used and the browser will handle the save location.
                  const defaultName = roomId || 'project';
                  const input = window.prompt('Enter filename for project (without extension):', defaultName);
                  if (!input) return; // cancelled or empty
                  let fname = input.trim();
                  if (!fname) return;
                  // sanitize filename: remove path separators and characters often invalid in filenames
                  fname = fname.replace(/[\\/:"*?<>|]+/g, '-');
                  if (!fname.toLowerCase().endsWith('.zip')) fname += '.zip';
                  await downloadProjectAsZip(folders, files, fname);
                } catch (err) {
                  console.error('Download project failed', err);
                  alert('Could not create project zip. See console');
                }
              }}
              title="Download project"
            >
              <DownloadIcon size={12} />
            </button>
            
            <input 
              type="file" 
              accept=".zip" 
              id="project-zip-input" 
              style={{ display: 'none' }} 
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                  const entries = await unzipFileToEntries(f);
                  if (!entries.length) { alert('Zip contained no files'); e.target.value = ''; return; }

                  const existingPaths = new Set();
                  files.forEach(file => {
                    const folderMap = new Map((folders || []).map(ff => [ff.id, ff]));
                    const parts = [];
                    let cur = folderMap.get(file.folderId);
                    while (cur) { parts.unshift(cur.name); if (!cur.parentId) break; cur = folderMap.get(cur.parentId); }
                    const p = parts.length ? `${parts.join('/')}/${file.name}` : file.name;
                    existingPaths.add(p.replace(/\\+/g, '/'));
                  });

                  const overlapping = entries.filter(en => existingPaths.has(en.path));
                  if (overlapping.length) {
                    const ok = window.confirm(`The uploaded zip will overwrite ${overlapping.length} existing file(s). Proceed?`);
                    if (!ok) { e.target.value = ''; return; }
                  }

                  const batch = entries.map(en => ({ path: en.path, content: en.content }));
                  socket.emit('project:batchUpdate', { roomId, files: batch }, (res) => {
                    if (res?.error) {
                      alert('Upload failed: ' + (res.error || 'unknown'));
                      console.error('project:batchUpdate error', res);
                      return;
                    }
                    socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
                    socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
                    e.target.value = '';
                  });
                } catch (err) {
                  console.error('Failed to read zip', err);
                  alert('Failed to read zip file. See console for details.');
                  e.target.value = '';
                }
              }} 
            />
            <label 
              htmlFor="project-zip-input" 
              className="btn btn-xs px-2 py-1 text-xs hover:bg-slate-700 rounded flex items-center gap-1 cursor-pointer"
              title="Upload project"
            >
              <UploadIcon size={12} />
            </label>
          </div>
        </div>

        {/* Root Create Input */}
        {creating && !creating.parentId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12">New {creating.type}</span>
            <input 
              ref={rootInputRef} 
              className="input input-xs flex-1 px-2 py-1 text-xs" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              onBlur={createItem} 
              onKeyDown={(e) => { 
                if (e.key === 'Enter') createItem(); 
                if (e.key === 'Escape') { setCreating(null); setName(''); } 
              }} 
              autoFocus 
              placeholder={`Enter ${creating.type} name...`}
            />
          </div>
        )}
      </div>

      {/* File Tree */}
      <div className="p-1">
        {tree.length === 0 && (
          <div className="text-center text-muted-foreground py-4 text-xs">
            No files yet. Create a file to get started.
          </div>
        )}
        {tree.map((n) => (
          <Node 
            key={n.id} 
            node={n} 
            level={0} 
            expanded={expanded} 
            toggle={toggle} 
            onCreate={(type, parentId) => setCreating({ type, parentId })} 
            onSelect={(id) => setActiveFileId(id)} 
            creating={creating} 
            name={name} 
            setName={setName} 
            createItem={createItem} 
            roomId={roomId}
            files={files}
            setFiles={setFiles}
            setFolders={setFolders}
            editingFileId={editingFileId}
            setEditingFileId={setEditingFileId}
            editingName={editingName}
            setEditingName={setEditingName}
            finishRename={finishRename}
            editingFolderId={editingFolderId}
            setEditingFolderId={setEditingFolderId}
            editingFolderName={editingFolderName}
            setEditingFolderName={setEditingFolderName}
            finishFolderRename={finishFolderRename}
          />
        ))}
      </div>
    </div>
  );
}

function Node({ node, level, expanded, toggle, onCreate, onSelect, creating, name, setName, createItem, roomId, files, setFiles, setFolders, editingFileId, setEditingFileId, editingName, setEditingName, finishRename, editingFolderId, setEditingFolderId, editingFolderName, setEditingFolderName, finishFolderRename }) {
  const pad = { paddingLeft: `${level * 12 + 8}px` };
  const folderInputRef = useRef(null);

  function FocusInput({ refObj }) {
    useEffect(() => {
      if (refObj?.current) {
        try { 
          refObj.current.focus(); 
          refObj.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
        } catch (e) {}
      }
    }, [refObj]);
    return null;
  }

  if (node.type === 'folder') {
    const isOpen = expanded.has(node.id);
    return (
      <div>
        <div 
          className={`px-1 py-1 rounded cursor-pointer hover:bg-slate-800 flex items-center gap-1 group`} 
          style={pad} 
          onClick={() => toggle(node.id)}
        >
          <span className="text-xs w-3">{isOpen ? '▾' : '▸'}</span>
          <FolderIcon size={14} className="text-blue-400 flex-shrink-0" />
          <span title={node.name} className="truncate text-xs flex-1 min-w-0">{node.name}</span>
          
          {/* Hover Actions */}
          <div className="ml-auto flex gap-0.5 items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              className="btn btn-ghost btn-xs p-1 hover:bg-slate-700 rounded"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isOpen) toggle(node.id); 
                onCreate('file', node.id); 
              }} 
              title="New file"
            >
              <FilePlusIcon size={12} />
            </button>
            <button 
              className="btn btn-ghost btn-xs p-1 hover:bg-slate-700 rounded"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isOpen) toggle(node.id); 
                onCreate('folder', node.id); 
              }} 
              title="New folder"
            >
              <FolderPlusIcon size={12} />
            </button>
            <button 
              className="btn btn-ghost btn-xs p-1 hover:bg-red-500/20 rounded text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                const ok = window.confirm(`Delete folder '${node.name}' and all its contents?`);
                if (!ok) return;
                socket.emit('folder:delete', { roomId, folderId: node.id }, (res) => {
                  if (res?.error) { 
                    alert('Delete failed: ' + (res.error || 'unknown')); 
                    console.error('folder:delete', res); 
                    return; 
                  }
                  socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
                  socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
                });
              }} 
              title="Delete folder"
            >
              <TrashIcon size={12} />
            </button>
            <button
              className="btn btn-ghost btn-xs p-1 hover:bg-slate-700 rounded"
              onClick={(e) => { e.stopPropagation(); setEditingFolderId(node.id); setEditingFolderName(node.name); }}
              title="Rename folder"
            >
              <PencilIcon size={12} />
            </button>
          </div>
        </div>
        
        {isOpen && (
          <div>
            {creating?.parentId === node.id && (
              <div className="flex items-center gap-1 px-1 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}>
                <span className="w-4">
                  {creating.type === 'file' ? <FileIcon size={12} /> : <FolderIcon size={12} />}
                </span>
                <input 
                  ref={folderInputRef} 
                  className="input input-xs flex-1 px-2 py-1 text-xs" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  onBlur={createItem} 
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') createItem(); 
                    if (e.key === 'Escape') { setCreating(null); setName(''); } 
                  }} 
                  autoFocus 
                  placeholder={`Enter ${creating.type} name...`}
                />
              </div>
            )}
            {editingFolderId === node.id && (
              <div className="flex items-center gap-1 px-1 py-1" style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}>
                <span className="w-4"><FolderIcon size={12} /></span>
                <input
                  className="input input-xs flex-1 px-2 py-1 text-xs"
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onBlur={() => finishFolderRename(node.id, editingFolderName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishFolderRename(node.id, editingFolderName);
                    if (e.key === 'Escape') { setEditingFolderId(null); setEditingFolderName(''); }
                  }}
                  autoFocus
                />
              </div>
            )}
            {creating?.parentId === node.id && <FocusInput refObj={folderInputRef} />}
            {node.children.map((child) => (
              <Node 
                key={child.id} 
                node={child} 
                level={level + 1} 
                expanded={expanded} 
                toggle={toggle} 
                onCreate={onCreate} 
                onSelect={onSelect} 
                creating={creating} 
                name={name} 
                setName={setName} 
                createItem={createItem} 
                roomId={roomId}
                files={files}
                setFiles={setFiles}
                setFolders={setFolders}
                    editingFileId={editingFileId}
                    setEditingFileId={setEditingFileId}
                    editingName={editingName}
                    setEditingName={setEditingName}
                    finishRename={finishRename}
                    editingFolderId={editingFolderId}
                    setEditingFolderId={setEditingFolderId}
                    editingFolderName={editingFolderName}
                    setEditingFolderName={setEditingFolderName}
                    finishFolderRename={finishFolderRename}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`px-1 py-1 rounded cursor-pointer hover:bg-slate-800 flex items-center gap-1 group`} 
      style={pad} 
      onClick={() => onSelect(node.id)}
      onDoubleClick={(e) => {
        // Start inline rename for files on double click
        if (node.type === 'file') {
          e.stopPropagation();
          setEditingFileId(node.id);
          setEditingName(node.name);
        }
      }}
    >
      <FileIcon size={14} className="text-gray-400 flex-shrink-0" />
      {editingFileId === node.id ? (
        <input
          className="input input-xs flex-1 px-2 py-1 text-xs"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={() => finishRename(node.id, editingName)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              finishRename(node.id, editingName);
            }
            if (e.key === 'Escape') {
              setEditingFileId(null);
              setEditingName('');
            }
          }}
          autoFocus
        />
      ) : (
        <span title={node.name} className="truncate text-xs flex-1 min-w-0">{node.name}</span>
      )}
      
      {/* Hover Actions */}
      <div className="ml-auto flex gap-0.5 items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="btn btn-ghost btn-xs p-1 hover:bg-slate-700 rounded"
          onClick={(e) => { e.stopPropagation(); setEditingFileId(node.id); setEditingName(node.name); }}
          title="Rename file"
        >
          <PencilIcon size={12} />
        </button>
        <button
          className="btn btn-ghost btn-xs p-1 hover:bg-red-500/20 rounded text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            const ok = window.confirm(`Delete file '${node.name}'? This cannot be undone.`);
            if (!ok) return;

            // Optimistically update UI
            const prev = files;
            setFiles(prev => prev.filter(f => f.id !== node.id));

            socket.emit('file:delete', { roomId, fileId: node.id }, (res) => {
              if (res?.error) {
                alert('Delete failed: ' + (res.error || 'unknown'));
                console.error('file:delete', res);
                // revert by refreshing from server
                socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
                return;
              }
              // confirm success by refreshing
              socket.emit('files:list', { roomId }, (data) => setFiles(data || []));
            });
          }}
          title="Delete file"
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  );
}

// Icon Components
function FileIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FolderIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DownloadIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function UploadIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="17,8 12,3 7,8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FilePlusIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FolderPlusIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TrashIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PencilIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 21v-3.6L14.6 6.8l3.6 3.6L7 21H3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20.7 7.0a1 1 0 0 0 0-1.4L18.4 3.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.6 3.6 1.9-1.7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function buildTree(folders, files) {
  const folderMap = new Map();
  const roots = [];
  folders.forEach((f) => folderMap.set(f.id, { ...f, type: 'folder', children: [] }));
  folders.forEach((f) => {
    const node = folderMap.get(f.id);
    if (f.parentId && folderMap.has(f.parentId)) folderMap.get(f.parentId).children.push(node); 
    else roots.push(node);
  });
  files.forEach((fi) => {
    const node = { ...fi, type: 'file' };
    if (fi.folderId && folderMap.has(fi.folderId)) folderMap.get(fi.folderId).children.push(node); 
    else roots.push(node);
  });
  
  // Sort folders first, then files, alphabetically
  roots.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  
  roots.forEach(node => {
    if (node.type === 'folder') {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
  });
  
  return roots;
}