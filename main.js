/* © Sylvain Bovat. Tous droits réservés. */
const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, powerSaveBlocker, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { StateStore } = require('./storage');
const C = require('./core');

app.setPath('userData', process.env.STANDUP_DATA_DIR || path.join(app.getPath('appData'), 'StandUp Quiz'));
let win;
let blocker;
let store;
let audience;
let latestView = C.publicView(null);
const entryURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const audienceURL = pathToFileURL(path.join(__dirname, 'projection.html')).href;

function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url.split('#')[0] !== entryURL) throw new Error('Accès refusé.');
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    trusted(event);
    try { return await fn(...args); }
    catch (error) { return { ok: false, error: error.message || 'Opération impossible.' }; }
  });
}
function registerBridge() {
  handle('quiz:read', () => store.read());
  handle('quiz:save', async value => { await store.save(value); return { ok: true }; });
  handle('quiz:copy', text => {
    if (typeof text !== 'string' || text.length > 2000000) throw new Error('Texte trop long.');
    clipboard.writeText(text); return { ok: true };
  });
  handle('quiz:fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return { ok: true }; });
  handle('quiz:displays', () => {
    const current = screen.getDisplayMatching(win.getBounds());
    return { ok: true, displays: screen.getAllDisplays().map((d, i) => ({ id: d.id, name: d.label || `Écran ${i + 1}`,
      width: d.size.width, height: d.size.height, current: d.id === current.id })) };
  });
  handle('quiz:audience-open', ({ displayId } = {}) => {
    if (audience && !audience.isDestroyed()) { audience.show(); audience.focus(); return { ok: true }; }
    const display = screen.getAllDisplays().find(d => d.id === displayId) || screen.getDisplayMatching(win.getBounds());
    const external = screen.getDisplayMatching(win.getBounds()).id !== display.id;
    audience = new BrowserWindow({ ...display.workArea, width: Math.min(display.workArea.width, 1440), height: Math.min(display.workArea.height, 940),
      minWidth: 780, minHeight: 500, title: 'StandUp Quiz — Écran élèves', backgroundColor: '#f5f6fc', show: false,
      webPreferences: { preload: path.join(__dirname, 'projection-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
    const window = audience;
    secureWindow(window, audienceURL);
    window.loadFile(path.join(__dirname, 'projection.html'));
    window.once('ready-to-show', () => { window.show(); if (external) window.setFullScreen(true); });
    window.on('closed', () => { audience = null; if (win && !win.isDestroyed()) win.webContents.send('quiz:audience-closed'); });
    return { ok: true };
  });
  handle('quiz:audience-close', () => { if (audience && !audience.isDestroyed()) audience.close(); return { ok: true }; });
  handle('quiz:present', ({ game, screen: viewScreen }) => {
    const valid = game ? C.validateSession(game) : null;
    if (game && !valid) throw new Error('La partie ne peut pas être projetée.');
    if (valid && game.phase === 'thinking') valid.phase = 'thinking';
    latestView = C.publicView(valid, viewScreen === 'setup' ? 'setup' : 'game');
    if (audience && !audience.isDestroyed()) audience.webContents.send('quiz:view', latestView);
    return { ok: true };
  });
  const audienceHandle = (name, fn) => ipcMain.handle(name, event => {
    if (!audience || event.sender !== audience.webContents || event.senderFrame !== audience.webContents.mainFrame || event.senderFrame?.url.split('#')[0] !== audienceURL) throw new Error('Accès refusé.');
    return fn();
  });
  audienceHandle('quiz:audience-view', () => latestView);
  audienceHandle('quiz:audience-fullscreen', () => { audience.setFullScreen(!audience.isFullScreen()); return { ok: true }; });
  handle('quiz:projection', active => {
    if (active === true && blocker === undefined) blocker = powerSaveBlocker.start('prevent-display-sleep');
    else if (active !== true && blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
    return { ok: true };
  });
  handle('quiz:export', async ({ name, content, type }) => {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 12000000) throw new Error('Fichier trop volumineux.');
    const extension = type === 'csv' ? 'csv' : type === 'txt' ? 'txt' : 'standup';
    const safeName = String(name || 'StandUp Quiz').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
    const result = await dialog.showSaveDialog(win, { title: 'Exporter', defaultPath: `${safeName}.${extension}`,
      filters: [{ name: extension === 'standup' ? 'Bibliothèque StandUp Quiz' : 'Texte', extensions: [extension] }] });
    if (result.canceled || !result.filePath) return { ok: true, canceled: true };
    await fs.writeFile(result.filePath, content, 'utf8'); return { ok: true };
  });
  handle('quiz:import', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Importer des questions ou une bibliothèque', properties: ['openFile'],
      filters: [{ name: 'Listes et bibliothèques', extensions: ['txt', 'csv', 'tsv', 'standup', 'json'] }] });
    if (result.canceled || !result.filePaths.length) return { ok: true, canceled: true };
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 12000000) throw new Error('Le fichier dépasse 12 Mo.');
    const bytes = await fs.readFile(file);
    let content;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) content = new TextDecoder('utf-16le').decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) content = new TextDecoder('utf-16be').decode(bytes);
    else { content = new TextDecoder('utf-8').decode(bytes); if (content.includes('\ufffd')) content = new TextDecoder('windows-1252').decode(bytes); }
    return { ok: true, name: path.basename(file), content };
  });
}
function secureWindow(window, url) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => { if (target.split('#')[0] !== url) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 940, minWidth: 780, minHeight: 620, backgroundColor: '#f5f6fc',
    title: 'StandUp Quiz', icon: path.join(__dirname, 'assets', 'icon.icns'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  secureWindow(win, entryURL);
  win.on('closed', () => {
    win = null; latestView = C.publicView(null); if (audience && !audience.isDestroyed()) audience.close();
    if (blocker !== undefined) { powerSaveBlocker.stop(blocker); blocker = undefined; }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    else if (app.isReady()) createWindow();
  });
  app.whenReady().then(() => {
    store = new StateStore(app.getPath('userData'));
    registerBridge();
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'StandUp Quiz', submenu: [{ label: 'À propos de StandUp Quiz', role: 'about' }, { type: 'separator' }, { label: 'Masquer StandUp Quiz', role: 'hide' }, { label: 'Masquer les autres', role: 'hideOthers' }, { label: 'Tout afficher', role: 'unhide' }, { type: 'separator' }, { label: 'Quitter StandUp Quiz', role: 'quit' }] },
      { label: 'Édition', submenu: [{ label: 'Annuler', role: 'undo' }, { label: 'Rétablir', role: 'redo' }, { type: 'separator' }, { label: 'Couper', role: 'cut' }, { label: 'Copier', role: 'copy' }, { label: 'Coller', role: 'paste' }, { label: 'Tout sélectionner', role: 'selectAll' }] },
      { label: 'Affichage', submenu: [{ label: 'Plein écran', role: 'togglefullscreen' }, { type: 'separator' }, { label: 'Taille réelle', role: 'resetZoom' }, { label: 'Agrandir', role: 'zoomIn' }, { label: 'Réduire', role: 'zoomOut' }] },
      { label: 'Fenêtre', role: 'windowMenu', submenu: [{ label: 'Réduire la fenêtre', role: 'minimize' }, { label: 'Agrandir la fenêtre', role: 'zoom' }, { label: 'Tout ramener au premier plan', role: 'front' }] }
    ]));
    createWindow();
    app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  let quitting = false;
  app.on('before-quit', event => {
    if (!quitting && store?.pending) {
      event.preventDefault(); quitting = true; store.flush().finally(() => app.quit());
    }
  });
}
