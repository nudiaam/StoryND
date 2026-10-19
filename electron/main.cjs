const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, session, Menu, clipboard, ClipboardItem } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const isDev = process.argv.includes('--dev');
// A project is one file, "Name.storyboard", holding all its versions; its
// pictures and videos live in a folder beside it ("Name.storyboard-media").
// Projects from before (a folder with proyecto.storyboard.json and assets/)
// are turned into a file the first time they are opened.
const EXT = '.storyboard';
const OLD_PROJECT_FILE = 'proyecto.storyboard.json';
const MAX_RECENTS = 12;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);
const VIDEO_MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const MEDIA_EXT = new Set([...IMAGE_EXT, ...Object.keys(VIDEO_MIME)]);
const MIME_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/bmp': '.bmp', 'image/avif': '.avif',
};

// The app is called StoryND. Its settings (recent projects) stay in the
// folder they always used.
app.setName('StoryND');
app.setPath('userData', path.join(app.getPath('appData'), 'app-storyboard'));

let win = null;
let current = null; // { file, mediaDir, doc }

// A .storyboard file the app was opened with (double click in the Explorer).
const fileArg = (argv) => argv.slice(1).find((a) => a.toLowerCase().endsWith(EXT));
let startFile = fileArg(process.argv);

// Only one window: opening another file while the app is open opens it there.
const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
app.on('second-instance', (_e, argv) => {
  const file = fileArg(argv);
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  if (file) win.webContents.send('app:openFile', file);
});
let backedUp = false;
let deletedVersion = null; // the last deleted version, to bring it back
let allowClose = false;

// sb://asset/<name> serves files from the open project's media folder.
protocol.registerSchemesAsPrivileged([
  // corsEnabled: the page can copy a frame of an animated image (to freeze it).
  { scheme: 'sb', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const configPath = () => path.join(app.getPath('userData'), 'config.json');

// Tolerates the invisible byte-order mark some editors put at the start.
const parseJson = (text) => JSON.parse(text.replace(/^﻿/, ''));

async function readConfig() {
  try { return parseJson(await fs.readFile(configPath(), 'utf8')); } catch { return {}; }
}

async function writeConfig(config) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2));
}

const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const uid = () => crypto.randomBytes(5).toString('hex');
const nameOf = (file) => path.basename(file, EXT);
const today = () => new Date().toISOString();

// Writes through a temporary file, so a crash never leaves half a project.
async function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, text);
  try {
    await fs.rename(tmp, file);
  } catch {
    await fs.writeFile(file, text);
    await fs.rm(tmp, { force: true });
  }
}

const newDoc = (data, media) => {
  const id = uid();
  return { app: 'storyboard', format: 3, media, current: id, versions: [{ id, name: 'Versión 1', created: today(), updated: today(), data }] };
};

async function writeDoc() {
  const { file, doc } = current;
  if (!backedUp) {
    // One copy per session, taken before the first overwrite.
    try { await fs.copyFile(file, file + '.bak'); } catch {}
    backedUp = true;
  }
  await writeAtomic(file, JSON.stringify(doc, null, 1));
}

async function addRecent(file) {
  const config = await readConfig();
  const list = (config.recents || []).filter((r) => r.file !== file);
  list.unshift({ file, opened: today() });
  config.recents = list.slice(0, MAX_RECENTS);
  delete config.lastProject;
  await writeConfig(config);
}

const versionList = (doc) => doc.versions.map(({ id, name, created, updated }) => ({ id, name, created, updated }));

// What the page needs to show a project: its name, its versions and the
// data of the version in use.
function opened() {
  const { file, doc } = current;
  const v = doc.versions.find((x) => x.id === doc.current) || doc.versions[0];
  win?.setTitle('StoryND');
  return { file, name: nameOf(file), versions: versionList(doc), current: v.id, data: v.data };
}

async function useDoc(file, doc) {
  const mediaDir = path.join(path.dirname(file), doc.media || path.basename(file) + '-media');
  await fs.mkdir(mediaDir, { recursive: true });
  current = { file, mediaDir, doc };
  backedUp = false;
  deletedVersion = null;
  await addRecent(file);
  return opened();
}

// A project from before: a folder with proyecto.storyboard.json and assets/.
// It becomes "<folder>.storyboard" inside that folder, still using assets/.
async function convertFolder(dir) {
  const target = path.join(dir, path.basename(dir) + EXT);
  if (await exists(target)) return target;
  const data = parseJson(await fs.readFile(path.join(dir, OLD_PROJECT_FILE), 'utf8'));
  await writeAtomic(target, JSON.stringify(newDoc(data, 'assets'), null, 1));
  return target;
}

