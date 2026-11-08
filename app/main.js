// Electron main process: a desktop window around lib/editor.html with direct file access.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { APP_DIR, LIB, previewHtml, standaloneHtml } = require('./assemble');

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const CONFIG = () => path.join(app.getPath('userData'), 'config.json');
let win = null;
let workspace = null; // folder holding checklists/ (and optionally colours.toml)
let watchers = [];

// ---------- workspace ----------
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG(), 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG()), { recursive: true });
  fs.writeFileSync(CONFIG(), JSON.stringify(cfg, null, 2));
}
function defaultWorkspace() {
  // From source: this project. Installed: ~/Documents/Checklists.
  return app.isPackaged ? path.join(app.getPath('documents'), 'Checklists') : APP_DIR;
}
const checklistsDir = () => path.join(workspace, 'checklists');
function coloursFile() {
  const own = path.join(workspace, 'colours.toml');
  return fs.existsSync(own) ? own : path.join(APP_DIR, 'colours.toml');
}
function fileFor(name) {
  if (!NAME_RE.test(name)) throw new Error('Bad name: use lowercase letters, digits and dashes');
  return path.join(checklistsDir(), name + '.txt');
}

function setWorkspace(dir) {
  workspace = dir;
  fs.mkdirSync(checklistsDir(), { recursive: true });
  saveConfig({ ...loadConfig(), workspace: dir });
  watch();
  if (win) win.setTitle(`Checklist Editor — ${dir}`);
}

// Tell the editor when checklists change on disk (e.g. edited in VS Code) or when the
// look changes (colours.toml, lib/), so it can reload the file or the preview.
function watch() {
  watchers.forEach(w => w.close());
  watchers = [];
  const timers = {};
  const notify = (channel, arg) => {
    clearTimeout(timers[channel + arg]);
    timers[channel + arg] = setTimeout(() => win && win.webContents.send(channel, arg), 150);
  };
  const add = (dir, fn) => { try { watchers.push(fs.watch(dir, fn)); } catch {} };
  add(checklistsDir(), (_, f) => f && f.endsWith('.txt') && notify('file-changed', f.slice(0, -4)));
  add(workspace, (_, f) => f === 'colours.toml' && notify('assets-changed', ''));
  if (!app.isPackaged) add(LIB, (_, f) => /\.(css|js)$/.test(f || '') && notify('assets-changed', ''));
}

// ---------- IPC for the editor (see preload.js) ----------
ipcMain.handle('list', () =>
  fs.readdirSync(checklistsDir()).filter(f => f.endsWith('.txt')).map(f => f.slice(0, -4)).sort());
ipcMain.handle('read', (_, name) => fs.readFileSync(fileFor(name), 'utf8'));
ipcMain.handle('write', (_, name, text, create) => {
  const file = fileFor(name);
  if (create && fs.existsSync(file)) throw new Error(`${name}.txt already exists`);
  fs.writeFileSync(file, text, 'utf8');
});
ipcMain.handle('starter', (_, title) =>
  fs.readFileSync(path.join(LIB, 'starter.txt'), 'utf8').replaceAll('{name}', title));
ipcMain.handle('preview-html', () => previewHtml(coloursFile(), checklistsDir()));
ipcMain.handle('export-html', async (_, name, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name + '.html'),
    filters: [{ name: 'Web page', extensions: ['html'] }],
  });
  if (canceled) return null;
  fs.writeFileSync(filePath, standaloneHtml(name, text, coloursFile(), checklistsDir()));
  return filePath;
});
ipcMain.handle('export-pdf', async (_, name, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled) return null;
  fs.writeFileSync(filePath, await renderPdf(name, text));
  return filePath;
});
ipcMain.handle('reveal', (_, filePath) => shell.showItemInFolder(filePath));

/** Render a checklist in a hidden window and print it to PDF at its own page size. */
async function renderPdf(name, text) {
  const tmp = path.join(os.tmpdir(), `checklist-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, standaloneHtml(name, text, coloursFile(), checklistsDir()));
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmp);
    // The renderer lays out pages after fonts load; wait until they exist and their images have decoded.
    await pdfWin.webContents.executeJavaScript(`new Promise(r => {
      const t = () => document.querySelector('#out .page')
        ? Promise.all([...document.images].map(i => i.decode().catch(() => {}))).then(() => requestAnimationFrame(() => r(true)))
        : setTimeout(t, 50);
      t();
    })`);
    return await pdfWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
    });
  } finally {
    pdfWin.destroy();
    fs.rm(tmp, () => {});
  }
}

// ---------- window & menu ----------
function send(cmd) { win && win.webContents.send('menu', cmd); }

async function chooseWorkspace() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose the folder for your checklists',
    message: 'Checklists are kept in a "checklists" subfolder. A colours.toml here overrides the default colours.',
    defaultPath: workspace,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return;
  setWorkspace(filePaths[0]);
  send('workspace-changed');
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Checklist…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        // The editor page handles Ctrl+S itself; shown here for discoverability.
        { label: 'Save', accelerator: 'CmdOrCtrl+S', registerAccelerator: false, click: () => send('save') },
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+E', click: () => send('export-pdf') },
        { label: 'Export HTML…', click: () => send('export-html') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
        { type: 'separator' },
        { label: 'Open Folder…', click: chooseWorkspace },
        { label: 'Show Checklists Folder', click: () => shell.openPath(checklistsDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 700, minHeight: 400,
    title: `Checklist Editor — ${workspace}`,
    icon: path.join(APP_DIR, 'build', 'icon.png'), // window/taskbar icon on Linux and Windows
    show: !process.argv.includes('--smoke-test'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(LIB, 'editor.html'));
  // The editor asks before discarding unsaved changes (beforeunload); turn that into a dialog.
  win.webContents.on('will-prevent-unload', e => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Discard changes', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'You have unsaved changes.', detail: 'Close anyway and lose them?',
    });
    if (choice === 0) e.preventDefault();
  });
  // Open external links in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

// `electron . --smoke-test [out.pdf]`: load the editor hidden, export the first checklist to PDF, exit.
async function smokeTest() {
  const out = process.argv[process.argv.indexOf('--smoke-test') + 1] || path.join(os.tmpdir(), 'checklist-smoke.pdf');
  try {
    await new Promise(r => win.webContents.once('did-finish-load', r));
    const state = await win.webContents.executeJavaScript(`new Promise(r => {
      const t = () => document.querySelector('#preview').contentDocument?.querySelector('#out .page')
        ? r({ file: document.querySelector('#file').value, status: document.querySelector('#status').innerText, pages: document.querySelector('#preview').contentDocument.querySelectorAll('.page').length })
        : setTimeout(t, 100);
      t();
    })`);
    console.log('editor:', JSON.stringify(state));
    const png = out.replace(/\.pdf$/, '') + '.png';
    fs.writeFileSync(png, (await win.webContents.capturePage()).toPNG());
    console.log('screenshot:', png);
    const text = fs.readFileSync(fileFor(state.file), 'utf8');
    fs.writeFileSync(out, await renderPdf(state.file, text));
    console.log('pdf:', out, fs.statSync(out).size, 'bytes');
    app.exit(0);
  } catch (e) {
    console.error('smoke test failed:', e);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  setWorkspace(loadConfig().workspace && fs.existsSync(loadConfig().workspace) ? loadConfig().workspace : defaultWorkspace());
  buildMenu();
  createWindow();
  if (process.argv.includes('--smoke-test')) smokeTest();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
