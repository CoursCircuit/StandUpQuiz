/* © Sylvain Bovat. Tous droits réservés. Logique partagée, sans accès au DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_PAIRS = 2000;
  const MAX_TEXT = 1000000;
  const defaults = Object.freeze({ teams: 5, words: 4, seconds: 5, direction: 'forward', rounds: 0,
    teamNames: ['Équipe A', 'Équipe B', 'Équipe C', 'Équipe D', 'Équipe E', 'Équipe F'], largeText: false,
    mode: 'classic', correctPoints: 3, incorrectPenalty: 2, falseStartPenalty: 1, goalPercent: 70, subject: 'vocabulary' });
  const subjects = Object.freeze({
    vocabulary: { name: 'Langues', front: 'Français', back: 'Allemand', title: 'Les animaux', example: 'le chat ; die Katze\nle chien ; der Hund\nle cheval ; das Pferd\nla souris ; die Maus\nle lapin ; das Kaninchen\nle poisson ; der Fisch', guidance: 'Pour les noms, ajoute l’article défini et respecte les majuscules. Choisis une traduction courte et non ambiguë.' },
    definitions: { name: 'Français · définitions', front: 'Définition', back: 'Mot', title: 'Les figures de style', example: 'Comparaison sans outil de comparaison ; métaphore\nExagération volontaire ; hyperbole\nRépétition en début de phrase ; anaphore\nAttribution de traits humains à un objet ; personnification\nDeux termes de sens opposés réunis ; oxymore\nAtténuation d’une réalité pénible ; euphémisme', guidance: 'Définitions précises et courtes, avec un seul terme attendu. Évite les synonymes qui rendraient plusieurs réponses possibles.' },
    maths: { name: 'Mathématiques', front: 'Calcul', back: 'Résultat', title: 'Calcul mental', example: '7 × 8 ; 56\n9 × 6 ; 54\n144 ÷ 12 ; 12\n25 + 17 ; 42\n100 − 36 ; 64\n3² ; 9\n15 × 5 ; 75\n81 ÷ 3 ; 27', guidance: 'Vérifie chaque calcul. Utilise les signes ×, ÷, − et des parenthèses si nécessaire. Garde une notation cohérente (unités, fractions, décimales) et des résultats distincts.' },
    history: { name: 'Histoire', front: 'Événement', back: 'Date', title: 'Repères historiques', example: 'Prise de la Bastille ; 1789\nChute de l’Empire romain d’Occident ; 476\nCouronnement de Charlemagne comme empereur ; 800\nDébut de la Première Guerre mondiale ; 1914\nFin de la Seconde Guerre mondiale ; 1945\nChute du mur de Berlin ; 1989', guidance: 'Vérifie les faits et les dates. Précise le pays ou le contexte pour éviter toute ambiguïté. N’invente aucun événement.' },
    geography: { name: 'Géographie', front: 'Pays', back: 'Capitale', title: 'Capitales européennes', example: 'Suisse ; Berne\nFrance ; Paris\nAllemagne ; Berlin\nItalie ; Rome\nEspagne ; Madrid\nPortugal ; Lisbonne\nAutriche ; Vienne\nGrèce ; Athènes', guidance: 'Choisis des associations géographiques exactes, stables et sans ambiguïté ; précise le contexte si plusieurs réponses sont possibles.' },
    science: { name: 'Sciences', front: 'Symbole chimique', back: 'Élément', title: 'Les éléments chimiques', example: 'H ; hydrogène\nO ; oxygène\nC ; carbone\nFe ; fer\nCu ; cuivre\nAu ; or\nAg ; argent\nNa ; sodium', guidance: 'Vérifie l’exactitude scientifique. Respecte les symboles, unités et majuscules. Chaque question doit appeler une seule réponse courte.' },
    custom: { name: 'Autre branche', front: 'Question', back: 'Réponse', title: 'Mon thème', example: '', guidance: 'Questions précises, connaissances vérifiées, une seule réponse courte et non ambiguë par question.' }
  });
  const clean = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const key = value => clean(value).toLocaleLowerCase();
  const wordKey = clean; // Capitalization can change meaning (German sie / Sie).
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function splitQuoted(line, delimiter) {
    const cells = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || !cell.trim()) quoted = !quoted;
        else cell += c;
      } else if (!quoted && line.startsWith(delimiter, i)) {
        cells.push(cell.trim()); cell = ''; i += delimiter.length - 1;
      } else cell += c;
    }
    cells.push(cell.trim());
    return { cells, quoted };
  }

  function parseWordList(input) {
    const pairs = []; const errors = []; let duplicates = 0; let headers = 0;
    if (typeof input !== 'string' || input.length > MAX_TEXT) {
      return { pairs, errors: [{ line: 0, message: 'Le texte dépasse la limite de 1 Mo.' }], duplicates, headers };
    }
    const seen = new Set();
    const rows = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    let lineNumber = 0;
    for (const row of rows) {
      lineNumber++;
      let text = row.trim().replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '');
      if (!text || /^```/.test(text) || /^sep=.$/i.test(text)) continue;
      if (text.startsWith('|') && text.endsWith('|')) text = text.slice(1, -1).trim();
      if (/^:?-{2,}:?\s*\|\s*:?-{2,}:?$/.test(text)) continue;
      // Also accept inline records: chat = Katze, chien = Hund.
      const chunks = splitQuoted(text, ',').cells;
      const records = !text.includes('"') && chunks.length > 1 && chunks.every(v => /(?:;|\t|\||=>|→|=)/.test(v)) ? chunks : [text];
      for (const record of records) {
        const delimiters = ['\t', ';', '|', '=>', '→', '=', ' : ', ' – ', ' — ', ' - ', ','];
        let result;
        for (const d of delimiters) {
          const candidate = splitQuoted(record, d);
          if (candidate.cells.length > 1) { result = candidate; break; }
        }
        if (!result || result.quoted || result.cells.length !== 2 || result.cells.some(v => !clean(v))) {
          errors.push({ line: lineNumber, message: 'Deux cellules attendues : question ; réponse. Utilisez des guillemets si une cellule contient le séparateur.' }); continue;
        }
        const [front, back] = result.cells.map(clean);
        const header = /^(fran[cç]ais|allemand|anglais|english|german|deutsch|french|mot|word|question|recto|langue 1)$/i;
        const header2 = /^(fran[cç]ais|allemand|anglais|english|german|deutsch|french|traduction|translation|r[eé]ponse|verso|langue 2)$/i;
        if (!pairs.length && header.test(front) && header2.test(back)) { headers++; continue; }
        if (front.length > 160 || back.length > 160) {
          errors.push({ line: lineNumber, message: 'Une cellule dépasse 160 caractères : raccourcissez-la pour la projection.' }); continue;
        }
        const id = JSON.stringify([wordKey(front), wordKey(back)]);
        if (seen.has(id)) { duplicates++; continue; }
        if (pairs.length >= MAX_PAIRS) { errors.push({ line: lineNumber, message: 'Maximum : 2 000 paires par liste.' }); break; }
        seen.add(id); pairs.push({ front, back });
      }
    }
    return { pairs, errors, duplicates, headers };
  }

  function orientPairs(pairs, direction = 'forward') {
    const groups = new Map();
    for (const pair of pairs) {
      const front = direction === 'reverse' ? pair.back : pair.front;
      const back = direction === 'reverse' ? pair.front : pair.back;
      const id = wordKey(front);
      if (!groups.has(id)) groups.set(id, { front, answers: new Map() });
      groups.get(id).answers.set(wordKey(back), back);
    }
    return [...groups.values()].map(g => ({ front: g.front, back: [...g.answers.values()].join(' / ') }));
  }

  function sanitizeSettings(value = {}) {
    const number = (name, min, max, fallback) => Number.isInteger(value[name]) && value[name] >= min && value[name] <= max ? value[name] : fallback;
    return { teams: number('teams', 2, 6, 5), words: number('words', 2, 5, 4), seconds: number('seconds', 0, 60, 5),
      direction: value.direction === 'reverse' ? 'reverse' : 'forward', rounds: number('rounds', 0, MAX_PAIRS, 0),
      teamNames: defaults.teamNames.map((fallback, i) => clean(value.teamNames?.[i]).slice(0, 24) || fallback), largeText: value.largeText === true,
      mode: value.mode === 'cooperative' ? 'cooperative' : 'classic',
      correctPoints: number('correctPoints', 0, 100, 3), incorrectPenalty: number('incorrectPenalty', 0, 100, 2),
      falseStartPenalty: number('falseStartPenalty', 0, 100, 1), goalPercent: number('goalPercent', 10, 100, 70),
      subject: Object.hasOwn(subjects, value.subject) ? value.subject : 'vocabulary' };
  }

  function shuffle(values, rng = Math.random) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function roundPlan(questionCount, teams, selected = 0) {
    // Always offer a useful session length for classroom lists; when a list is
    // shorter than the selected game, prepareGame cycles through shuffled decks.
    const maximum = Math.floor(Math.max(questionCount, 40) / teams) * teams;
    const choices = Array.from({ length: Math.floor(questionCount / teams) }, (_, i) => (i + 1) * teams);
    while (choices.length && choices[choices.length - 1] < maximum) choices.push(choices[choices.length - 1] + teams);
    if (!choices.length) for (let n = teams; n <= maximum; n += teams) choices.push(n);
    const valid = Number.isInteger(selected) && selected >= teams && selected <= maximum && selected % teams === 0;
    return { maximum, choices, valid, perTeam: valid ? selected / teams : 0,
      unused: valid && selected < questionCount ? questionCount - selected : 0,
      repeats: valid ? Math.max(0, selected - questionCount) : 0 };
  }
  function questionSchedule(questionCount, count, rng = Math.random) {
    const order = []; let previous = -1;
    while (order.length < count) {
      const deck = shuffle(Array.from({ length: questionCount }, (_, i) => i), rng);
      // Keep the shuffle random while avoiding an identical question at a deck boundary.
      if (deck.length > 1 && deck[0] === previous) {
        const replacement = 1 + Math.floor(rng() * (deck.length - 1));
        [deck[0], deck[replacement]] = [deck[replacement], deck[0]];
      }
      const part = deck.slice(0, count - order.length);
      order.push(...part); previous = part.at(-1);
    }
    return order;
  }
  function teamSchedule(teams, count, rng = Math.random) {
    const quota = Math.floor(count / teams);
    const bag = Array.from({ length: teams }, (_, team) => Array(quota).fill(team)).flat();
    // Only targeted, unranked practice can have an incomplete quota. Its extra
    // opportunities go to random teams. Normal games always have exact quotas.
    bag.push(...shuffle(Array.from({ length: teams }, (_, i) => i), rng).slice(0, count % teams));
    return shuffle(bag, rng);
  }
  function createSession(oriented, settings, title, order, rng, practice = false) {
    return { version: 2, id: uid(), title: clean(title) || 'Liste sans titre', settings, pairs: oriented, order,
      teamSchedule: teamSchedule(settings.teams, order.length, rng), balancedTeams: !practice, practice,
      cursor: 0, scores: Array(settings.teams).fill(0), history: [], scoreUndo: [], round: null,
      phase: 'ready', remaining: settings.seconds * 1000, createdAt: new Date().toISOString() };
  }
  function prepareGame(pairs, options, title, rng = Math.random) {
    const settings = sanitizeSettings(options);
    const oriented = orientPairs(pairs, settings.direction);
    if (oriented.some(p => p.back.length > 160)) throw new Error('Trop de réponses pour une même question. Raccourcissez ou séparez ces entrées.');
    const distinct = new Set(oriented.map(p => wordKey(p.back))).size;
    if (oriented.length < 3 || distinct < 3) throw new Error('Ajoutez au moins 3 questions et 3 réponses différentes.');
    const plan = roundPlan(oriented.length, settings.teams, settings.rounds);
    if (!plan.valid) throw new Error(`Choisissez un nombre de questions multiple de ${settings.teams}, entre ${settings.teams} et ${plan.maximum}.`);
    settings.words = Math.min(settings.words, distinct - 1);
    const order = questionSchedule(oriented.length, settings.rounds, rng);
    return createSession(oriented, settings, title, order, rng);
  }

  function dealRound(game, rng = Math.random) {
    if (game.cursor >= game.order.length) return null;
    const pair = game.pairs[game.order[game.cursor]];
    const unique = new Map(game.pairs.filter(p => wordKey(p.back) !== wordKey(pair.back)).map(p => [wordKey(p.back), p.back]));
    const pool = [...unique.values()];
    const correctTeam = game.teamSchedule[game.cursor];
    const columns = Array.from({ length: game.settings.teams }, (_, i) => {
      const words = shuffle(pool, rng).slice(0, game.settings.words - (i === correctTeam ? 1 : 0));
      if (i === correctTeam) words.splice(Math.floor(rng() * (words.length + 1)), 0, pair.back);
      return words;
    });
    return { question: pair.front, answer: pair.back, correctTeam, columns, standing: Array(game.settings.teams).fill(false), scored: false, outcome: null };
  }

  function startRound(game, rng = Math.random) {
    if (game.phase !== 'ready') return false;
    game.round = dealRound(game, rng);
    if (!game.round) { game.phase = 'finished'; return false; }
    game.remaining = game.settings.seconds * 1000;
    game.phase = game.settings.seconds ? 'thinking' : 'waiting';
    return true;
  }

  function reveal(game) {
    if (!['waiting'].includes(game.phase) || !game.round) return false;
    game.phase = 'revealed'; return true;
  }

  function award(game, success) {
    if (game.phase !== 'revealed' || game.round.scored) return false;
    const before = [...game.scores];
    const { correctTeam, standing } = game.round;
    const points = roundPoints(game);
    game.scores[correctTeam] += success ? points.correct : -points.incorrect;
    standing.forEach((isStanding, i) => { if (isStanding && i !== correctTeam) game.scores[i] -= points.falseStart; });
    game.round.scored = true; game.round.outcome = success ? 'won' : 'lost';
    game.history.push({ question: game.round.question, answer: game.round.answer, team: correctTeam,
      success: !!success, before, after: [...game.scores],
      falseStarts: standing.flatMap((v, i) => v && i !== correctTeam ? [i] : []) });
    game.scoreUndo = []; game.phase = 'scored'; return true;
  }

  function undoAward(game) {
    if (game.phase !== 'scored' || !game.history.length) return false;
    const entry = game.history.pop(); game.scores = [...entry.before];
    game.round.scored = false; game.round.outcome = null; game.phase = 'revealed'; game.scoreUndo = []; return true;
  }

  function nextRound(game) {
    if (game.phase !== 'scored') return false;
    game.cursor++; game.round = null; game.scoreUndo = [];
    game.phase = game.cursor >= game.order.length ? 'finished' : 'ready'; return true;
  }

  function roundPoints(game) {
    return { correct: game.settings.correctPoints, incorrect: game.settings.incorrectPenalty,
      falseStart: game.settings.falseStartPenalty };
  }
  function historyPoints(entry) {
    return entry.after[entry.team] - entry.before[entry.team];
  }
  function opportunities(game) {
    const counts = Array(game.settings.teams).fill(0);
    game.history.forEach(h => counts[h.team]++);
    return { counts, equal: counts.every(n => n === counts[0]), complete: game.history.length === game.order.length,
      plannedPerTeam: game.balancedTeams ? game.order.length / game.settings.teams : null };
  }
  function cooperativeStatus(game) {
    const done = game.history.filter(h => h.success && !h.falseStarts.length).length;
    const goal = Math.max(1, Math.ceil(game.order.length * game.settings.goalPercent / 100));
    return { done, goal, score: game.scores.reduce((sum, score) => sum + score, 0), reached: done >= goal };
  }
  function missedIndices(game) {
    return [...new Set(game.history.filter(h => !h.success || h.falseStarts.length).map(h =>
      game.pairs.findIndex(p => p.front === h.question && p.back === h.answer)).filter(i => i >= 0))];
  }
  function replayMissed(game, rng = Math.random) {
    const missed = missedIndices(game);
    if (!missed.length) throw new Error('Aucune question à consolider. Bravo !');
    // Keep the full answer pool, even when only one question needs another pass.
    const settings = sanitizeSettings({ ...game.settings, direction: 'forward', rounds: missed.length, mode: 'cooperative' });
    return createSession(clone(game.pairs), settings, game.title, shuffle(missed, rng), rng, true);
  }
  function publicView(game, screen = 'game') {
    if (!game || screen === 'setup') return { screen: 'lobby', title: 'Le prochain défi se prépare…' };
    const g = game; const revealed = ['revealed', 'scored'].includes(g.phase);
    const visible = !['ready', 'paused', 'finished'].includes(g.phase);
    const view = { screen: g.phase === 'finished' ? 'summary' : 'game', title: g.title, phase: g.phase,
      teams: g.settings.teams, words: g.settings.words, seconds: g.settings.seconds, remaining: g.remaining,
      largeText: g.settings.largeText, mode: g.settings.mode, practice: g.practice === true,
      teamNames: [...g.settings.teamNames], scores: g.settings.mode === 'cooperative' ? [] : [...g.scores],
      cursor: g.cursor, total: g.order.length, completed: g.history.length,
      cooperative: cooperativeStatus(g), points: roundPoints(g),
      opportunities: opportunities(g),
      question: visible ? g.round.question : '', columns: visible ? clone(g.round.columns) : [] };
    // No answer, expected team, full list or future question is sent before revelation.
    if (revealed) Object.assign(view, { answer: g.round.answer, correctTeam: g.round.correctTeam, standing: [...g.round.standing] });
    return view;
  }

  function sanitizeList(value) {
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || !Array.isArray(value.pairs) || value.pairs.length > MAX_PAIRS) throw new Error('Liste invalide.');
    const pairs = value.pairs.map(p => {
      if (!p || typeof p.front !== 'string' || typeof p.back !== 'string' || !clean(p.front) || !clean(p.back) || p.front.length > 160 || p.back.length > 160) throw new Error('Une paire de la liste est invalide.');
      return { front: clean(p.front), back: clean(p.back) };
    });
    return { id: typeof value.id === 'string' ? value.id.slice(0, 100) : uid(), title: clean(value.title).slice(0, 100) || 'Liste sans titre',
      frontLabel: clean(value.frontLabel).slice(0, 32) || 'Français', backLabel: clean(value.backLabel).slice(0, 32) || 'Allemand',
      subject: Object.hasOwn(subjects, value.subject) ? value.subject : 'vocabulary',
      folderId: typeof value.folderId === 'string' ? value.folderId.slice(0, 100) : null,
      pairs, archived: value.archived === true, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString() };
  }

  function sanitizeFolders(values = []) {
    if (!Array.isArray(values) || values.length > 100) throw new Error('Maximum : 100 dossiers.');
    const ids = new Set(); const names = new Set();
    return values.map(v => {
      if (!v || typeof v.id !== 'string' || !clean(v.id) || v.id.length > 100 || typeof v.name !== 'string' || !clean(v.name) || clean(v.name).length > 60 || ids.has(v.id) || names.has(key(v.name))) throw new Error('Un dossier est invalide ou en double.');
      ids.add(v.id); names.add(key(v.name)); return { id: v.id, name: clean(v.name) };
    });
  }

  function validateSession(value) {
    if (!value || value.version !== 2) return null;
    try {
      const g = clone(value);
      // Remove the retired mode without losing scores or an older game's draw.
      if (g.settings?.mode === 'bonus') g.settings.mode = 'classic';
      if (g.practice === true && g.settings) g.settings.mode = 'cooperative';
      const settings = sanitizeSettings(g.settings);
      if (!g.settings || Object.keys(g.settings).some(k => JSON.stringify(settings[k]) !== JSON.stringify(g.settings[k]))) return null;
      g.settings = settings; // Missing 2.1 options receive defaults when restoring a 2.0 game.
      sanitizeList({ title: g.title, pairs: g.pairs });
      if (g.pairs.length < 3 || !Array.isArray(g.order) || !g.order.length || g.order.length > MAX_PAIRS ||
        !g.order.every(i => Number.isInteger(i) && i >= 0 && i < g.pairs.length) ||
        !Number.isInteger(g.cursor) || g.cursor < 0 || g.cursor > g.order.length ||
        !Array.isArray(g.scores) || g.scores.length !== settings.teams || !g.scores.every(Number.isFinite) ||
        !Array.isArray(g.teamSchedule) || g.teamSchedule.length !== g.order.length || !g.teamSchedule.every(i => Number.isInteger(i) && i >= 0 && i < settings.teams) ||
        !['ready','thinking','paused','waiting','revealed','scored','finished'].includes(g.phase) || !Array.isArray(g.history) ||
        g.history.length > g.order.length || !Number.isFinite(g.remaining)) return null;
      if (g.balancedTeams === true) {
        const plan = roundPlan(g.pairs.length, settings.teams, g.order.length);
        const counts = Array(settings.teams).fill(0); g.teamSchedule.forEach(i => counts[i]++);
        const questionCounts = Array(g.pairs.length).fill(0); g.order.forEach(i => questionCounts[i]++);
        if (!plan.valid || settings.rounds !== g.order.length || !counts.every(n => n === plan.perTeam) ||
          Math.max(...questionCounts) - Math.min(...questionCounts) > 1 || g.order.some((q, i) => i > 0 && q === g.order[i - 1])) return null;
      }
      if (g.practice === true && g.balancedTeams === false && settings.mode !== 'cooperative') return null;
      const scoreVector = v => Array.isArray(v) && v.length === settings.teams && v.every(Number.isFinite);
      const teamIndex = i => Number.isInteger(i) && i >= 0 && i < settings.teams;
      if (!g.history.every(h => h && typeof h.question === 'string' && typeof h.answer === 'string' && typeof h.success === 'boolean' && teamIndex(h.team) && scoreVector(h.before) && scoreVector(h.after) && Array.isArray(h.falseStarts) && h.falseStarts.every(i => teamIndex(i) && i !== h.team) && new Set(h.falseStarts).size === h.falseStarts.length)) return null;
      if (g.phase === 'finished') { if (g.cursor !== g.order.length) return null; }
      else if (g.cursor >= g.order.length) return null;
      if (!['ready','finished'].includes(g.phase)) {
        const r = g.round; const pair = g.pairs[g.order[g.cursor]];
        if (!r || r.question !== pair.front || r.answer !== pair.back || r.correctTeam !== g.teamSchedule[g.cursor] ||
          !Array.isArray(r.columns) || r.columns.length !== settings.teams || !r.columns.every(c => Array.isArray(c) && c.length === settings.words && c.every(w => typeof w === 'string' && w.length <= 2000) && new Set(c.map(wordKey)).size === c.length) ||
          r.columns.flat().filter(w => wordKey(w) === wordKey(r.answer)).length !== 1 || !r.columns[r.correctTeam].includes(r.answer) ||
          !Array.isArray(r.standing) || r.standing.length !== settings.teams || !r.standing.every(v => typeof v === 'boolean') || r.scored !== (g.phase === 'scored')) return null;
      } else if (g.round !== null) return null;
      g.scoreUndo = Array.isArray(g.scoreUndo) ? g.scoreUndo.filter(scoreVector).slice(-50) : [];
      g.remaining = Math.max(0, Math.min(settings.seconds * 1000, g.remaining));
      if (g.phase === 'thinking') g.phase = 'paused';
      return g;
    } catch { return null; }
  }

  function importBundle(raw) {
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Le fichier JSON ne peut pas être lu.'); }
    if (data?.format !== 'standup-quiz' || data.version !== 2 || !Array.isArray(data.lists) || data.lists.length > 500) throw new Error('Ce fichier n’est pas une bibliothèque StandUp Quiz 2.');
    const folders = sanitizeFolders(data.folders);
    if (!data.lists.length && !folders.length) throw new Error('Cette bibliothèque ne contient aucune liste.');
    const lists = data.lists.map(sanitizeList);
    const ids = new Set(folders.map(f => f.id));
    lists.forEach(list => { if (!ids.has(list.folderId)) list.folderId = null; });
    return { lists, folders };
  }
  const importLibrary = raw => importBundle(raw).lists;
  function mergeLibrary(lists, folders, incoming) {
    lists = clone(lists); folders = clone(folders);
    const folderMap = new Map(); let addedFolders = 0; let added = 0;
    for (const folder of incoming.folders) {
      let match = folders.find(f => key(f.name) === key(folder.name));
      if (!match) {
        match = { ...folder, id: folders.some(f => f.id === folder.id) ? uid() : folder.id };
        folders.push(match); addedFolders++;
      }
      folderMap.set(folder.id, match.id);
    }
    for (const original of incoming.lists) {
      const list = { ...clone(original), folderId: folderMap.get(original.folderId) || null };
      if (lists.some(v => v.title === list.title && v.frontLabel === list.frontLabel && v.backLabel === list.backLabel && v.subject === list.subject && v.folderId === list.folderId && JSON.stringify(v.pairs) === JSON.stringify(list.pairs))) continue;
      if (lists.some(v => v.id === list.id)) list.id = uid();
      lists.push(list); added++;
    }
    if (lists.length > 500 || folders.length > 100) throw new Error('L’import dépasserait la limite de 500 listes ou de 100 dossiers.');
    return { lists, folders, added, addedFolders };
  }

  const serializePairs = pairs => pairs.map(p => [p.front, p.back].map(v => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(' ; ')).join('\n');
  return { MAX_PAIRS, MAX_TEXT, defaults, subjects, clean, key, wordKey, clone, uid, parseWordList, orientPairs, sanitizeSettings, shuffle, prepareGame,
    dealRound, startRound, reveal, award, undoAward, nextRound, roundPlan, teamSchedule, roundPoints, historyPoints, opportunities, cooperativeStatus, missedIndices, replayMissed, publicView,
    sanitizeList, sanitizeFolders, validateSession, importBundle, importLibrary, mergeLibrary, serializePairs };
});