async function openFile(file) {
  if (path.basename(file).toLowerCase() === OLD_PROJECT_FILE) file = await convertFolder(path.dirname(file));
  if (!(await exists(file))) return { error: 'No se encuentra el archivo. ¿Lo has movido o borrado?' };
  let doc;
  try {
    doc = parseJson(await fs.readFile(file, 'utf8'));
  } catch {
    return { error: 'Ese archivo no es un proyecto de StoryND.' };
  }
  if (!doc.versions) doc = newDoc(doc, path.basename(file) + '-media');
  return useDoc(file, doc);
}

function assetsDir() {
  if (!current) throw new Error('No hay ningún proyecto abierto');
  return current.mediaDir;
}

function safeAssetPath(name) {
  const base = assetsDir();
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) throw new Error('Ruta no válida');
  return full;
}

function newAssetName(original, ext) {
  const stem = path.basename(original, path.extname(original))
    .normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'imagen';
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}-${stem}${ext}`;
}

ipcMain.handle('project:new', async () => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Nuevo proyecto',
    defaultPath: path.join(app.getPath('documents'), 'Proyecto' + EXT),
    buttonLabel: 'Crear',
    filters: [{ name: 'Proyecto de StoryND', extensions: ['storyboard'] }],
  });
  if (r.canceled || !r.filePath) return null;
  const file = r.filePath.toLowerCase().endsWith(EXT) ? r.filePath : r.filePath + EXT;
  const doc = newDoc(null, path.basename(file) + '-media');
  await writeAtomic(file, JSON.stringify(doc, null, 1));
  return useDoc(file, doc);
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Abrir proyecto',
    properties: ['openFile'],
    filters: [{ name: 'Proyectos de StoryND', extensions: ['storyboard', 'json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return openFile(r.filePaths[0]);
});

ipcMain.handle('project:openFile', (_e, file) => openFile(file));

ipcMain.handle('project:openLast', async () => {
  const config = await readConfig();
  try {
    if (startFile) {
      const file = startFile;
      startFile = null;
      const r = await openFile(file);
      if (!r.error) return r;
    }
    if (config.recents?.length) {
      const r = await openFile(config.recents[0].file);
      return r.error ? null : r;
    }
    // Last project from before this format: a folder.
    if (config.lastProject && (await exists(path.join(config.lastProject, OLD_PROJECT_FILE)))) {
      return await openFile(path.join(config.lastProject, OLD_PROJECT_FILE));
    }
  } catch {}
  return null;
});

ipcMain.handle('project:save', async (_e, data) => {
  if (!current) throw new Error('No hay ningún proyecto abierto');
  const v = current.doc.versions.find((x) => x.id === current.doc.current);
  v.data = data;
  v.updated = today();
  await writeDoc();
  return true;
});

ipcMain.handle('recents:list', async () => {
  const config = await readConfig();
  const list = config.recents || [];
  return Promise.all(list.map(async (r) => ({ ...r, name: nameOf(r.file), folder: path.dirname(r.file), exists: await exists(r.file) })));
});

ipcMain.handle('recents:forget', async (_e, file) => {
  const config = await readConfig();
  config.recents = (config.recents || []).filter((r) => r.file !== file);
  await writeConfig(config);
});

// ---------- versions (all inside the same file) ----------

ipcMain.handle('versions:create', async (_e, name) => {
  const { doc } = current;
  const from = doc.versions.find((x) => x.id === doc.current);
  const v = { id: uid(), name: name || `Versión ${doc.versions.length + 1}`, created: today(), updated: today(), data: JSON.parse(JSON.stringify(from.data)) };
  doc.versions.push(v);
  doc.current = v.id;
  await writeDoc();
  return opened();
});

ipcMain.handle('versions:switch', async (_e, id) => {
  if (!current.doc.versions.some((x) => x.id === id)) return opened();
  current.doc.current = id;
  await writeDoc();
  return opened();
});

ipcMain.handle('versions:rename', async (_e, { id, name }) => {
  const v = current.doc.versions.find((x) => x.id === id);
  if (v && name.trim()) v.name = name.trim().slice(0, 60);
  await writeDoc();
  return opened();
});

ipcMain.handle('versions:delete', async (_e, id) => {
  const { doc } = current;
  if (id === doc.current || doc.versions.length < 2) return opened();
  const index = doc.versions.findIndex((x) => x.id === id);
  if (index < 0) return opened();
  deletedVersion = { index, version: doc.versions[index] };
  doc.versions.splice(index, 1);
  await writeDoc();
  return opened();
});

ipcMain.handle('versions:restore', async () => {
  if (deletedVersion) {
    current.doc.versions.splice(deletedVersion.index, 0, deletedVersion.version);
    deletedVersion = null;
    await writeDoc();
  }
  return opened();
});

ipcMain.handle('assets:importPaths', async (_e, paths) => {
  const out = [];
  for (const p of paths) {
    const ext = path.extname(p).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const name = newAssetName(p, ext === '.jpeg' ? '.jpg' : ext);
    await fs.copyFile(p, path.join(assetsDir(), name));
    out.push({ asset: name, original: path.basename(p) });
  }
  return out;
});

ipcMain.handle('assets:importBuffer', async (_e, { name, type, bytes }) => {
  let ext = path.extname(name || '').toLowerCase();
  if (!MEDIA_EXT.has(ext)) ext = MIME_EXT[type] || '.png';
  const asset = newAssetName(name || 'pegado', ext);
  await fs.writeFile(path.join(assetsDir(), asset), Buffer.from(bytes));
  return asset;
});

ipcMain.handle('assets:importUrl', async (_e, url) => {
  if (!/^https?:\/\//i.test(url)) return null;
  const res = await net.fetch(url);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!res.ok || !MIME_EXT[type]) return null;
  const asset = newAssetName(new URL(url).pathname.split('/').pop() || 'web', MIME_EXT[type]);
  await fs.writeFile(path.join(assetsDir(), asset), Buffer.from(await res.arrayBuffer()));
  return asset;
});

ipcMain.handle('assets:remove', async (_e, names) => {
  for (const n of names) {
    try { await fs.rm(safeAssetPath(n), { force: true }); } catch {}
  }
});

ipcMain.handle('dialog:pickImages', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Elige imágenes',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imágenes', extensions: [...IMAGE_EXT].map((e) => e.slice(1)) }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog:pickMedia', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Elige imágenes o vídeos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imágenes y vídeos', extensions: [...MEDIA_EXT].map((e) => e.slice(1)) }],
  });
  return r.canceled ? [] : r.filePaths;
});

// Videos are served with byte ranges so they can play, loop and seek.
async function serveVideo(req, full, type) {
  const { size } = await fs.stat(full);
  const range = req.headers.get('range');
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
  if (!range) {
    return new Response(Readable.toWeb(fsSync.createReadStream(full)), { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1] && m[2]) { start = size - parseInt(m[2], 10); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(Readable.toWeb(fsSync.createReadStream(full, { start, end })), {
    status: 206,
    headers: { ...base, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
  });
}

ipcMain.handle('shell:openExternal', async (_e, url) => {
  if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
});

// Right click on a picture: the menu answers whether "Copiar imagen" was chosen.
ipcMain.handle('menu:image', (e) => new Promise((resolve) => {
  Menu.buildFromTemplate([{ label: 'Copiar imagen', click: () => resolve(true) }]).popup({
    window: BrowserWindow.fromWebContents(e.sender),
    // Closing comes before or after the click depending on the system.
    callback: () => setTimeout(() => resolve(false), 100),
  });
}));

// The picture comes as PNG bytes, already turned the way it is seen.
ipcMain.handle('clipboard:image', (_e, bytes) =>
  clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]));

ipcMain.on('app:closeReady', () => {
  allowClose = true;
  win?.close();
});

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    backgroundColor: '#ecebe5',
    autoHideMenuBar: true,
    title: 'StoryND',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // No menu bar: otherwise Alt (used to copy while dragging) shows it.
  win.setMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Give the page a moment to flush pending saves before closing.
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('app:flush');
    setTimeout(() => { allowClose = true; win?.close(); }, 2500);
  });
  // The window shows the project and version, not the page's own title.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });

  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  if (!firstInstance) return;
  // Reading the installed fonts (typography cards) needs this permission.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'local-fonts'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts');

  // YouTube and Vimeo refuse to play embeds from a local page without a referrer.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*', 'https://player.vimeo.com/*', 'https://vimeo.com/*'] },
    (details, callback) => {
      details.requestHeaders.Referer = 'https://storyboard.local/';
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  protocol.handle('sb', async (req) => {
    try {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ''));
      const full = safeAssetPath(name);
      const videoType = VIDEO_MIME[path.extname(full).toLowerCase()];
      if (videoType) return await serveVideo(req, full, videoType);
      // Readable by the page (to measure how light a picture is for captions).
      const res = await net.fetch(pathToFileURL(full).toString());
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response('No encontrado', { status: 404 });
    }
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
