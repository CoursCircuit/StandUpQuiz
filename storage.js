/* Sauvegarde atomique et copie de secours, indépendante de l'interface. */
const fs = require('node:fs/promises');
const path = require('node:path');

function checkState(state) {
  if (!state || state.version !== 2 || !Array.isArray(state.lists) || state.lists.length > 500 ||
      typeof state.draft?.text !== 'string' || state.draft.text.length > 1000000 || !state.settings) throw new Error('Sauvegarde invalide.');
  const content = JSON.stringify(state);
  if (Buffer.byteLength(content) > 12000000) throw new Error('La bibliothèque dépasse 12 Mo. Exportez vos listes.');
  return content;
}
class StateStore {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'state-v2.json'); this.queue = Promise.resolve(); this.pending = 0; this.canWrite = false; }
  async read() {
    await fs.mkdir(this.directory, { recursive: true });
    try {
      const content = await fs.readFile(this.file, 'utf8'); const state = JSON.parse(content); checkState(state);
      this.canWrite = true; return { ok: true, state };
    } catch (error) {
      if (error.code === 'ENOENT') { this.canWrite = true; return { ok: true, state: null }; }
      try {
        const state = JSON.parse(await fs.readFile(`${this.file}.bak`, 'utf8')); checkState(state);
        await fs.copyFile(this.file, `${this.file}.damaged-${Date.now()}`);
        await fs.copyFile(`${this.file}.bak`, this.file);
        this.canWrite = true; return { ok: true, state, recovered: true };
      } catch { return { ok: false, error: 'La sauvegarde locale est illisible. Les fichiers ont été conservés. Exportez votre travail avant de quitter.', state: null }; }
    }
  }
  save(state) {
    if (!this.canWrite) return Promise.reject(new Error('La sauvegarde locale est indisponible. Exportez vos listes.'));
    let content;
    try { content = checkState(state); } catch (error) { return Promise.reject(error); }
    this.pending++;
    const task = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      const temp = `${this.file}.tmp`;
      await fs.writeFile(temp, content, { encoding: 'utf8', mode: 0o600 });
      try { await fs.copyFile(this.file, `${this.file}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fs.rename(temp, this.file);
    });
    this.queue = task.finally(() => { this.pending--; });
    return this.queue;
  }
  flush() { return this.queue; }
}
module.exports = { StateStore };
