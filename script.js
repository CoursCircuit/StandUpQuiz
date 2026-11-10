/* © Sylvain Bovat. Tous droits réservés. */
(() => {
  'use strict';
  const C = window.QuizCore;
  const V = window.QuizView;
  const $ = id => document.getElementById(id);
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const colors = ['#9980f5', '#39bce3', '#fa8798', '#53cba5', '#edbe42', '#8a9be4'];
  const STORAGE_KEY = 'standup-quiz-v2';
  let state;
  let parsed = { pairs: [], errors: [] };
  let screen = 'setup';
  let showArchives = false;
  let saveTimer;
  let nativeQueue = Promise.resolve();
  let tickTimer;
  let deadline = 0;
  let toastTimer;
  let storageBlocked = false;
  let wakeLock;
  let loaded = false;
  let lastTimerSecond = null;
  let folderFilter = 'all';
  let audienceOpen = false;
  let audienceWindow;
  const projectionId = C.uid();
  let audienceChannel;

  function examples() {
    const data = [
      ['Les animaux', 'le chat;die Katze\nle chien;der Hund\nle lapin;das Kaninchen\nle cheval;das Pferd\nl’oiseau;der Vogel\nla souris;die Maus\nle poisson;der Fisch\nla vache;die Kuh'],
      ['À l’école', 'le livre;das Buch\nle cahier;das Heft\nle crayon;der Bleistift\nla gomme;der Radiergummi\nla règle;das Lineal\nle tableau;die Tafel\nla classe;die Klasse\nla table;der Tisch\nla chaise;der Stuhl\nle sac;die Tasche\nl’école;die Schule\nla leçon;die Stunde'],
      ['Verbes du quotidien', 'manger;essen\nboire;trinken\nlire;lesen\nécrire;schreiben\nparler;sprechen\nécouter;zuhören\njouer;spielen\ndormir;schlafen\naller;gehen\nvenir;kommen\nvoir;sehen\napprendre;lernen\nchanter;singen\ncuisiner;kochen\ntravailler;arbeiten']
    ];
    return data.map(([title, text]) => C.sanitizeList({ id: C.uid(), title, pairs: C.parseWordList(text).pairs, frontLabel: 'Français', backLabel: 'Allemand' }));
  }
  function draftFrom(list) { return { id: list.id, title: list.title, frontLabel: list.frontLabel, backLabel: list.backLabel, subject: list.subject, folderId: list.folderId, text: C.serializePairs(list.pairs) }; }
  function freshState() { const lists = examples(); return { version: 2, lists, folders: [], draft: draftFrom(lists[0]), settings: C.sanitizeSettings(), session: null, revision: 0 }; }
  function hydrate(raw) {
    if (!raw || raw.version !== 2 || !Array.isArray(raw.lists) || raw.lists.length > 500 || typeof raw.draft?.text !== 'string' || raw.draft.text.length > C.MAX_TEXT) throw new Error('Format de sauvegarde invalide.');
    const folders = C.sanitizeFolders(raw.folders); const lists = raw.lists.map(C.sanitizeList);
    const folderIds = new Set(folders.map(f => f.id));
    lists.forEach(list => { if (!folderIds.has(list.folderId)) list.folderId = null; });
    return { version: 2, lists, folders, draft: { id: typeof raw.draft.id === 'string' ? raw.draft.id : null,
      subject: Object.hasOwn(C.subjects, raw.draft.subject) ? raw.draft.subject : 'vocabulary', folderId: folderIds.has(raw.draft.folderId) ? raw.draft.folderId : null,
      title: C.clean(raw.draft.title).slice(0, 100), text: raw.draft.text, frontLabel: C.clean(raw.draft.frontLabel).slice(0, 32) || 'Français', backLabel: C.clean(raw.draft.backLabel).slice(0, 32) || 'Allemand' },
      settings: C.sanitizeSettings(raw.settings), session: C.validateSession(raw.session), revision: Number.isSafeInteger(raw.revision) ? raw.revision : 0 };
  }
  function storageError(message) { $('storageError').textContent = message; $('storageError').hidden = false; $('saveStatus').textContent = 'Export conseillé'; $('saveStatus').classList.add('error'); }
  function toast(message, error = false) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500);
  }
  function save() {
    if (!loaded) return;
    state.revision = Math.max(Date.now(), state.revision + 1);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { storageError('La copie de secours du brouillon n’a pas pu être écrite. Exportez votre bibliothèque.'); }
    if (window.standup && !storageBlocked) {
      $('saveStatus').textContent = 'Enregistrement…';
      clearTimeout(saveTimer); saveTimer = setTimeout(persistNative, 180);
    } else if (!storageBlocked) $('saveStatus').textContent = 'Brouillon conservé';
  }
  function persistNative() {
    clearTimeout(saveTimer);
    if (!window.standup || storageBlocked) return;
    const snapshot = C.clone(state);
    nativeQueue = nativeQueue.catch(() => {}).then(async () => {
      const result = await window.standup.saveState(snapshot);
      if (!result.ok) throw new Error(result.error);
      if (state.revision === snapshot.revision) { $('saveStatus').textContent = 'Tout est enregistré'; $('saveStatus').classList.remove('error'); }
    }).catch(error => { storageError(`Enregistrement local impossible : ${error.message} Exportez votre bibliothèque.`); });
  }
  async function setProjection(active) {
    if (window.standup) { await window.standup.setProjection(active); return; }
    try {
      if (active && navigator.wakeLock && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      if (!active && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { /* Le jeu reste utilisable sans maintien de l'écran. */ }
  }
  async function publishAudience() {
    if (!audienceOpen) return;
    if (window.standup) {
      try {
        const result = await window.standup.present({ game: state.session, screen });
        if (!result.ok) { toast(result.error, true); }
      } catch { toast('La projection ne répond plus. Fermez puis rouvrez l’écran élèves.', true); }
    } else audienceChannel?.postMessage({ type: 'view', view: C.publicView(state.session, screen) });
  }
  function audienceChanged(active) {
    audienceOpen = active;
    $('audienceButton').setAttribute('aria-pressed', active);
    $('audienceButton').querySelector('span').textContent = active ? 'Écran élèves ouvert' : 'Écran élèves';
    document.body.classList.toggle('has-audience', active);
    if (screen === 'game') renderGame();
  }
  async function audienceOptions() {
    let displays = [];
    if (window.standup) {
      const result = await window.standup.displays();
      if (!result.ok) { toast(result.error, true); return; } displays = result.displays;
    }
    openDialog(`<h2 id="dialogTitle">Un écran pour les élèves</h2><p>Facultatif : gardez les commandes et la réponse sur votre Mac, avec une fenêtre épurée à projeter. Pour la version habituelle, gardez simplement une seule fenêtre.</p>${displays.length && !audienceOpen ? `<label class="field">Ouvrir sur<select id="audienceDisplay">${displays.map(d => `<option value="${d.id}" ${!d.current ? 'selected' : ''}>${esc(d.name)} · ${d.width} × ${d.height}${d.current ? ' · écran actuel' : ''}</option>`).join('')}</select></label>` : ''}<p class="small muted">Utilisez le bureau étendu du système pour avoir deux vues différentes. Sur un seul écran, vous pourrez déplacer la nouvelle fenêtre. F ou un double-clic active le plein écran de la projection.${audienceOpen ? ' Pour changer d’écran, fermez puis rouvrez la projection.' : ''}</p><div class="dialog-actions">${audienceOpen ? '<button id="closeAudience" class="btn danger">Revenir à une seule fenêtre</button>' : ''}<button id="openAudience" class="btn primary">${audienceOpen ? 'Afficher la fenêtre élèves' : 'Ouvrir l’écran élèves'}</button></div>`);
    $('openAudience').onclick = async () => {
      $('openAudience').disabled = true;
      try {
        if (window.standup) {
          audienceChanged(true); await publishAudience();
          const result = await window.standup.openAudience($('audienceDisplay') ? { displayId: Number($('audienceDisplay').value) } : {});
          if (!result.ok) throw new Error(result.error);
        } else {
          if (!audienceChannel) {
            audienceChannel = new BroadcastChannel(`standup-${projectionId}`);
            audienceChannel.onmessage = event => {
              if (event.data?.type === 'ready') publishAudience();
              if (event.data?.type === 'closed') audienceChanged(false);
            };
          }
          audienceWindow = window.open(`projection.html#${projectionId}`, 'standup-audience', 'width=1280,height=800');
          if (!audienceWindow) throw new Error('Autorisez l’ouverture de la fenêtre élèves dans votre navigateur.');
          audienceChanged(true); publishAudience();
        }
        $('appDialog').close();
      } catch (error) { audienceChanged(false); toast(error.message, true); if ($('openAudience')) $('openAudience').disabled = false; }
    };
    if ($('closeAudience')) $('closeAudience').onclick = async () => {
      if (window.standup) await window.standup.closeAudience(); else audienceWindow?.close();
      audienceChanged(false); $('appDialog').close();
    };
  }
  function showScreen(name) {
    screen = name; $('setupView').hidden = name !== 'setup'; $('gameView').hidden = name !== 'game'; $('summaryView').hidden = name !== 'summary';
    $('homeButton').hidden = name === 'setup'; $('helpButton').hidden = name !== 'setup'; $('saveStatus').hidden = name !== 'setup'; $('gameMeta').hidden = name === 'setup';
    document.body.classList.toggle('is-playing', name === 'game');
    if (name !== 'game') document.body.classList.remove('is-cooperative');
    document.body.classList.toggle('large-text', state.session?.settings.largeText === true && name === 'game');
    setProjection(name === 'game');
    if (name === 'setup') renderResume();
    publishAudience();
    window.scrollTo(0, 0);
  }
  function syncDraft() {
    state.draft.title = $('listTitle').value; state.draft.text = $('wordInput').value;
    state.draft.frontLabel = $('frontLabel').value; state.draft.backLabel = $('backLabel').value;
    state.draft.subject = $('subjectSelect').value; state.draft.folderId = $('listFolderSelect').value || null;
  }
  function draftChanged() {
    const list = state.lists.find(v => v.id === state.draft.id);
    return !list || list.title !== C.clean(state.draft.title) || list.subject !== state.draft.subject || list.folderId !== state.draft.folderId || list.frontLabel !== C.clean(state.draft.frontLabel) || list.backLabel !== C.clean(state.draft.backLabel) || C.serializePairs(list.pairs) !== C.serializePairs(parsed.pairs) || parsed.errors.length > 0;
  }
  function renderEditor() {
    $('listTitle').value = state.draft.title; $('wordInput').value = state.draft.text;
    $('frontLabel').value = state.draft.frontLabel; $('backLabel').value = state.draft.backLabel;
    $('subjectSelect').value = state.draft.subject;
    renderFolders();
    renderParsing(); renderLibrary(); updateDirectionLabels();
  }
  function renderParsing() {
    parsed = C.parseWordList($('wordInput').value);
    const count = parsed.pairs.length;
    const valid = count > 0 && parsed.errors.length === 0;
    $('parseStatus').textContent = parsed.errors.length ? `${parsed.errors.length} ligne${parsed.errors.length > 1 ? 's' : ''} à corriger` : count ? `${count} question${count > 1 ? 's' : ''} prête${count > 1 ? 's' : ''}` : 'Collez vos premières questions';
    $('parseStatus').classList.toggle('invalid', parsed.errors.length > 0);
    $('parseErrors').hidden = parsed.errors.length === 0;
    $('parseErrorSummary').textContent = 'Voir les lignes à corriger';
    $('parseErrorList').innerHTML = parsed.errors.slice(0, 20).map(e => `<li>${e.line ? `Ligne ${e.line} : ` : ''}${esc(e.message)}</li>`).join('') + (parsed.errors.length > 20 ? '<li>Et d’autres lignes…</li>' : '');
    const notes = [];
    if (parsed.duplicates) notes.push(`${parsed.duplicates} doublon${parsed.duplicates > 1 ? 's' : ''} ignoré${parsed.duplicates > 1 ? 's' : ''}`);
    if (parsed.headers) notes.push('En-tête reconnu et ignoré');
    $('parseNote').textContent = notes.join(' · '); $('parseNote').hidden = !notes.length;
    const lines = Math.min(3000, $('wordInput').value.split('\n').length);
    $('lineNumbers').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n'); $('lineNumbers').scrollTop = $('wordInput').scrollTop;
    $('saveListButton').disabled = !valid; $('previewButton').disabled = !count;
    const oriented = C.orientPairs(parsed.pairs, state.settings.direction);
    const distinct = new Set(oriented.map(p => C.wordKey(p.back))).size;
    const plan = C.roundPlan(oriented.length, state.settings.teams, state.settings.rounds);
    if (!plan.valid) state.settings.rounds = 0;
    $('roundsSelect').innerHTML = '<option value="0">Choisir le nombre…</option>' + plan.choices.map(n => `<option value="${n}">${n} questions · ${n / state.settings.teams} par équipe</option>`).join('');
    $('roundsSelect').value = state.settings.rounds;
    $('roundsSelect').disabled = !valid || !plan.maximum;
    $('roundsHint').textContent = !valid ? 'Préparez la liste pour choisir la durée de la partie.' : !plan.valid ? `Choisissez un multiple de ${state.settings.teams}. Chaque équipe aura exactement autant d’occasions de répondre.` : `${state.settings.rounds} questions : ${plan.perTeam} occasion${plan.perTeam > 1 ? 's' : ''} par équipe.${plan.repeats ? ` Les ${oriented.length} questions seront mélangées à nouveau après chaque passage ; certaines reviendront, jamais deux manches de suite.` : plan.unused ? ` ${plan.unused} question${plan.unused > 1 ? 's' : ''} de la liste ne ${plan.unused > 1 ? 'seront' : 'sera'} pas tirée${plan.unused > 1 ? 's' : ''} cette fois.` : ' Toute la liste sera jouée.'} Ordre aléatoire, avec passages consécutifs possibles.`;
    const ready = valid && oriented.length >= 3 && distinct >= 3 && plan.valid;
    $('startGameButton').disabled = !ready;
    const effectiveWords = Math.min(state.settings.words, distinct - 1);
    $('gameReadiness').textContent = !count ? 'Au moins 3 questions pour jouer.' : parsed.errors.length ? 'Corrigez les lignes signalées avant de jouer.' : oriented.length < 3 || distinct < 3 ? 'Il faut 3 questions et 3 réponses différentes.' : !plan.maximum ? `Prévoyez au moins ${state.settings.teams} questions ou moins d’équipes.` : !plan.valid ? 'Choisissez le nombre de questions avant de lancer la partie.' : effectiveWords < state.settings.words ? `Liste courte : ${effectiveWords} réponses par équipe pour éviter les doublons.` : state.settings.words > 3 && oriented.some(p => p.back.length > 35) ? 'Réponses longues : 2 ou 3 propositions par équipe améliorent la lisibilité.' : '';
    $('sampleButton').disabled = !C.subjects[state.draft.subject]?.example;
    const isArchived = state.lists.find(v => v.id === state.draft.id)?.archived;
    $('draftStatus').textContent = isArchived ? 'Liste archivée' : draftChanged() ? 'Brouillon conservé' : 'Liste enregistrée';
    $('archiveButton').textContent = isArchived ? 'Restaurer cette liste' : 'Archiver cette liste';
    $('archiveButton').disabled = !state.draft.id;
  }
  function renderLibrary() {
    const query = C.key($('listSearch').value);
    const lists = state.lists.filter(v => v.archived === showArchives && C.key(v.title).includes(query) && (folderFilter === 'all' || (folderFilter === 'unfiled' ? !v.folderId : v.folderId === folderFilter))).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    $('libraryList').innerHTML = lists.length ? lists.map(list => `<div class="library-row ${list.id === state.draft.id ? 'active' : ''}"><button class="library-select" data-list-id="${esc(list.id)}" ${list.id === state.draft.id ? 'aria-current="true"' : ''}><strong>${esc(list.title)}</strong><span>${list.pairs.length} questions · ${esc(C.subjects[list.subject].name)}${list.archived ? ' · archivée' : ''}</span>${folderFilter === 'all' && list.folderId ? `<small class="folder-label">${icon('folder')}${esc(state.folders.find(f => f.id === list.folderId)?.name || '')}</small>` : ''}</button><button class="archive-action" data-list-options="${esc(list.id)}" aria-label="Options pour ${esc(list.title)}" title="Options de la liste">···</button></div>`).join('') : `<p class="empty-library">${query ? 'Aucune liste ne correspond.' : showArchives ? 'Aucune liste archivée ici.' : 'Aucune liste ici. Créez-en une avec le bouton +.'}</p>`;
    $('showArchivesButton').querySelector('span').textContent = showArchives ? 'Revenir aux listes actives' : 'Listes archivées';
  }
  function folderOptions(selected = null) {
    return `<option value="">Sans dossier</option>${state.folders.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(f => `<option value="${esc(f.id)}" ${selected === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}`;
  }
  function renderFolders() {
    if (!['all', 'unfiled'].includes(folderFilter) && !state.folders.some(f => f.id === folderFilter)) folderFilter = 'all';
    $('folderFilter').innerHTML = `<option value="all">Tous les dossiers</option><option value="unfiled">Sans dossier</option>${state.folders.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;
    $('folderFilter').value = folderFilter; $('manageFolderButton').disabled = ['all', 'unfiled'].includes(folderFilter);
    $('listFolderSelect').innerHTML = folderOptions(state.draft.folderId);
  }
  function createFolder(assign = false) {
    if (state.folders.length >= 100) { toast('Vous avez déjà 100 dossiers.', true); return; }
    openDialog(`<h2 id="dialogTitle">Nouveau dossier</h2><p>Regroupez vos listes par thème, branche ou chapitre.</p><label class="field">Nom du dossier<input id="folderName" maxlength="60" placeholder="Ex. : Maths · fractions"></label><p id="folderError" class="field-error" role="status"></p><div class="dialog-actions"><button id="createFolderConfirm" class="btn primary">Créer le dossier</button></div>`, '#folderName');
    const create = () => {
      const name = C.clean($('folderName').value);
      if (!name || state.folders.some(f => C.key(f.name) === C.key(name))) { $('folderError').textContent = !name ? 'Donnez un nom au dossier.' : 'Ce dossier existe déjà.'; return; }
      const folder = { id: C.uid(), name }; state.folders.push(folder); folderFilter = folder.id;
      if (assign) state.draft.folderId = folder.id;
      save(); renderFolders(); renderLibrary(); renderParsing(); $('appDialog').close(); toast('Dossier créé.');
    };
    $('createFolderConfirm').onclick = create;
    $('folderName').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); create(); } };
  }
  function manageFolder() {
    const folder = state.folders.find(f => f.id === folderFilter); if (!folder) return;
    openDialog(`<h2 id="dialogTitle">Gérer le dossier</h2><label class="field">Nom<input id="folderName" maxlength="60" value="${esc(folder.name)}"></label><p id="folderError" class="field-error" role="status"></p><div class="dialog-actions"><button id="removeFolder" class="btn danger">Supprimer le dossier</button><button id="renameFolder" class="btn primary">Enregistrer</button></div><p class="small muted">Supprimer un dossier conserve toutes ses listes dans « Sans dossier ».</p>`, '#folderName');
    $('renameFolder').onclick = () => {
      const name = C.clean($('folderName').value);
      if (!name || state.folders.some(f => f.id !== folder.id && C.key(f.name) === C.key(name))) { $('folderError').textContent = 'Choisissez un nom unique et non vide.'; return; }
      folder.name = name; save(); renderFolders(); renderLibrary(); $('appDialog').close();
    };
    $('removeFolder').onclick = () => confirmDialog('Supprimer ce dossier ?', `Les listes du dossier « ${folder.name} » seront conservées dans « Sans dossier ».`, 'Supprimer le dossier', () => {
      state.folders = state.folders.filter(f => f.id !== folder.id);
      state.lists.forEach(list => { if (list.folderId === folder.id) list.folderId = null; });
      if (state.draft.folderId === folder.id) state.draft.folderId = null;
      folderFilter = 'unfiled'; save(); renderFolders(); renderLibrary(); renderParsing(); toast('Dossier supprimé, listes conservées.');
    });
  }
  function updateDirectionLabels() {
    const front = C.clean($('frontLabel').value) || 'Colonne 1'; const back = C.clean($('backLabel').value) || 'Colonne 2';
    $('directionSelect').options[0].textContent = `${front} → ${back}`; $('directionSelect').options[1].textContent = `${back} → ${front}`;
  }
  function renderSettings() {
    document.querySelectorAll('[data-teams]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.teams) === state.settings.teams));
    document.querySelectorAll('[data-words]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.words) === state.settings.words));
    $('countdownSelect').value = state.settings.seconds; $('directionSelect').value = state.settings.direction;
    $('roundsSelect').value = state.settings.rounds; $('largeText').checked = state.settings.largeText;
    $('modeSelect').value = state.settings.mode; $('goalPercent').value = state.settings.goalPercent;
    ['correctPoints', 'incorrectPenalty', 'falseStartPenalty'].forEach(id => $(id).value = state.settings[id]);
    updateMode();
    $('teamNames').innerHTML = state.settings.teamNames.slice(0, state.settings.teams).map((name, i) => `<label class="team-name-row" style="--team-color:${colors[i]}"><span class="team-letter">${String.fromCharCode(65 + i)}</span><input data-team-name="${i}" value="${esc(name)}" maxlength="24" aria-label="Nom de l’équipe ${String.fromCharCode(65 + i)}"></label>`).join('');
    updateDirectionLabels(); renderParsing();
  }
  function updateMode() {
    const mode = state.settings.mode;
    $('modeHint').textContent = mode === 'cooperative' ? 'Un grand score commun pour la classe. La jauge avance à chaque manche réussie sans faux départ ; tous les points sont partagés.' : 'Chaque équipe joue pour son score. Le nombre d’occasions de répondre est identique pour toutes.';
    $('cooperativeOptions').hidden = mode !== 'cooperative';
    $('scoringSummary').textContent = `+${state.settings.correctPoints} si réussi, −${state.settings.incorrectPenalty} si manqué, −${state.settings.falseStartPenalty} par faux départ.`;
  }
  function renderResume() {
    const g = state.session; $('resumeBanner').hidden = !g;
    if (g) {
      const finished = g.phase === 'finished';
      $('resumeHeading').textContent = finished ? 'Votre dernier bilan est disponible.' : 'Une partie vous attend.';
      $('resumeDetails').textContent = `${g.title} · ${g.history.length} manche${g.history.length > 1 ? 's' : ''} jouée${g.history.length > 1 ? 's' : ''}${!g.balancedTeams && !g.practice ? ' · Ancienne partie : tirage initial conservé.' : ''}`;
      $('resumeButton').lastChild.textContent = finished ? 'Voir le dernier bilan' : 'Reprendre la partie';
      $('dismissSessionButton').setAttribute('aria-label', finished ? 'Fermer le dernier bilan' : 'Abandonner la partie');
      $('dismissSessionButton').title = finished ? 'Fermer le dernier bilan' : 'Abandonner la partie';
    }
  }
  function openDialog(html, focusSelector) {
    if ($('appDialog').open) $('appDialog').close();
    $('dialogContent').innerHTML = html; $('appDialog').showModal();
    if (focusSelector) $('dialogContent').querySelector(focusSelector)?.focus();
  }
  function confirmDialog(title, text, label, fn) {
    openDialog(`<h2 id="dialogTitle">${esc(title)}</h2><p>${esc(text)}</p><div class="dialog-actions"><button class="btn" id="cancelAction">Annuler</button><button class="btn primary" id="confirmAction">${esc(label)}</button></div>`, '#cancelAction');
    $('cancelAction').onclick = () => $('appDialog').close();
    $('confirmAction').onclick = () => { $('appDialog').close(); fn(); };
  }
  async function preserveDraftThen(fn) {
    if (draftChanged() && (C.clean(state.draft.text) || C.clean(state.draft.title))) {
      if (parsed.pairs.length && !parsed.errors.length) {
        if (saveList(true)) fn();
      } else {
        confirmDialog('Conserver votre brouillon ?', 'Ce brouillon comporte des lignes incomplètes. Exportez-le avant de changer de liste si vous souhaitez le garder.', 'Exporter le brouillon', async () => {
          const done = await exportFile(state.draft.title || 'Brouillon', state.draft.text, 'txt'); if (done) fn();
        });
      }
    } else fn();
  }
  function saveList(quiet = false, forceCopy = false) {
    syncDraft(); renderParsing();
    if (!parsed.pairs.length || parsed.errors.length) { toast('Corrigez la liste avant de l’enregistrer.', true); return false; }
    const index = forceCopy ? -1 : state.lists.findIndex(v => v.id === state.draft.id);
    if (index === -1 && state.lists.length >= 500) { toast('La bibliothèque contient déjà 500 listes. Exportez-la.', true); return false; }
    const list = C.sanitizeList({ id: index >= 0 ? state.draft.id : C.uid(), title: (state.draft.title || 'Liste sans titre') + (forceCopy ? ' — copie' : ''),
      frontLabel: state.draft.frontLabel, backLabel: state.draft.backLabel, subject: state.draft.subject, folderId: state.draft.folderId, pairs: parsed.pairs, archived: false });
    if (index >= 0) state.lists[index] = list; else state.lists.push(list);
    state.draft = draftFrom(list); showArchives = false; save(); renderEditor();
    if (!quiet) toast(forceCopy ? 'Copie ajoutée à vos listes.' : 'Liste enregistrée.');
    return true;
  }
  function newList() {
    preserveDraftThen(() => { state.draft = { ...state.draft, id: null, title: '', text: '', folderId: ['all', 'unfiled'].includes(folderFilter) ? null : folderFilter }; save(); renderEditor(); $('listTitle').focus(); });
  }
  function sampleList() {
    const subject = state.draft.subject; const preset = C.subjects[subject]; if (!preset.example) return;
    preserveDraftThen(() => {
      state.draft = { id: null, title: preset.title, text: preset.example, subject, frontLabel: preset.front, backLabel: preset.back, folderId: state.draft.folderId };
      save(); renderEditor(); toast('Exemple chargé dans une nouvelle liste.');
    });
  }
  function archiveList(id) {
    const list = state.lists.find(v => v.id === id); if (!list) return;
    list.archived = !list.archived; list.updatedAt = new Date().toISOString(); save(); renderLibrary(); renderParsing();
    toast(list.archived ? 'Liste archivée. Vous pouvez la restaurer à tout moment.' : 'Liste restaurée.');
  }
  function listOptions(id) {
    const list = state.lists.find(v => v.id === id); if (!list) return;
    openDialog(`<h2 id="dialogTitle">${esc(list.title)}</h2><p>${list.pairs.length} questions · ${esc(C.subjects[list.subject].name)}</p><label class="field">Ranger dans un dossier<select id="moveFolderSelect">${folderOptions(list.folderId)}</select></label><div class="dialog-actions"><button id="listExport" class="btn">Exporter</button><button id="listArchive" class="btn secondary">${list.archived ? 'Restaurer la liste' : 'Archiver la liste'}</button><button id="moveList" class="btn primary">Enregistrer le dossier</button></div>`);
    $('listExport').onclick = () => exportLists([list], list.title);
    $('listArchive').onclick = () => { archiveList(id); $('appDialog').close(); };
    $('moveList').onclick = () => {
      list.folderId = $('moveFolderSelect').value || null; list.updatedAt = new Date().toISOString();
      if (state.draft.id === list.id) state.draft.folderId = list.folderId;
      save(); renderFolders(); renderLibrary(); renderParsing(); $('appDialog').close(); toast('Liste rangée.');
    };
  }
  function preview() {
    openDialog(`<h2 id="dialogTitle">Aperçu de la liste</h2><p>${parsed.pairs.length} paires reconnues${parsed.errors.length ? ' · Des lignes restent à corriger avant de jouer.' : ''}.</p><div class="preview-scroll"><table class="preview-table"><thead><tr><th>#</th><th>${esc(state.draft.frontLabel || 'Mot')}</th><th>${esc(state.draft.backLabel || 'Traduction')}</th></tr></thead><tbody>${parsed.pairs.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.front)}</td><td>${esc(p.back)}</td></tr>`).join('')}</tbody></table></div><div class="dialog-actions"><button id="closePreview" class="btn primary">C’est bon</button></div>`);
    $('closePreview').onclick = () => $('appDialog').close();
  }
  async function copyText(text) {
    try {
      if (window.standup) { const result = await window.standup.copyText(text); if (!result.ok) throw new Error(result.error); }
      else await navigator.clipboard.writeText(text);
      toast('Prompt copié. Collez-le dans votre IA préférée.'); return true;
    } catch { toast('La copie automatique n’est pas disponible. Sélectionnez le prompt puis faites ⌘C ou Ctrl+C.', true); return false; }
  }
  function aiPrompt() {
    const subject = C.subjects[state.draft.subject];
    openDialog(`<h2 id="dialogTitle">Une liste avec votre IA</h2><p>${esc(subject.name)} · Copiez le prompt dans votre IA, puis collez sa réponse dans la liste.</p><div class="dialog-grid"><label class="field">Thème<input id="aiTopic" value="${esc(state.draft.title || subject.title)}"></label><label class="field">Public / niveau<input id="aiLevel" value="élèves de 12 à 14 ans${state.draft.subject === 'vocabulary' ? ', niveau A1' : ''}"></label><label class="field">Première colonne<input id="aiFront" value="${esc(state.draft.frontLabel)}"></label><label class="field">Deuxième colonne<input id="aiBack" value="${esc(state.draft.backLabel)}"></label><label class="field">Nombre de questions<input id="aiCount" type="number" min="3" max="100" value="30"></label></div><label class="field">Prompt prêt à copier<textarea id="aiPromptText" spellcheck="false"></textarea></label><div class="dialog-actions"><button id="copyPromptButton" class="btn primary">${icon('copy')}Copier le prompt</button></div>`);
    function update() {
      const n = Math.min(100, Math.max(3, Number($('aiCount').value) || 30));
      $('aiPromptText').value = `Prépare ${n} questions avec leur réponse pour un jeu de classe StandUp Quiz.\n\nBranche : ${subject.name}.\nThème : ${$('aiTopic').value || subject.title}.\nPublic et niveau : ${$('aiLevel').value || 'débutants'}.\nPremière colonne (question) : ${$('aiFront').value || subject.front}.\nDeuxième colonne (réponse) : ${$('aiBack').value || subject.back}.\n\nRègles du jeu : une question est projetée et les équipes cherchent sa réponse dans des colonnes de propositions. Une seule proposition doit pouvoir être correcte.\n\nContraintes :\n- ${subject.guidance}\n- Aucun doublon ; au moins 3 réponses distinctes. Évite les formulations équivalentes qui créeraient plusieurs bonnes réponses.\n- Questions courtes (idéalement moins de 90 caractères), réponses très courtes (idéalement moins de 30 caractères) pour la projection. Maximum absolu : 160 caractères par cellule.\n- Une paire par ligne, exactement au format question ; réponse.\n- Aucun numéro, titre, commentaire, tableau Markdown ni bloc de code.\n- Si une cellule contient un point-virgule, entoure-la de guillemets. Garde les virgules décimales dans leur cellule.\n\nVérifie l’exactitude de toutes les réponses avant de répondre.`;
    }
    ['aiTopic','aiLevel','aiFront','aiBack','aiCount'].forEach(id => $(id).addEventListener('input', update)); update();
    $('copyPromptButton').onclick = async () => { if (!await copyText($('aiPromptText').value)) { $('aiPromptText').focus(); $('aiPromptText').select(); } };
  }
  async function exportFile(name, content, type = 'standup') {
    try {
      if (window.standup) {
        const result = await window.standup.exportFile({ name, content, type });
        if (!result.ok) throw new Error(result.error);
        if (result.canceled) return false;
      } else {
        const blob = new Blob([content], { type: type === 'standup' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${name.replace(/[<>:"/\\|?*]/g, '_')}.${type}`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      toast('Fichier exporté.'); return true;
    } catch (error) { toast(`Export impossible : ${error.message}`, true); return false; }
  }
  function exportLists(lists, name, allFolders = false) {
    const folders = state.folders.filter(f => allFolders || lists.some(list => list.folderId === f.id));
    return exportFile(name, JSON.stringify({ format: 'standup-quiz', version: 2, exportedAt: new Date().toISOString(), folders, lists }, null, 2));
  }
  async function exportLibrary() {
    if (parsed.pairs.length && !parsed.errors.length && draftChanged()) saveList(true);
    if (!state.lists.length && !state.folders.length) { toast('Votre bibliothèque est encore vide.', true); return; }
    await exportLists(state.lists, 'Bibliothèque StandUp Quiz', true);
  }
  function importContent(name, content) {
    if (/\.(?:standup|json)$/i.test(name) || /^\s*\{/.test(content)) {
      let bundle;
      try { bundle = C.importBundle(content); C.mergeLibrary(state.lists, state.folders, bundle); } catch (error) { toast(error.message, true); return; }
      preserveDraftThen(() => {
        try {
          const merged = C.mergeLibrary(state.lists, state.folders, bundle);
          state.lists = merged.lists; state.folders = merged.folders;
          save(); renderFolders(); renderLibrary();
          toast(merged.added || merged.addedFolders ? `${merged.added} liste(s) et ${merged.addedFolders} dossier(s) ajouté(s).` : 'Ces listes sont déjà dans votre bibliothèque.');
        } catch (error) { toast(error.message, true); }
      });
    } else {
      if (content.length > C.MAX_TEXT) { toast('La liste dépasse la limite de 1 Mo.', true); return; }
      preserveDraftThen(() => {
        state.draft = { ...state.draft, id: null, title: name.replace(/\.[^.]+$/, '').slice(0, 100), text: content };
        save(); renderEditor(); toast('Fichier chargé. Vérifiez l’aperçu avant de jouer.');
      });
    }
  }
  async function importFile() {
    if (!window.standup) { $('fileInput').click(); return; }
    try {
      const result = await window.standup.importFile(); if (!result.ok) throw new Error(result.error);
      if (!result.canceled) importContent(result.name, result.content);
    } catch (error) { toast(`Import impossible : ${error.message}`, true); }
  }
  function help() {
    const s = state.settings;
    openDialog(`<h2 id="dialogTitle">La classe se lève !</h2><p>Langues, calcul mental, histoire… Le même jeu pour toutes les branches.</p><ol class="help-list"><li><strong>Préparez.</strong> Choisissez une branche puis collez au moins 3 paires « question ; réponse ». Rangez vos listes dans des dossiers.</li><li><strong>Projetez.</strong> Formez 2 à 6 équipes. Une seule équipe possède la bonne réponse : ses membres se lèvent. Le bouton « Écran élèves » ouvre une projection séparée, facultative. Le jeu fonctionne aussi dans une seule fenêtre.</li><li><strong>Révélez.</strong> Indiquez les faux départs avant de valider « Réussi » ou « Manqué ». Les points sont attribués une seule fois, et restent annulables.</li></ol><div class="help-score"><span><strong>+${s.correctPoints}</strong>Bonne équipe levée</span><span><strong>−${s.incorrectPenalty}</strong>Bonne équipe restée assise</span><span><strong>−${s.falseStartPenalty}</strong>Mauvaise équipe levée</span></div><p>Le barème se règle avant la partie. En mode coopératif, les points sont communs ; une réussite sans faux départ fait avancer l’objectif. Choisissez avant de jouer un nombre de questions multiple du nombre d’équipes : chacune a exactement le même nombre d’occasions, dans un ordre mélangé sur toute la partie. Le bilan propose une révision coopérative des questions manquées ou avec faux départ, sans classement.</p><p>La pause masque les propositions. Les questions ne se répètent pas et la bonne réponse tourne entre les équipes. Les boutons + et − permettent une correction manuelle.</p><p><strong>Clavier :</strong> Espace = démarrer, pause ou suite · Entrée = révéler · G / P = réussi / manqué · 1–6 = faux départ · F = plein écran · ⌘S / Ctrl+S = enregistrer une liste.</p><div class="dialog-actions"><button id="closeHelp" class="btn primary">C’est parti</button></div>`);
    $('closeHelp').onclick = () => $('appDialog').close();
  }
  function stopTimer() { clearInterval(tickTimer); tickTimer = null; }
  function runTimer() {
    stopTimer(); deadline = performance.now() + state.session.remaining; lastTimerSecond = null;
    tickTimer = setInterval(updateTimer, 80); updateTimer();
  }
  function updateTimer() {
    const g = state.session; if (!g || g.phase !== 'thinking') return;
    g.remaining = Math.max(0, deadline - performance.now());
    const seconds = Math.ceil(g.remaining / 1000);
    $('timerNumber').textContent = seconds;
    $('timer').style.setProperty('--progress', `${Math.min(100, g.remaining / (g.settings.seconds * 1000) * 100)}%`);
    $('timer').classList.toggle('urgent', seconds <= 2);
    if (seconds !== lastTimerSecond) { lastTimerSecond = seconds; save(); publishAudience(); }
    if (g.remaining <= 0) { stopTimer(); g.phase = 'waiting'; save(); renderGame(); }
  }
  function pauseGame() {
    const g = state.session; if (!g) return;
    if (g.phase === 'thinking') { g.remaining = Math.max(0, deadline - performance.now()); stopTimer(); g.phase = 'paused'; save(); renderGame(); }
    else if (g.phase === 'paused') { g.phase = 'thinking'; save(); renderGame(); runTimer(); }
  }
  function leaveGame() {
    if (screen === 'game' && state.session?.phase === 'thinking') pauseGame();
    stopTimer(); showScreen('setup'); renderResume(); persistNative();
  }
  function startGame() {
    syncDraft(); renderParsing(); if ($('startGameButton').disabled) return;
    const start = () => {
      if (!saveList(true)) return;
      try { state.session = C.prepareGame(parsed.pairs, { ...state.settings, subject: state.draft.subject }, state.draft.title); state.session.sourceListId = state.draft.id; }
      catch (error) { toast(error.message, true); return; }
      stopTimer(); save(); showScreen('game'); renderGame();
    };
    if (state.session && state.session.phase !== 'finished') confirmDialog('Lancer une nouvelle partie ?', 'La partie précédente peut encore être reprise. Une nouvelle partie remettra ses scores à zéro.', 'Nouvelle partie', start);
    else start();
  }
  function roundStart() {
    if (!state.session || !C.startRound(state.session)) return;
    save(); renderGame(); if (state.session.phase === 'thinking') runTimer();
  }
  function roundReveal() {
    if (!state.session || !C.reveal(state.session)) return;
    save(); renderGame();
  }
  function roundAward(success) {
    if (!state.session || !C.award(state.session, success)) return;
    save(); renderGame();
  }
  function roundNext() {
    if (!state.session || !C.nextRound(state.session)) return;
    if (state.session.phase === 'finished') { save(); renderSummary(); return; }
    C.startRound(state.session); save(); renderGame();
    if (state.session.phase === 'thinking') runTimer();
  }
  function toggleFalseStart(index) {
    const g = state.session; if (!g || g.phase !== 'revealed' || index === g.round.correctTeam) return;
    g.round.standing[index] = !g.round.standing[index]; save(); renderGame();
  }
  function adjustScore(index, delta) {
    const g = state.session; if (!g || !['ready','waiting','revealed','scored'].includes(g.phase)) return;
    g.scoreUndo.push([...g.scores]); if (g.scoreUndo.length > 50) g.scoreUndo.shift();
    g.scores[index] += delta; save(); renderGame();
  }
  function undoPoints() {
    const g = state.session; if (!g || ['thinking','paused'].includes(g.phase)) return;
    if (g.scoreUndo.length) g.scores = g.scoreUndo.pop(); else if (!C.undoAward(g)) return;
    save(); renderGame();
  }
  function renderGame() {
    const g = state.session; if (!g) return;
    if (g.phase === 'finished') { renderSummary(); return; }
    const points = C.roundPoints(g); const paused = g.phase === 'paused';
    $('gameMeta').textContent = `${g.title} · ${g.settings.mode === 'cooperative' ? 'Coopératif' : 'Classique'}`;
    V.paintGame(document, C.publicView(g), true);
    // Teacher-only information is painted separately and never sent to the audience.
    if (audienceOpen && g.round && !['revealed', 'scored', 'paused'].includes(g.phase)) {
      $('revealedAnswer').textContent = `Enseignant : ${g.round.answer} · ${g.settings.teamNames[g.round.correctTeam]}`;
      $('revealedAnswer').classList.add('teacher-secret'); V.fit();
    }
    $('pauseButton').hidden = !['thinking','paused'].includes(g.phase);
    $('pauseButton').innerHTML = `${icon(paused ? 'play' : 'pause')}<span>${paused ? 'Reprendre' : 'Pause'}</span>`;
    $('undoButton').hidden = (!g.scoreUndo.length && g.phase !== 'scored') || ['thinking','paused'].includes(g.phase);
    $('undoButton').lastChild.textContent = g.scoreUndo.length ? 'Annuler la correction' : 'Annuler les points';
    $('finishButton').hidden = g.phase === 'thinking';
    $('commonCorrection').hidden = g.settings.mode !== 'cooperative';
    $('commonCorrection').querySelectorAll('button').forEach(b => b.disabled = ['thinking', 'paused'].includes(g.phase));
    const status = { ready: 'Tout le monde est prêt ?', thinking: 'Réflexion en cours…', paused: 'Le temps est suspendu.', waiting: g.settings.seconds ? 'Le temps est écoulé.' : 'À vous de révéler.', revealed: 'La bonne équipe s’est-elle levée ?', scored: g.round?.outcome === 'won' ? `Réussi · +${points.correct} points` : `Manqué · −${points.incorrect} points` };
    $('roundStatus').textContent = status[g.phase];
    const button = (id, label, cls = 'primary', glyph = '') => `<button id="${id}" class="btn ${cls}">${glyph ? icon(glyph) : ''}${label}</button>`;
    let actions = '';
    if (g.phase === 'ready') actions = button('beginRoundButton', 'Démarrer la manche', 'primary', 'play');
    if (['thinking','paused'].includes(g.phase)) actions = '<button class="btn" disabled>Révéler la réponse</button>';
    if (g.phase === 'waiting') actions = button('revealButton', 'Révéler la réponse', 'primary', 'eye');
    if (g.phase === 'revealed') actions = button('lostButton', `Manqué −${points.incorrect}`, 'danger', 'close') + button('wonButton', `Réussi +${points.correct}`, 'success', 'check');
    if (g.phase === 'scored') actions = button('nextRoundButton', g.cursor + 1 === g.order.length ? 'Voir le bilan' : 'Manche suivante', 'primary', 'next');
    $('roundActions').innerHTML = actions;
    $('beginRoundButton')?.addEventListener('click', roundStart); $('revealButton')?.addEventListener('click', roundReveal);
    $('lostButton')?.addEventListener('click', () => roundAward(false)); $('wonButton')?.addEventListener('click', () => roundAward(true)); $('nextRoundButton')?.addEventListener('click', roundNext);
    publishAudience();
  }
  function finishEarly() {
    const g = state.session; const previousPhase = g.phase;
    if (g.phase === 'thinking') pauseGame();
    confirmDialog('Terminer la partie ?', 'Le bilan conservera les manches évaluées. En terminant avant toutes les questions, les équipes n’auront pas forcément eu autant d’occasions de répondre.', 'Voir le bilan', () => {
      stopTimer(); g.cursor = g.order.length; g.round = null; g.phase = 'finished'; g.scoreUndo = []; save(); renderSummary();
    });
    $('appDialog').addEventListener('close', () => { if (previousPhase === 'thinking' && g.phase === 'paused' && screen === 'game') toast('La partie est en pause. Reprenez à votre rythme.'); }, { once: true });
  }
  function renderSummary() {
    const g = state.session; if (!g) return;
    showScreen('summary'); $('gameMeta').textContent = `${g.title} · Bilan`;
    const coop = g.settings.mode === 'cooperative'; const collective = C.cooperativeStatus(g);
    document.body.classList.toggle('is-cooperative', coop);
    const missed = C.missedIndices(g).length;
    const ranked = g.scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
    const winners = ranked.filter(v => v.score === ranked[0].score);
    const headline = !g.history.length ? 'À vous de rejouer !' : coop ? collective.reached ? 'Défi collectif relevé !' : 'Ensemble, on progresse !' : winners.length === ranked.length ? 'Toutes les équipes à égalité !' : winners.length > 1 ? 'Victoire partagée !' : `Bravo ${g.settings.teamNames[winners[0].i]} !`;
    let previousScore; let rank;
    const results = coop ? `<div class="collective-result"><strong>${collective.score}<small>points pour la classe</small></strong><div><h2>${collective.done} réussite${collective.done > 1 ? 's' : ''} · objectif ${collective.goal}</h2><progress max="${collective.goal}" value="${Math.min(collective.done, collective.goal)}"></progress><p>${collective.reached ? 'Objectif atteint, bravo à toute la classe !' : `Objectif : ${g.settings.goalPercent} % des manches réussies sans faux départ.`}</p></div></div>` : `<div class="podium">${ranked.map((v, index) => { if (v.score !== previousScore) rank = index + 1; previousScore = v.score; return `<div class="ranking-row" style="--team-color:${colors[v.i]}"><span class="rank">${rank}</span><strong>${esc(g.settings.teamNames[v.i])}</strong><span class="ranking-score">${v.score}<span>points</span></span></div>`; }).join('')}</div>`;
    $('summaryView').innerHTML = `<div class="summary-heading">${icon('trophy')}<h1>${esc(headline)}</h1><p>${esc(g.title)} · ${g.history.length} manche${g.history.length > 1 ? 's' : ''} jouée${g.history.length > 1 ? 's' : ''}${g.practice ? ' · Révision coopérative' : ''}</p></div>${results}${V.fairnessNote(C.publicView(g))}<div class="summary-actions"><button id="summaryHome" class="btn">${icon('back')}Mes listes</button><button id="exportResults" class="btn secondary">${icon('export')}Exporter le bilan</button><button id="rematchButton" class="btn secondary">Préparer une nouvelle partie</button>${missed ? `<button id="retryMissedButton" class="btn primary">${icon('undo')}Réviser ensemble · ${missed} question${missed > 1 ? 's' : ''}</button>` : ''}</div>${g.history.length ? `<p class="practice-hint">${missed ? 'La reprise ciblée se joue en coopération, sans classement : un seul passage sur les questions manquées ou avec faux départ, même s’il n’en reste qu’une.' : 'Toutes les questions jouées ont été réussies sans faux départ. Bravo !'}</p><details class="history-details" open><summary>Les questions jouées</summary><div class="history-scroll"><table class="history-table"><thead><tr><th>Question</th><th>Réponse</th><th>Équipe</th><th>Résultat</th></tr></thead><tbody>${g.history.map(h => { const delta = C.historyPoints(h); return `<tr><td>${esc(h.question)}</td><td>${esc(h.answer)}</td><td>${esc(g.settings.teamNames[h.team])}</td><td class="${h.success && !h.falseStarts.length ? '' : 'missed'}">${h.success ? 'Réussi' : 'Manqué'} · ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}${h.falseStarts.length ? `<br><small>${h.falseStarts.length} faux départ${h.falseStarts.length > 1 ? 's' : ''} · −${h.falseStarts.length * g.settings.falseStartPenalty} pts</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div></details>` : ''}<p class="summary-note">Le dernier bilan reste accessible depuis l’écran de préparation.</p>`;
    $('summaryHome').onclick = leaveGame; $('exportResults').onclick = exportResults;
    $('rematchButton').onclick = () => {
      preserveDraftThen(() => {
        const source = state.lists.find(list => list.id === g.sourceListId) || state.lists.find(list => list.title === g.title && JSON.stringify(C.orientPairs(list.pairs, g.settings.direction)) === JSON.stringify(g.pairs));
        state.draft = source ? draftFrom(source) : { id: null, title: g.title, text: C.serializePairs(g.pairs), frontLabel: 'Question', backLabel: 'Réponse', subject: g.settings.subject, folderId: null };
        state.settings = { ...C.clone(g.settings), rounds: 0, direction: source ? g.settings.direction : 'forward' };
        save(); showScreen('setup'); renderEditor(); renderSettings(); $('roundsSelect').focus();
      });
    };
    $('retryMissedButton')?.addEventListener('click', () => {
      state.session = C.replayMissed(g); save(); showScreen('game'); renderGame();
      toast('Révision coopérative : score commun et aucun classement.');
    });
    publishAudience();
  }
  function exportResults() {
    const g = state.session; const s = g.settings; const coop = s.mode === 'cooperative';
    const cell = v => `"${(/^[=+\-@\t\r]/.test(String(v)) ? "'" : '') + String(v).replace(/"/g, '""')}"`;
    const collective = C.cooperativeStatus(g);
    const fair = C.opportunities(g);
    const rows = [['StandUp Quiz — Bilan', g.title], ['Mode', coop ? 'Coopératif' : 'Classique'], ['Questions prévues', g.order.length, 'Questions jouées', g.history.length], ['Occasions de répondre', ...s.teamNames.slice(0, s.teams)], ['', ...fair.counts], ['Bonne réponse', s.correctPoints, 'Erreur', s.incorrectPenalty, 'Faux départ', s.falseStartPenalty],
      ...(coop ? [['Points collectifs', collective.score], ['Réussites sans faux départ', collective.done, 'Objectif', collective.goal]] : [['Équipe', 'Points'], ...g.scores.map((score, i) => [s.teamNames[i], score])]), [],
      ['Question', 'Réponse', 'Équipe attendue', 'Résultat', 'Faux départs', 'Variation totale des points'],
      ...g.history.map(h => [h.question, h.answer, s.teamNames[h.team], h.success ? 'Réussi' : 'Manqué', h.falseStarts.map(i => s.teamNames[i]).join(', '), h.after.reduce((a, b) => a + b, 0) - h.before.reduce((a, b) => a + b, 0)])];
    exportFile(`${g.title} — bilan`, '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n'), 'csv');
  }
  function resume() {
    if (!state.session) return;
    if (state.session.phase === 'finished') renderSummary();
    else { showScreen('game'); renderGame(); }
  }
  function primarySpace() {
    const phase = state.session?.phase;
    if (phase === 'ready') roundStart(); else if (['thinking','paused'].includes(phase)) pauseGame(); else if (phase === 'scored') roundNext();
  }
  function bindEvents() {
    ['listTitle','wordInput','frontLabel','backLabel'].forEach(id => $(id).addEventListener('input', () => { syncDraft(); renderParsing(); updateDirectionLabels(); save(); }));
    $('wordInput').addEventListener('scroll', () => { $('lineNumbers').scrollTop = $('wordInput').scrollTop; });
    $('wordInput').addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const t = e.target; t.setRangeText('\t', t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    $('listSearch').addEventListener('input', renderLibrary);
    $('folderFilter').onchange = () => { folderFilter = $('folderFilter').value; renderFolders(); renderLibrary(); };
    $('newFolderButton').onclick = () => createFolder(); $('editorFolderButton').onclick = () => createFolder(true);
    $('manageFolderButton').onclick = manageFolder;
    $('listFolderSelect').onchange = () => { syncDraft(); renderParsing(); save(); };
    $('subjectSelect').onchange = () => {
      const old = C.subjects[state.draft.subject]; const next = C.subjects[$('subjectSelect').value];
      if ($('frontLabel').value === old.front) $('frontLabel').value = next.front;
      if ($('backLabel').value === old.back) $('backLabel').value = next.back;
      syncDraft(); renderParsing(); updateDirectionLabels(); save();
    };
    $('sampleButton').onclick = sampleList;
    $('modeSelect').onchange = () => { state.settings.mode = $('modeSelect').value; updateMode(); save(); };
    $('goalPercent').onchange = () => { state.settings.goalPercent = Number($('goalPercent').value); save(); };
    ['correctPoints', 'incorrectPenalty', 'falseStartPenalty'].forEach(id => {
      $(id).addEventListener('input', () => {
        const value = Number($(id).value);
        if ($(id).value !== '' && Number.isInteger(value) && value >= 0 && value <= 100) { state.settings[id] = value; updateMode(); save(); }
      });
      $(id).addEventListener('change', () => {
        const value = Number($(id).value);
        state.settings[id] = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : C.defaults[id];
        $(id).value = state.settings[id]; updateMode(); save();
      });
    });
    $('resetScoring').onclick = () => { ['correctPoints', 'incorrectPenalty', 'falseStartPenalty'].forEach(id => { state.settings[id] = C.defaults[id]; $(id).value = C.defaults[id]; }); updateMode(); save(); };
    $('audienceButton').onclick = () => audienceOptions().catch(error => toast(error.message, true));
    window.standup?.onAudienceClosed(() => audienceChanged(false));
    $('commonCorrection').addEventListener('click', e => { const button = e.target.closest('[data-common-delta]'); if (button) adjustScore(0, Number(button.dataset.commonDelta)); });
    $('newListButton').onclick = newList; $('saveListButton').onclick = () => saveList(); $('duplicateButton').onclick = () => saveList(false, true);
    $('archiveButton').onclick = () => { archiveList(state.draft.id); document.querySelector('.list-options').open = false; };
    $('exportListButton').onclick = () => {
      if (parsed.errors.length || !parsed.pairs.length) { toast('Corrigez la liste avant de l’exporter.', true); return; }
      exportLists([C.sanitizeList({ ...state.draft, pairs: parsed.pairs })], state.draft.title || 'Liste de mots');
    };
    $('exportLibraryButton').onclick = exportLibrary;
    $('importButton').onclick = importFile; $('importLibraryButton').onclick = importFile;
    $('showArchivesButton').onclick = () => { showArchives = !showArchives; renderLibrary(); };
    $('libraryList').addEventListener('click', e => {
      const listButton = e.target.closest('[data-list-id]'); const menu = e.target.closest('[data-list-options]');
      if (menu) listOptions(menu.dataset.listOptions);
      else if (listButton && listButton.dataset.listId !== state.draft.id) preserveDraftThen(() => {
        const list = state.lists.find(v => v.id === listButton.dataset.listId); if (list) { state.draft = draftFrom(list); save(); renderEditor(); }
      });
    });
    document.querySelectorAll('[data-teams]').forEach(b => b.onclick = () => { state.settings.teams = Number(b.dataset.teams); renderSettings(); save(); });
    document.querySelectorAll('[data-words]').forEach(b => b.onclick = () => { state.settings.words = Number(b.dataset.words); renderSettings(); save(); });
    $('teamNames').addEventListener('input', e => { if (e.target.matches('[data-team-name]')) { state.settings.teamNames[Number(e.target.dataset.teamName)] = e.target.value; save(); } });
    $('teamNames').addEventListener('focusout', e => { if (e.target.matches('[data-team-name]')) { state.settings = C.sanitizeSettings(state.settings); e.target.value = state.settings.teamNames[Number(e.target.dataset.teamName)]; save(); } });
    $('countdownSelect').onchange = () => { state.settings.seconds = Number($('countdownSelect').value); save(); };
    $('directionSelect').onchange = () => { state.settings.direction = $('directionSelect').value; renderParsing(); save(); };
    $('roundsSelect').onchange = () => { state.settings.rounds = Number($('roundsSelect').value); renderParsing(); save(); };
    $('largeText').onchange = () => { state.settings.largeText = $('largeText').checked; save(); };
    $('previewButton').onclick = preview; $('aiButton').onclick = aiPrompt; $('helpButton').onclick = help;
    $('startGameButton').onclick = startGame; $('resumeButton').onclick = resume; $('homeButton').onclick = leaveGame;
    $('dismissSessionButton').onclick = () => {
      const clear = () => { state.session = null; save(); renderResume(); };
      if (state.session?.phase === 'finished') clear();
      else confirmDialog('Abandonner cette partie ?', 'Les scores de cette partie seront effacés. Vos listes et vos réglages seront conservés.', 'Abandonner la partie', clear);
    };
    $('pauseButton').onclick = pauseGame; $('undoButton').onclick = undoPoints; $('finishButton').onclick = finishEarly;
    $('teamsContainer').addEventListener('click', e => {
      const score = e.target.closest('[data-score-team]'); const falseStart = e.target.closest('[data-false-start]');
      if (score) adjustScore(Number(score.dataset.scoreTeam), Number(score.dataset.scoreDelta));
      else if (falseStart) toggleFalseStart(Number(falseStart.dataset.falseStart));
    });
    $('fullscreenButton').onclick = async () => {
      try { if (window.standup) await window.standup.toggleFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
      catch { toast('Utilisez la commande plein écran du système.', true); }
    };
    $('fileInput').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        if (file.size > 12000000) throw new Error('Le fichier dépasse 12 Mo.');
        const bytes = new Uint8Array(await file.arrayBuffer()); let text;
        if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes);
        else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes);
        else { text = new TextDecoder().decode(bytes); if (text.includes('\ufffd')) text = new TextDecoder('windows-1252').decode(bytes); }
        importContent(file.name, text);
      } catch (error) { toast(error.message, true); }
      e.target.value = '';
    };
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (screen === 'setup' && !$('appDialog').open) saveList(); return; }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || $('appDialog').open || e.target.matches('input,textarea,select,[contenteditable]')) return;
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); $('fullscreenButton').click(); return; }
      if (screen !== 'game') return;
      if (e.key === ' ') { e.preventDefault(); primarySpace(); }
      else if (e.key === 'Enter') { e.preventDefault(); roundReveal(); }
      else if (e.key.toLowerCase() === 'g') roundAward(true);
      else if (e.key.toLowerCase() === 'p') roundAward(false);
      else if (/^[1-6]$/.test(e.key) && Number(e.key) <= state.session.settings.teams) toggleFalseStart(Number(e.key) - 1);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !audienceOpen && state.session?.phase === 'thinking') pauseGame();
      if (document.hidden) persistNative();
      else if (screen === 'game') setProjection(true);
    });
    window.addEventListener('beforeunload', () => { audienceWindow?.close(); if (state.session?.phase === 'thinking') { state.session.remaining = Math.max(0, deadline - performance.now()); state.session.phase = 'paused'; save(); } persistNative(); });
    $('appDialog').addEventListener('click', e => { if (e.target === $('appDialog')) { const rect = e.target.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) $('appDialog').close(); } });
  }
  async function init() {
    let disk; let mirror;
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) mirror = hydrate(JSON.parse(raw)); } catch { /* Ne pas écraser le fichier natif à partir d'une copie illisible. */ }
    if (window.standup) {
      try {
        const result = await window.standup.readState();
        if (!result.ok) { storageBlocked = true; storageError(result.error); }
        else if (result.state) disk = hydrate(result.state);
        if (result.recovered) toast('Vos listes ont été récupérées depuis la copie de secours.');
      } catch (error) { storageBlocked = true; storageError(`La sauvegarde ne peut pas être ouverte : ${error.message}`); }
    }
    state = mirror && (!disk || mirror.revision > disk.revision) ? mirror : disk || freshState();
    $('subjectSelect').innerHTML = Object.entries(C.subjects).map(([id, subject]) => `<option value="${id}">${esc(subject.name)}</option>`).join('');
    loaded = true; bindEvents(); renderEditor(); renderSettings(); renderResume(); save();
  }
  init().catch(error => { storageError(`Le démarrage a échoué : ${error.message}. Vos fichiers d’origine sont conservés.`); console.error(error); });
})();
