const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

async function harness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'standup-lifecycle-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const windows = []; const handlers = new Map();
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: pathToFileURL(path.resolve(__dirname, '../index.html')).href };
      this.webContents.session = { setPermissionRequestHandler() {} };
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (name, payload) => { this.messages ??= []; this.messages.push({ name, payload }); };
      this.destroyed = false; windows.push(this);
    }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; } show() { this.shown = true; } focus() { this.focused = true; }
    getBounds() { return { x: 0, y: 0, width: 1440, height: 900 }; }
    setFullScreen(value) { this.fullscreen = value; } isFullScreen() { return this.fullscreen === true; }
    close() { this.closeForTest(); }
    isMinimized() { return this.minimized === true; } restore() { this.minimized = false; }
    isDestroyed() { return this.destroyed; }
    closeForTest() { this.destroyed = true; this.emit('closed'); }
    static getAllWindows() { return windows.filter(w => !w.destroyed); }
  }
  const app = new EventEmitter();
  Object.assign(app, { setPath() {}, getPath: () => directory, requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(), isReady: () => true, quit() {} });
  const electron = { app, BrowserWindow: Window, Menu: { setApplicationMenu() {}, buildFromTemplate: x => x },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, dialog: {}, clipboard: {}, powerSaveBlocker: { start: () => 1, stop() {} },
    screen: { getDisplayMatching: () => ({ id: 1 }), getAllDisplays: () => [1,2].map(id => ({ id, label: `Écran ${id}`, size: { width: 1440, height: 900 }, workArea: { x: (id - 1) * 1440, y: 0, width: 1440, height: 900 } })) } };
  const source = await fs.readFile(path.resolve(__dirname, '../main.js'), 'utf8');
  vm.runInNewContext(source, { require: name => name === 'electron' ? electron : name === './storage' ? require('../storage') : name === './core' ? require('../core') : require(name),
    __dirname: path.resolve(__dirname, '..'), process: { env: { STANDUP_DATA_DIR: directory }, platform: 'darwin' }, console });
  await Promise.resolve();
  return { app, windows, handlers };
}

test('la fenêtre native active explicitement isolation et sandbox', async t => {
  const h = await harness(t); assert.equal(h.windows.length, 1);
  const prefs = h.windows[0].options.webPreferences;
  assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true); assert.equal(prefs.nodeIntegration, false);
});
test('la projection est facultative, réutilisable et privée avant révélation', async t => {
  const h = await harness(t); const teacher = h.windows[0];
  const teacherEvent = { sender: teacher.webContents, senderFrame: teacher.webContents.mainFrame };
  const C = require('../core');
  const g = C.prepareGame(Array.from({ length: 6 }, (_, i) => ({ front: `q${i}`, back: `r${i}` })), { seconds: 0, rounds: 5 }, 'Test');
  C.startRound(g);
  assert.equal(h.windows.length, 1);
  assert.equal((await h.handlers.get('quiz:present')(teacherEvent, { game: g, screen: 'game' })).ok, true);
  await h.handlers.get('quiz:audience-open')(teacherEvent, { displayId: 2 });
  assert.equal(h.windows.length, 2); const student = h.windows[1]; student.emit('ready-to-show');
  assert.equal(student.fullscreen, true); assert.equal(student.options.x, 1440);
  const studentEvent = { sender: student.webContents, senderFrame: student.webContents.mainFrame };
  const before = h.handlers.get('quiz:audience-view')(studentEvent);
  assert.equal(before.answer, undefined); assert.equal(before.correctTeam, undefined); assert.equal(before.pairs, undefined);
  assert.equal(before.question, g.round.question);
  await assert.rejects(h.handlers.get('quiz:read')(studentEvent), /Accès refusé/);
  await assert.rejects(h.handlers.get('quiz:save')(studentEvent, {}), /Accès refusé/);
  assert.throws(() => h.handlers.get('quiz:audience-view')(teacherEvent), /Accès refusé/);
  await h.handlers.get('quiz:audience-open')(teacherEvent); assert.equal(h.windows.length, 2);
  C.reveal(g); await h.handlers.get('quiz:present')(teacherEvent, { game: g, screen: 'game' });
  assert.equal(student.webContents.mainFrame.url.endsWith('/projection.html'), true);
  assert.equal(h.handlers.get('quiz:audience-view')(studentEvent).answer, g.round.answer);
  await h.handlers.get('quiz:audience-close')(teacherEvent);
  assert.equal(student.destroyed, true); assert.equal(teacher.messages.at(-1).name, 'quiz:audience-closed');
});
test('fermer le poste enseignant ferme aussi la projection et permet une nouvelle ouverture', async t => {
  const h = await harness(t); const w = h.windows[0]; const e = { sender: w.webContents, senderFrame: w.webContents.mainFrame };
  await h.handlers.get('quiz:audience-open')(e, { displayId: 1 }); w.closeForTest();
  assert.equal(h.windows[1].destroyed, true); h.app.emit('activate'); assert.equal(h.windows.length, 3);
});
test('une seconde ouverture recrée une fenêtre fermée et restaure une fenêtre minimisée', async t => {
  const h = await harness(t); h.windows[0].closeForTest(); h.app.emit('second-instance');
  assert.equal(h.windows.length, 2); h.windows[1].minimized = true; h.app.emit('second-instance');
  assert.equal(h.windows.length, 2); assert.equal(h.windows[1].minimized, false); assert.equal(h.windows[1].focused, true);
});
test('une activation macOS recrée la fenêtre après fermeture', async t => {
  const h = await harness(t); h.windows[0].closeForTest(); h.app.emit('activate'); assert.equal(h.windows.length, 2);
});
test('la navigation accessible par ancre conserve le pont et une source étrangère est refusée', async t => {
  const h = await harness(t); const web = h.windows[0].webContents; web.mainFrame.url += '#wordInput';
  const event = { sender: web, senderFrame: web.mainFrame };
  assert.equal((await h.handlers.get('quiz:read')(event)).ok, true);
  await assert.rejects(h.handlers.get('quiz:read')({ sender: {}, senderFrame: web.mainFrame }), /Accès refusé/);
});
