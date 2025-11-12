import JSZip from 'jszip';

// Build full path for a file using folders array
function buildPathForFile(file, folders) {
  if (!file) return file?.name || '';
  const folderMap = new Map((folders || []).map(f => [f.id, f]));
  const parts = [];
  let cur = folderMap.get(file.folderId);
  while (cur) {
    parts.unshift(cur.name);
    if (!cur.parentId) break;
    cur = folderMap.get(cur.parentId);
  }
  return parts.length ? `${parts.join('/')}/${file.name}` : file.name;
}

export async function createZipBlobFromProject(folders = [], files = []) {
  const zip = new JSZip();
  try {
    files.forEach((f) => {
      const path = buildPathForFile(f, folders);
      // ensure path uses forward slashes
      const normalized = path.replace(/\\+/g, '/');
      zip.file(normalized, f.content ?? '');
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
  } catch (err) {
    console.error('createZipBlobFromProject error', err);
    throw err;
  }
}

export async function downloadProjectAsZip(folders = [], files = [], filename = 'project.zip') {
  const blob = await createZipBlobFromProject(folders, files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function unzipFileToEntries(fileOrArrayBuffer) {
  const jszip = new JSZip();
  const zip = await jszip.loadAsync(fileOrArrayBuffer);
  const entries = [];
  const promises = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      const p = zipEntry.async('string').then((content) => {
        entries.push({ path: relativePath.replace(/\\\\+/g, '/'), content });
      });
      promises.push(p);
    }
  });
  await Promise.all(promises);
  return entries;
}
