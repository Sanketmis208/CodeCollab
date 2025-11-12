import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket.js';
import MonacoEditor from '../widgets/MonacoEditor.jsx';
import ChatPanel from '../widgets/ChatPanel.jsx';
import Whiteboard from '../widgets/Whiteboard.jsx';
import FileExplorer from '../widgets/FileExplorer.jsx';
import VideoCall from '../widgets/VideoCall.jsx';
import Preview from '../widgets/Preview.jsx';

function CopyRoomIdButton({ roomId }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      try { prompt('Copy room id', roomId); } catch (e2) { /* ignore */ }
    }
  };
  return (
    <button 
      title="Copy room id" 
      className={`text-xs px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 font-medium ${
        copied 
          ? 'bg-emerald-500 text-slate-900 border-emerald-400 shadow-lg shadow-emerald-500/25' 
          : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500'
      }`} 
      onClick={doCopy}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy ID
        </>
      )}
    </button>
  );
}

export default function Room({ user, setUser }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('code');
  const [room, setRoom] = useState(null);
  const [localUser, setLocalUser] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({}); // userId -> { fileId, selection, username, ts }
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeFileContent, setActiveFileContent] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [openTabs, setOpenTabs] = useState([]);
  const [unsaved, setUnsaved] = useState({});
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const previewableLangs = ['html', 'javascript', 'python'];
  const activeFileNameForPreview = files.find(f => f.id === activeFileId)?.name;
  const isPreviewable = previewableLangs.includes(guessLang(activeFileNameForPreview));
  const typingTimersRef = useRef({});
  const unsavedRef = useRef({});
  useEffect(() => {
    unsavedRef.current = unsaved;
  }, [unsaved]);

  const tabsRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const doJoin = (u) => {
      if (!mounted) return;
      socket.emit('room:join', { roomId }, (res) => {
        if (res?.error) {
          navigate('/');
        } else {
          setRoom(res.room);
          refreshTree();
        }
      });
    };

    const ensureSessionAndJoin = () => {
      if (user) {
        socket.emit('auth:login', { username: user.username, userId: user.userId }, (res) => {
          if (res?.userId) {
            doJoin(res);
          } else {
            navigate('/');
          }
        });
        return;
      }

      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const parsed = JSON.parse(raw);
          socket.emit('auth:login', { username: parsed.username, userId: parsed.userId }, (res) => {
            if (res?.userId) {
              const u = { userId: res.userId, username: res.username || parsed.username };
              try { localStorage.setItem('user', JSON.stringify(u)); } catch (e) { /* ignore */ }
              setLocalUser(u);
              doJoin(u);
            } else {
              navigate('/');
            }
          });
          return;
        }
      } catch (e) {
        // ignore
      }

      socket.emit('auth:login', { username: 'guest' }, (res) => {
        if (res?.userId) {
          const u = { userId: res.userId, username: res.username || 'guest' };
          try { localStorage.setItem('user', JSON.stringify(u)); } catch (e) { /* ignore */ }
          setLocalUser(u);
          doJoin(u);
        } else {
          navigate('/');
        }
      });
    };

    ensureSessionAndJoin();

    const presenceHandler = ({ participants }) => setParticipants(participants);
    const cursorHandler = ({ userId, username, fileId, selection }) => {
      // keep a timestamp to expire stale cursors
      setRemoteCursors(prev => ({ ...prev, [userId]: { userId, username, fileId, selection, ts: Date.now() } }));
    };
    const filesUpdated = () => refreshTree();
    const fileChanged = ({ fileId, content }) => {
      // If the file is currently active, update the editor only when
      // the local user doesn't have unsaved edits. We avoid overwriting
      // local unsaved buffers to prevent disrupting in-progress typing.
      const localUnsaved = unsavedRef.current || {};
      if (fileId === activeFileId) {
        // Only update the active editor when the local user doesn't have
        // unsaved changes for that file; otherwise we respect the local buffer.
        if (localUnsaved[fileId] === undefined) {
          setActiveFileContent(content);
        }
      } else {
        // Update file list content for files not currently open
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content } : f));
      }
    };

    socket.on('presence:update', presenceHandler);
  socket.on('cursor:update', cursorHandler);
    socket.on('files:updated', filesUpdated);
    socket.on('file:changed', fileChanged);

    return () => {
      socket.off('presence:update', presenceHandler);
      socket.off('cursor:update', cursorHandler);
      socket.off('files:updated', filesUpdated);
      socket.off('file:changed', fileChanged);
      socket.emit('room:leave');
      mounted = false;
    };
  }, [roomId, user, activeFileId]);

  // prune stale remote cursors every 10s (older than 12s)
  useEffect(() => {
    const id = setInterval(() => {
      setRemoteCursors(prev => {
        const now = Date.now();
        const next = { ...prev };
        let changed = false;
        for (const k of Object.keys(next)) {
          if (now - (next[k].ts || 0) > 12000) { delete next[k]; changed = true; }
        }
        return changed ? next : prev;
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Fixed layout: no drag handlers for vertical resizers

  const refreshTree = () => {
    socket.emit('folders:list', { roomId }, (data) => setFolders(data || []));
    socket.emit('files:list', { roomId }, (data) => {
      const list = data || [];
      setFiles(list);
      // update open tab names if necessary
      setOpenTabs(prev => prev.map(t => {
        const found = list.find(f => f.id === t.id);
        return found ? { ...t, name: found.name } : t;
      }));
    });
  };

  const draftKey = (fileId) => `draft:${roomId}:${fileId}`;

  const openFile = (id) => {
    const f = files.find(x => x.id === id);
    if (!f) return;
    setOpenTabs((prev) => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, { id: f.id, name: f.name }];
    });
    setActiveFileId(id);
    try {
      const local = localStorage.getItem(draftKey(id));
      if (local !== null) {
        setUnsaved(prev => ({ ...prev, [id]: local }));
        setActiveFileContent(local);
        return;
      }
    } catch (e) {
      // ignore localStorage errors
    }
    setActiveFileContent(unsaved[id] ?? f?.content ?? '');
  };

  const closeTab = (id) => {
    const savedContent = files.find(x => x.id === id)?.content ?? '';
    const hasUnsaved = unsaved[id] !== undefined && unsaved[id] !== savedContent;
    const finishClose = () => {
      setOpenTabs((prev) => {
        const next = prev.filter(t => t.id !== id);
        if (activeFileId === id) {
          const last = next[next.length - 1];
          if (last) {
            setActiveFileId(last.id);
            const f = files.find(x => x.id === last.id);
            setActiveFileContent((unsaved[last.id] ?? f?.content) || '');
          } else {
            setActiveFileId(null);
            setActiveFileContent('');
          }
        }
        setUnsaved(prev => { const n = { ...prev }; delete n[id]; return n; });
        try { localStorage.removeItem(draftKey(id)); } catch (e) { /* ignore */ }
        return next;
      });
    };

    if (!hasUnsaved) {
      finishClose();
      return;
    }

    const ok = window.confirm('You have unsaved changes in this tab. Save and close? OK = Save & Close, Cancel = Keep');
    if (!ok) return;

    saveFile(unsaved[id], id).then(() => finishClose()).catch(() => {
      finishClose();
    });
  };

  const activeFileName = files.find(f => f.id === activeFileId)?.name || (activeFileId ? 'Untitled' : 'No file selected');

  const saveFile = (content, fileId = activeFileId) => {
    if (!fileId) return Promise.resolve();
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content } : f));
    return new Promise((resolve, reject) => {
      socket.emit('file:update', { roomId, fileId, content }, (res) => {
        if (res?.error) {
          console.warn('Save failed', res.error);
          reject(res);
          return;
        }
        setUnsaved(prev => { const n = { ...prev }; delete n[fileId]; return n; });
        refreshTree();
        resolve(res);
      });
    });
  };

  const createFile = () => {
    const name = prompt('File name (e.g. index.js)');
    if (!name) return;
    socket.emit('file:create', { roomId, name }, () => refreshTree());
  };

  const initials = (user?.username || localUser?.username || 'G').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase();

  return (
    <div className="h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`flex flex-col transition-all duration-300 ease-in-out bg-slate-800/80 border-r border-slate-700/50 backdrop-blur-sm`}
        style={{ width: collapsed ? 56 : 280 }}
      >
        {/* Explorer header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-slate-700/50 bg-slate-800/80">
          <div className="flex items-center gap-2">
            {!collapsed && (
              <div className="font-semibold text-slate-200 text-sm uppercase tracking-wide flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Explorer
              </div>
            )}
          </div>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
            title={collapsed ? 'Expand Explorer' : 'Collapse Explorer'}
            onClick={() => setCollapsed(s => !s)}
          >
            {collapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
        </div>
        {!collapsed && (
          <div className="flex-1 overflow-hidden">
            <FileExplorer roomId={roomId} files={files} setFiles={setFiles} setActiveFileId={openFile} />
          </div>
        )}
      </div>

      {/* static layout: no resizer between explorer and editor */}

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-slate-800/80 border-b border-slate-700/50 px-6 flex items-center justify-between backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button 
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors text-sm font-medium border border-slate-700/50 hover:border-slate-600/50"
              onClick={() => navigate('/')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Home
            </button>
            
            <div className="h-6 w-px bg-slate-700/50"></div>
            
            <div>
              <div className="font-bold text-white">{room?.name || 'Room'}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-mono bg-slate-700/50 px-2 py-1 rounded text-xs border border-slate-600/50">ID: {roomId}</span>
                <CopyRoomIdButton roomId={roomId} />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>{participants.length} online</span>
            </div>
            
            {setUser && (
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 border border-slate-600/50">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-xs font-semibold text-slate-900">
                      {initials}
                    </div>
                    <span className="text-sm text-slate-200">{user?.username || localUser?.username}</span>
                  </div>

                  {/* Hover popover listing participants */}
                  <div className="absolute right-0 mt-2 w-56 bg-slate-800/95 border border-slate-700/50 rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 z-50">
                    <div className="py-2">
                      <div className="px-3 py-1 text-xs text-slate-400 uppercase tracking-wide">Participants</div>
                      <div className="max-h-56 overflow-auto">
                        {participants && participants.length > 0 ? (
                          participants.map(p => {
                            const name = p?.username || p?.userId || String(p);
                            const hint = (name || '').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase();
                            return (
                              <div key={p?.userId || name} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700/50">
                                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">{hint}</div>
                                <div className="text-sm text-slate-200 truncate">{name}</div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-400">No participants</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-red-500/10 border border-slate-700/50 hover:border-red-500/30 transition-colors"
                  onClick={() => {
                    try { localStorage.removeItem('user'); } catch (e) { /* ignore */ }
                    setUser(null);
                    navigate('/auth');
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
  <div className="flex-1 flex min-h-0 bg-slate-900/50 overflow-hidden">
          {/* Editor Area (center) */}
          <div className="min-h-0 flex-1 flex flex-col border-r border-slate-700/50 overflow-hidden">
            {/* Editor Header with Tabs */}
            <div className="px-4 py-2 border-b border-slate-700/50 bg-slate-800/60 flex items-center justify-between backdrop-blur-sm">
              
              {/* Tabs: inner scroll container so only tabs scroll horizontally */}
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <div 
                  ref={tabsRef} 
                  className="flex gap-1 overflow-x-auto whitespace-nowrap w-full scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800 tabs-container"
                  style={{ 
                    scrollbarWidth: 'thin',
                    msOverflowStyle: 'none'
                  }}
                >
                  {openTabs.length === 0 && (
                    <div className="text-sm text-slate-500 italic px-3 py-1.5">No file open</div>
                  )}
                  {openTabs.map((t) => (
                    <div
                      key={t.id}
                      id={`tab-${t.id}`}
                      className={`tab-item inline-flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-b-0 transition-all duration-200 cursor-pointer overflow-hidden min-w-[8rem] max-w-[14rem] group flex-shrink-0 ${
                        t.id === activeFileId 
                          ? 'bg-slate-900 border-slate-600 border-b-slate-900 -mb-px text-white shadow-lg z-10' 
                          : 'bg-slate-800/50 border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 z-0'
                      }`}
                      role="tab"
                      aria-selected={t.id === activeFileId}
                      onClick={() => {
                        if (activeFileId && activeFileId !== t.id) {
                          const pending = unsaved[activeFileId];
                          const saved = files.find(x => x.id === activeFileId)?.content ?? '';
                          if (pending !== undefined && pending !== saved) {
                            saveFile(pending, activeFileId).catch(() => {});
                          }
                        }
                        setActiveFileId(t.id);
                        const f = files.find(x => x.id === t.id);
                        setActiveFileContent(unsaved[t.id] ?? f?.content ?? '');
                        // ensure active tab is visible
                        try {
                          const el = tabsRef.current;
                          const tabEl = document.getElementById(`tab-${t.id}`);
                          if (el && tabEl) {
                            const tabRect = tabEl.getBoundingClientRect();
                            const elRect = el.getBoundingClientRect();
                            if (tabRect.left < elRect.left) el.scrollBy({ left: tabRect.left - elRect.left - 8, behavior: 'smooth' });
                            else if (tabRect.right > elRect.right) el.scrollBy({ left: tabRect.right - elRect.right + 8, behavior: 'smooth' });
                          }
                        } catch (e) { /* ignore */ }
                      }}
                    >
                      <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm truncate font-medium max-w-[10rem]">{t.name}</span>
                      {/* language badge */}
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-md bg-slate-700/30 text-slate-300">{guessLang(files.find(x => x.id === t.id)?.name)}</span>
                      {unsaved[t.id] !== undefined && unsaved[t.id] !== (files.find(x => x.id === t.id)?.content ?? '') && (
                        <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0 animate-pulse" title="Unsaved changes"></span>
                      )}
                      <button
                        className="w-4 h-4 rounded-full hover:bg-slate-600 flex items-center justify-center transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                        title="Close tab"
                        aria-label={`Close ${t.name}`}
                      >
                        <svg className="w-2.5 h-2.5 text-slate-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-1 bg-slate-700/50 rounded-lg p-1 border border-slate-600/50">
                <button 
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    tab === 'code' 
                      ? 'bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-500/10' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600/50'
                  }`}
                  onClick={() => setTab('code')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Code
                </button>
                <button 
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    tab === 'whiteboard' 
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/10' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600/50'
                  }`}
                  onClick={() => setTab('whiteboard')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Whiteboard
                </button>
                <button 
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                    tab === 'preview' 
                      ? 'bg-gradient-to-r from-emerald-500/20 to-lime-500/20 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600/50'
                  }`}
                  onClick={() => { setTab('preview'); if (isPreviewable) setPreviewTrigger(t => t + 1); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A2 2 0 0122 9.618v4.764a2 2 0 01-2.447 1.894L15 14v-4zM3 6h8v12H3z" />
                  </svg>
                  Preview
                </button>
                
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 min-h-0">
              {tab === 'code' && activeFileId ? (
                <MonacoEditor
                  fileId={activeFileId}
                  value={activeFileContent}
                  language={guessLang(files.find(f => f.id === activeFileId)?.name)}
                    remoteCursors={remoteCursors}
                    onCursorChange={(selection) => {
                      // emit to server
                      try { socket.emit('cursor:update', { roomId, fileId: activeFileId, selection }); } catch (e) {}
                    }}
                    onChange={(v, fid) => {
                    setActiveFileContent(v);
                    if (!fid) return;
                    setUnsaved(prev => ({ ...prev, [fid]: v }));
                    try { localStorage.setItem(draftKey(fid), v); } catch (e) { /* ignore */ }

                    // Debounced live-edit broadcast so collaborators see edits
                    // in near real-time without persisting every keystroke.
                    try {
                      if (typingTimersRef.current[fid]) clearTimeout(typingTimersRef.current[fid]);
                      typingTimersRef.current[fid] = setTimeout(() => {
                        socket.emit('file:editing', { roomId, fileId: fid, content: v });
                      }, 300);
                    } catch (e) { /* ignore */ }
                  }}
                  onSave={(content, fid) => {
                    const target = fid || activeFileId;
                    saveFile(content, target).then(() => {
                      if (target) {
                        setUnsaved(prev => { const n = { ...prev }; delete n[target]; return n; });
                        try { localStorage.removeItem(draftKey(target)); } catch (e) { /* ignore */ }
                      }
                    }).catch(() => {});
                  }}
                />
              ) : tab === 'code' && !activeFileId ? (
                <div className="h-full flex items-center justify-center text-slate-500">No file open</div>
              ) : null}
              {tab === 'whiteboard' && (
                <Whiteboard roomId={roomId} />
              )}

              {tab === 'preview' && (
                <Preview
                  language={guessLang(files.find(f => f.id === activeFileId)?.name)}
                  content={activeFileContent}
                  fileName={files.find(f => f.id === activeFileId)?.name || 'preview'}
                  previewTrigger={previewTrigger}
                />
              )}
            </div>
          </div>
          
          {/* static layout: no resizer between editor and right panel */}

          {/* Right Side Panel */}
          <div className="min-h-0 flex flex-col" style={{ width: 360 }}>
            <div className="h-1/2 border-b border-slate-700/50">
              <VideoCall roomId={roomId} participants={(participants || []).map(p => (p && p.userId) || p)} self={user || localUser} />
            </div>
            <div className="flex-1">
              <ChatPanel roomId={roomId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function guessLang(name) {
  if (!name) return 'javascript';
  const ext = name.split('.').pop();
  if (ext === 'txt') return 'plaintext';
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx') return 'javascript';
  if (ext === 'json') return 'json';
  if (ext === 'css') return 'css';
  if (ext === 'html') return 'html';
  if (ext === 'py') return 'python';
  if (ext === 'java') return 'java';
  return 'javascript';
}