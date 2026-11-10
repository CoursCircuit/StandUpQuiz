const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core');
const pairs = Array.from({ length: 12 }, (_, i) => ({ front: `mot ${i}`, back: `Wort ${i}` }));
function rng(seed = 21) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function game(options = {}) { return C.prepareGame(pairs, { ...C.defaults, rounds: 10, ...options }, 'Classe', rng()); }

test('importe les colonnes de tableur et les retours Windows', () => {
  assert.deepEqual(C.parseWordList('\ufeffchat\tKatze\r\nchien\tHund\r\n').pairs, [{ front: 'chat', back: 'Katze' }, { front: 'chien', back: 'Hund' }]);
});
test('accepte les séparateurs usuels sans diviser les traits d’union', () => {
  for (const separator of [';', ',', '\t', ' | ', ' → ', ' => ', '=', ' = ', ' : ', ' – ', ' — ', ' - ']) {
    const result = C.parseWordList(`un arc-en-ciel${separator}ein Regenbogen`);
    assert.deepEqual(result.pairs, [{ front: 'un arc-en-ciel', back: 'ein Regenbogen' }], separator);
  }
});
test('préserve les virgules et les guillemets dans les cellules CSV', () => {
  const text = '"bonjour, madame","Guten Tag, Frau"\n"il dit ""oui""";"er sagt ""ja"""';
  assert.deepEqual(C.parseWordList(text).pairs, [{ front: 'bonjour, madame', back: 'Guten Tag, Frau' }, { front: 'il dit "oui"', back: 'er sagt "ja"' }]);
});
test('détecte les colonnes de trop, cellules vides et guillemets ouverts', () => {
  assert.equal(C.parseWordList('a;b;c\na;\nseul\n"a;b').errors.length, 4);
});
test('importe les listes numérotées et les tableaux Markdown', () => {
  const result = C.parseWordList('```text\n| Français | Allemand |\n| --- | --- |\n| le chat | die Katze |\n```\n2. le chien ; der Hund\n• la vache ; die Kuh');
  assert.equal(result.headers, 1); assert.equal(result.errors.length, 0); assert.equal(result.pairs.length, 3);
});
test('accepte des paires séparées par des virgules sur une seule ligne', () => {
  assert.equal(C.parseWordList('chat = Katze, chien = Hund, cheval → Pferd').pairs.length, 3);
  assert.equal(C.parseWordList('chat;Katze, chien;Hund, cheval;Pferd').pairs.length, 3);
  assert.equal(C.parseWordList('chat=Katze, chien=Hund, cheval=Pferd').pairs.length, 3);
});
test('respecte les majuscules qui changent le sens, notamment sie et Sie', () => {
  const parsed = C.parseWordList('sie;elle\nSie;vous\nwir;nous');
  assert.equal(parsed.pairs.length, 3); assert.equal(C.orientPairs(parsed.pairs).length, 3);
  const g = C.prepareGame(parsed.pairs, { ...C.defaults, teams: 3, rounds: 3, direction: 'reverse' }, 'Pronoms');
  assert.equal(g.pairs.length, 3); assert.equal(g.settings.words, 2);
});
test('supprime les doublons exacts après normalisation Unicode', () => {
  const result = C.parseWordList('école;Schule\ne\u0301cole ; Schule\nchat;Katze');
  assert.equal(result.duplicates, 1); assert.equal(result.pairs.length, 2);
});
test('la sérialisation est réversible, même avec séparateurs et guillemets', () => {
  const source = [{ front: 'un ; deux', back: 'a,b' }, { front: 'dit "oui"', back: 'sagt "ja"' }];
  assert.deepEqual(C.parseWordList(C.serializePairs(source)).pairs, source);
});
test('regroupe les traductions d’une même question dans les deux sens', () => {
  assert.deepEqual(C.orientPairs([{ front: 'a', back: 'x' }, { front: 'a', back: 'y' }]), [{ front: 'a', back: 'x / y' }]);
  assert.deepEqual(C.orientPairs([{ front: 'a', back: 'x' }, { front: 'b', back: 'x' }], 'reverse'), [{ front: 'x', back: 'a / b' }]);
});
test('rejette les listes trop courtes et accepte trois paires', () => {
  assert.throws(() => C.prepareGame(pairs.slice(0, 2), {}, 'x'));
  const g = C.prepareGame(pairs.slice(0, 3), { ...C.defaults, teams: 3, rounds: 3, words: 5 }, 'x'); assert.equal(g.settings.words, 2);
});
test('le tirage garantit une seule bonne réponse et aucun doublon dans une équipe', () => {
  for (let seed = 1; seed <= 120; seed++) for (let teams = 2; teams <= 6; teams++) {
    const g = game({ teams, rounds: teams * 2, words: seed % 4 + 2 }); C.startRound(g, rng(seed));
    const r = g.round;
    assert.equal(r.columns.flat().filter(v => v === r.answer).length, 1);
    assert.ok(r.columns[r.correctTeam].includes(r.answer));
    for (const column of r.columns) { assert.equal(column.length, g.settings.words); assert.equal(new Set(column).size, column.length); }
  }
});
test('les petites listes ne recopient jamais la bonne réponse comme distracteur', () => {
  const g = C.prepareGame(Array.from({ length: 6 }, (_, i) => ({ front: `question ${i}`, back: `réponse ${i % 3}` })), { ...C.defaults, teams: 6, rounds: 6 }, 'x');
  C.startRound(g); assert.equal(g.round.columns.flat().filter(v => v === g.round.answer).length, 1);
});
test('toutes les questions passent une fois et les équipes tournent équitablement', () => {
  const g = game({ teams: 5, rounds: 10 }); assert.equal(new Set(g.order).size, 10);
  const counts = Array(5).fill(0); g.teamSchedule.forEach(i => counts[i]++); assert.deepEqual(counts, [2,2,2,2,2]);
});
test('les actions hors phase et les doubles comptages sont ignorés', () => {
  const g = game(); assert.equal(C.award(g, true), false); C.startRound(g); assert.equal(C.startRound(g), false);
  assert.equal(C.reveal(g), false); assert.equal(C.award(g, true), false); g.phase = 'waiting';
  assert.equal(C.reveal(g), true); assert.equal(C.reveal(g), false); assert.equal(C.award(g, true), true);
  const scores = [...g.scores]; assert.equal(C.award(g, true), false); assert.deepEqual(g.scores, scores);
});
test('applique +3, −2 et les faux départs, puis annule atomiquement', () => {
  const g = game({ seconds: 0 }); C.startRound(g); C.reveal(g);
  const target = g.round.correctTeam; const wrong = (target + 1) % g.settings.teams;
  g.round.standing[wrong] = true; C.award(g, true);
  assert.equal(g.scores[target], 3); assert.equal(g.scores[wrong], -1);
  assert.equal(C.undoAward(g), true); assert.deepEqual(g.scores, Array(5).fill(0)); assert.equal(g.history.length, 0);
  C.award(g, false); assert.equal(g.scores[target], -2); assert.equal(g.scores[wrong], -1);
});
test('une partie se termine et son bilan reste restaurable', () => {
  const g = game({ seconds: 0, rounds: 5 });
  for (let i = 0; i < 5; i++) { C.startRound(g); C.reveal(g); C.award(g, true); C.nextRound(g); }
  assert.equal(g.phase, 'finished'); assert.equal(g.history.length, 5); assert.ok(C.validateSession(g));
});
test('la reprise met le compteur en pause et préserve la distribution et les scores', () => {
  const g = game(); C.startRound(g); g.remaining = 2230;
  const restored = C.validateSession(g); assert.equal(restored.phase, 'paused'); assert.equal(restored.remaining, 2230);
  assert.deepEqual(restored.round.columns, g.round.columns);
});
test('rejette une partie altérée, des scores invalides ou une réponse dupliquée', () => {
  const g = game(); C.startRound(g);
  for (const mutate of [x => { x.scores[0] = null; }, x => { x.order[0] = 999; }, x => { x.round.columns[0] = []; }, x => { x.round.correctTeam = 12; }, x => { x.remaining = '5'; }]) {
    const bad = C.clone(g); mutate(bad); assert.equal(C.validateSession(bad), null);
  }
});
test('une fin anticipée, y compris sans manche, reste restaurable', () => {
  const g = game(); g.cursor = g.order.length; g.phase = 'finished'; assert.ok(C.validateSession(g));
});
test('export et import conservent les listes archivées et les langues', () => {
  const list = C.sanitizeList({ id: 'a', title: 'test', pairs, frontLabel: 'Anglais', backLabel: 'Français', archived: true });
  const imported = C.importLibrary(JSON.stringify({ format: 'standup-quiz', version: 2, lists: [list] }));
  assert.deepEqual(imported, [list]);
});
test('les fichiers étrangers et les cellules non textuelles sont refusés', () => {
  assert.throws(() => C.importLibrary('{}'));
  assert.throws(() => C.importLibrary('{"format":"standup-quiz","version":2,"lists":[{"title":"x","pairs":[{"front":3,"back":"y"}]}]}'));
});
test('les limites protègent contre les fichiers trop volumineux', () => {
  assert.equal(C.parseWordList('a'.repeat(C.MAX_TEXT + 1)).errors.length, 1);
  assert.equal(C.parseWordList('a'.repeat(161) + ';b').errors.length, 1);
});
test('le barème personnalisé accepte zéro et reste annulable, y compris avec des faux départs', () => {
  const g = game({ seconds: 0, correctPoints: 7, incorrectPenalty: 4, falseStartPenalty: 2 });
  C.startRound(g); C.reveal(g); const target = g.round.correctTeam; const wrong = (target + 1) % 5;
  g.round.standing[wrong] = true; C.award(g, false);
  assert.equal(g.scores[target], -4); assert.equal(g.scores[wrong], -2);
  C.undoAward(g); C.award(g, true); assert.equal(g.scores[target], 7); assert.equal(g.scores[wrong], -2);
  const zero = game({ seconds: 0, correctPoints: 0, incorrectPenalty: 0, falseStartPenalty: 0 });
  C.startRound(zero); C.reveal(zero); zero.round.standing.fill(true); C.award(zero, false);
  assert.deepEqual(zero.scores, Array(5).fill(0)); assert.ok(C.validateSession(zero));
});
test('le mode supprimé revient au classique et aucun doublement ne se produit', () => {
  const g = game({ seconds: 0, mode: 'bonus', correctPoints: 5, incorrectPenalty: 3, falseStartPenalty: 2 });
  assert.equal(g.settings.mode, 'classic');
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(C.roundPoints(g), { correct: 5, incorrect: 3, falseStart: 2 });
    C.startRound(g); C.reveal(g); const before = [...g.scores]; const target = g.round.correctTeam;
    C.award(g, i !== 5); assert.equal(g.scores[target] - before[target], i === 5 ? -3 : 5);
    assert.equal(g.history.at(-1).multiplier, undefined); C.nextRound(g);
  }
  assert.ok(C.validateSession(g));
});
test('une ancienne partie bonus conserve ses points historiques puis continue au barème simple', () => {
  const g = game({ seconds: 0, correctPoints: 5 });
  for (let i = 0; i < 3; i++) { C.startRound(g); C.reveal(g); C.award(g, true); if (i < 2) C.nextRound(g); }
  delete g.balancedTeams; g.settings.mode = 'bonus';
  const last = g.history.at(-1); last.after[last.team] += 5; g.scores[last.team] += 5; last.multiplier = 2;
  const restored = C.validateSession(g); assert.ok(restored); assert.equal(restored.settings.mode, 'classic');
  assert.deepEqual(restored.scores, g.scores); assert.deepEqual(restored.teamSchedule, g.teamSchedule);
  assert.equal(C.historyPoints(restored.history.at(-1)), 10);
  C.nextRound(restored); C.startRound(restored); C.reveal(restored); const before = [...restored.scores]; const team = restored.round.correctTeam;
  C.award(restored, true); assert.equal(restored.scores[team] - before[team], 5);
});
test('le mode coopératif compte les réussites sans faux départ et cumule les points communs', () => {
  const g = game({ seconds: 0, mode: 'cooperative', rounds: 5, goalPercent: 50 });
  for (let i = 0; i < 4; i++) {
    C.startRound(g); C.reveal(g);
    if (i === 0) g.round.standing[(g.round.correctTeam + 1) % 5] = true;
    C.award(g, true); C.nextRound(g);
  }
  const c = C.cooperativeStatus(g); assert.deepEqual(c, { done: 3, goal: 3, score: 11, reached: true });
  assert.deepEqual(C.publicView(g).scores, []); assert.equal(C.publicView(g).cooperative.score, 11);
  assert.ok(C.validateSession(g));
});
test('la reprise ciblée fonctionne avec une seule question manquée et garde tous les distracteurs', () => {
  const g = game({ seconds: 0, rounds: 5, direction: 'reverse' });
  let missed;
  for (let i = 0; i < 5; i++) { C.startRound(g); C.reveal(g); if (i === 2) missed = g.round.question; C.award(g, i !== 2); C.nextRound(g); }
  const retry = C.replayMissed(g, rng());
  assert.equal(retry.settings.mode, 'cooperative'); assert.equal(retry.balancedTeams, false); assert.equal(retry.order.length, 1); assert.equal(retry.pairs.length, g.pairs.length); assert.deepEqual(retry.scores, Array(5).fill(0));
  C.startRound(retry); assert.equal(retry.round.question, missed);
  assert.equal(retry.round.columns.flat().filter(w => w === retry.round.answer).length, 1);
  assert.ok(C.validateSession(retry)); C.reveal(retry); C.award(retry, true); C.nextRound(retry);
  assert.equal(retry.phase, 'finished'); assert.equal(C.missedIndices(retry).length, 0); assert.throws(() => C.replayMissed(retry));
});
test('un faux départ seul ajoute la question à consolider et une annulation l’enlève', () => {
  const g = game({ seconds: 0 }); C.startRound(g); C.reveal(g);
  g.round.standing[(g.round.correctTeam + 1) % 5] = true; C.award(g, true);
  assert.equal(C.missedIndices(g).length, 1); C.undoAward(g); assert.equal(C.missedIndices(g).length, 0);
});
test('les anciennes parties 2.0 reçoivent le barème classique sans perdre la distribution', () => {
  const g = game(); C.startRound(g);
  ['mode','correctPoints','incorrectPenalty','falseStartPenalty','goalPercent','subject'].forEach(k => delete g.settings[k]);
  const restored = C.validateSession(g); assert.ok(restored); assert.equal(restored.settings.correctPoints, 3); assert.equal(restored.settings.mode, 'classic');
  assert.deepEqual(restored.round.columns, g.round.columns); const invalid = C.clone(g); invalid.settings.teams = 99;
  assert.equal(C.validateSession(invalid), null);
});
test('aucune réponse ni équipe attendue ne fuit dans la projection avant la révélation ou pendant la pause', () => {
  const g = game({ seconds: 0 }); C.startRound(g);
  for (const phase of ['waiting','thinking','paused']) {
    g.phase = phase; const view = C.publicView(g);
    for (const forbidden of ['answer','correctTeam','standing','pairs','order','teamSchedule','history']) assert.equal(view[forbidden], undefined, forbidden);
    if (phase === 'paused') { assert.equal(view.question, ''); assert.deepEqual(view.columns, []); }
  }
  g.phase = 'waiting'; C.reveal(g); assert.equal(C.publicView(g).answer, g.round.answer);
  assert.equal(C.publicView(g, 'setup').screen, 'lobby'); assert.equal(C.publicView(g, 'setup').answer, undefined);
});
test('les exemples des différentes branches sont jouables et les décimales ne sont pas séparées', () => {
  for (const [id, subject] of Object.entries(C.subjects)) {
    if (!subject.example) continue;
    const parsed = C.parseWordList(subject.example); assert.equal(parsed.errors.length, 0, id);
    assert.ok(C.prepareGame(parsed.pairs, { subject: id, rounds: 5 }, subject.title));
  }
  assert.deepEqual(C.parseWordList('1,5 + 2 ; 3,5\nx = 2 ; vrai').pairs, [{ front: '1,5 + 2', back: '3,5' }, { front: 'x = 2', back: 'vrai' }]);
});
test('les dossiers, branches et listes archivées sont conservés dans l’export réimporté', () => {
  const folders = [{ id: 'math', name: 'Mathématiques' }, { id: 'empty', name: 'À préparer' }];
  const list = C.sanitizeList({ title: 'Calcul', pairs, folderId: 'math', subject: 'maths', archived: true });
  const result = C.importBundle(JSON.stringify({ format: 'standup-quiz', version: 2, folders, lists: [list] }));
  assert.deepEqual(result, { folders, lists: [list] });
  assert.deepEqual(C.importBundle(JSON.stringify({ format: 'standup-quiz', version: 2, folders, lists: [] })).folders, folders);
});
test('un import fusionne les dossiers homonymes, protège les identifiants et évite les doublons', () => {
  const incomingList = C.sanitizeList({ id: 'list1', title: 'Calcul', pairs, folderId: 'f1', subject: 'maths' });
  const incoming = { folders: [{ id: 'f1', name: 'Maths' }], lists: [incomingList] };
  const existing = C.sanitizeList({ id: 'list1', title: 'Autre', pairs });
  const merged = C.mergeLibrary([existing], [{ id: 'local', name: 'Maths' }], incoming);
  assert.equal(merged.folders.length, 1); assert.equal(merged.lists.length, 2); assert.equal(merged.lists[1].folderId, 'local');
  assert.notEqual(merged.lists[1].id, existing.id); assert.equal(existing.title, 'Autre');
  const second = C.mergeLibrary(merged.lists, merged.folders, incoming); assert.equal(second.added, 0); assert.equal(second.addedFolders, 0);
});
test('les dossiers invalides, dupliqués ou trop nombreux sont refusés', () => {
  assert.throws(() => C.sanitizeFolders([{ id: 'a', name: 'Maths' }, { id: 'b', name: ' MATHS ' }]));
  assert.throws(() => C.sanitizeFolders([{ id: 'a', name: '' }]));
  assert.throws(() => C.sanitizeFolders(Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: String(i) }))));
});
test('le nombre de questions multiples va jusqu’à 40, même avec une liste courte', () => {
  assert.deepEqual(C.roundPlan(14, 4, 12), { maximum: 40, choices: Array.from({ length: 10 }, (_, i) => (i + 1) * 4), valid: true, perTeam: 3, unused: 2, repeats: 0 });
  assert.equal(C.roundPlan(15, 5).maximum, 40);
  assert.deepEqual(C.roundPlan(15, 5).choices, [5,10,15,20,25,30,35,40]);
  assert.deepEqual(C.roundPlan(8, 2).choices, Array.from({ length: 20 }, (_, i) => (i + 1) * 2));
  for (const rounds of [0, 1, 7, 14, 41]) assert.throws(() => C.prepareGame(pairs, { teams: 4, rounds }, 'Test'), /multiple/);
  const repeated = C.prepareGame(pairs.slice(0, 3), { teams: 6, rounds: 6 }, 'Test');
  assert.equal(repeated.order.length, 6); assert.equal(new Set(repeated.order).size, 3);
  assert.ok(repeated.order.every((question, i) => i === 0 || question !== repeated.order[i - 1]));
  assert.ok(C.prepareGame(pairs.slice(0, 3), { teams: 3, rounds: 3 }, 'Test'));
});
test('la limite tient compte des questions regroupées et du sens inversé', () => {
  const source = [{ front: 'a', back: 'x' }, { front: 'a', back: 'y' }, { front: 'b', back: 'z' }, { front: 'c', back: 'w' }];
  const forward = C.prepareGame(source, { teams: 4, rounds: 4 }, 'Test');
  assert.equal(forward.pairs.length, 3); assert.equal(forward.order.length, 4);
  const reversed = C.prepareGame(source, { teams: 4, rounds: 8, direction: 'reverse' }, 'Test');
  assert.equal(reversed.pairs.length, 4); assert.equal(new Set(reversed.pairs.map(p => p.back)).size, 3); assert.equal(reversed.order.length, 8);
});
test('égalité exacte des occasions, de 2 à 6 équipes, sur des milliers de tirages', () => {
  const source = Array.from({ length: 60 }, (_, i) => ({ front: `q${i}`, back: `r${i}` }));
  let consecutiveFound = false;
  for (let teams = 2; teams <= 6; teams++) for (let quota = 1; quota <= 5; quota++) for (let seed = 1; seed <= 100; seed++) {
    const g = C.prepareGame(source, { teams, rounds: teams * quota }, 'Équité', rng(seed * 7919));
    const counts = Array(teams).fill(0); g.teamSchedule.forEach(i => counts[i]++);
    assert.deepEqual(counts, Array(teams).fill(quota)); assert.equal(new Set(g.order).size, g.order.length);
    assert.ok(C.validateSession(g));
    if (quota > 1 && g.teamSchedule.some((team, i) => i && team === g.teamSchedule[i - 1])) consecutiveFound = true;
  }
  assert.equal(consecutiveFound, true, 'Le mélange global permet des passages consécutifs ; aucun cycle imposé.');
});
test('début, milieu et fin du tirage offrent les mêmes chances à chaque équipe', () => {
  const samples = 1500;
  const source = Array.from({ length: 30 }, (_, i) => ({ front: `q${i}`, back: `r${i}` }));
  for (let teams = 2; teams <= 6; teams++) {
    const positions = [0, teams, teams * 3 - 1]; const counts = positions.map(() => Array(teams).fill(0));
    for (let seed = 1; seed <= samples; seed++) {
      const g = C.prepareGame(source, { teams, rounds: teams * 3 }, 'Aléatoire', rng(seed * 7919));
      positions.forEach((position, i) => counts[i][g.teamSchedule[position]]++);
    }
    const expected = samples / teams;
    counts.forEach((row, i) => row.forEach(count => assert.ok(Math.abs(count - expected) < expected * .22, `${teams} équipes, position ${positions[i]} : ${row}`)));
  }
});
test('une partie marquée équitable refuse un tirage altéré et signale une fin anticipée', () => {
  const g = game({ seconds: 0 }); const bad = C.clone(g); bad.teamSchedule[0] = (bad.teamSchedule[0] + 1) % 5;
  assert.equal(C.validateSession(bad), null);
  for (let i = 0; i < 3; i++) { C.startRound(g); C.reveal(g); C.award(g, true); C.nextRound(g); }
  const info = C.opportunities(g); assert.equal(info.complete, false); assert.equal(info.plannedPerTeam, 2);
  assert.equal(info.counts.reduce((a, b) => a + b, 0), 3);
  g.cursor = g.order.length; g.round = null; g.phase = 'finished'; assert.ok(C.validateSession(g));
});
test('une ancienne partie incomplète se restaure sans réécrire son tirage', () => {
  const g = game(); delete g.balancedTeams; g.order = g.order.slice(0, 8); g.teamSchedule = g.teamSchedule.slice(0, 8); g.settings.rounds = 0;
  const restored = C.validateSession(g); assert.ok(restored); assert.deepEqual(restored.teamSchedule, g.teamSchedule);
  assert.equal(C.opportunities(restored).plannedPerTeam, null);
});
test('une ancienne révision ciblée passe en coopération sans perdre ses scores', () => {
  const original = game({ seconds: 0 }); C.startRound(original); C.reveal(original); C.award(original, false);
  const retry = C.replayMissed(original); delete retry.balancedTeams; retry.settings.mode = 'classic'; retry.scores[0] = 7;
  const restored = C.validateSession(retry); assert.ok(restored); assert.equal(restored.settings.mode, 'cooperative');
  assert.deepEqual(restored.scores, retry.scores); assert.deepEqual(restored.teamSchedule, retry.teamSchedule);
  assert.equal(C.cooperativeStatus(restored).score, 7);
});
