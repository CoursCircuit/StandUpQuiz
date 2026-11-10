const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StateStore } = require('../storage');
const sample = revision => ({ version: 2, lists: [], draft: { text: 'chat;Katze' }, settings: {}, session: null, revision });
async function setup(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'standup-store-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return new StateStore(dir); }

test('une première ouverture puis une écriture se relisent', async t => {
  const s = await setup(t); assert.deepEqual(await s.read(), { ok: true, state: null });
  await s.save(sample(1)); const reloaded = new StateStore(s.directory); assert.deepEqual((await reloaded.read()).state, sample(1));
});
test('les sauvegardes concurrentes gardent la plus récente et une copie précédente', async t => {
  const s = await setup(t); await s.read();
  await Promise.all([s.save(sample(1)),s.save(sample(2)),s.save(sample(3))]);
  assert.equal(JSON.parse(await fs.readFile(s.file)).revision, 3);
  assert.equal(JSON.parse(await fs.readFile(s.file + '.bak')).revision, 2); assert.equal(s.pending, 0);
});
test('une sauvegarde endommagée récupère la copie et préserve le fichier endommagé', async t => {
  const s = await setup(t); await s.read(); await s.save(sample(1)); await s.save(sample(2));
  await fs.writeFile(s.file, 'incomplete'); const result = await s.read();
  assert.equal(result.recovered, true); assert.equal(result.state.revision, 1);
  assert.ok((await fs.readdir(s.directory)).some(f => f.includes('damaged-')));
  await s.save(sample(3)); assert.equal((await s.read()).state.revision, 3);
});
test('sans copie valide, aucun fichier corrompu n’est écrasé', async t => {
  const s = await setup(t); await fs.writeFile(s.file, 'invalid');
  assert.equal((await s.read()).ok, false); await assert.rejects(s.save(sample(1)));
  assert.equal(await fs.readFile(s.file, 'utf8'), 'invalid');
});
test('refuse une sauvegarde invalide et continue à écrire après une erreur', async t => {
  const s = await setup(t); await s.read(); await assert.rejects(s.save({})); await s.save(sample(2));
  assert.equal((await s.read()).state.revision, 2);
});
