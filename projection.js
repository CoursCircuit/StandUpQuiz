/* © Sylvain Bovat. Cette fenêtre ne reçoit que la vue publique de la partie. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id); const V = window.QuizView;
  let current; let receivedAt = 0; let channel;
  function receive(view) {
    if (!view || !['lobby', 'game', 'summary'].includes(view.screen)) return;
    current = view; receivedAt = performance.now();
    $('lobbyView').hidden = view.screen !== 'lobby'; $('gameView').hidden = view.screen !== 'game'; $('summaryView').hidden = view.screen !== 'summary';
    document.body.classList.toggle('is-playing', view.screen === 'game');
    document.body.classList.toggle('is-cooperative', view.mode === 'cooperative' && view.screen !== 'lobby');
    $('gameMeta').textContent = view.screen === 'lobby' ? '' : view.title;
    if (view.screen === 'game') {
      V.paintGame(document, view);
      $('audienceStatus').textContent = view.phase === 'ready' ? 'Tout le monde est prêt ?' : view.phase === 'paused' ? 'Une petite pause…' : view.phase === 'thinking' ? 'Réfléchissez. Puis levez-vous si vous avez la bonne réponse.' : view.phase === 'waiting' ? 'Gardez votre position : la réponse arrive.' : view.mode === 'cooperative' ? 'On avance ensemble !' : 'Bien joué, la classe !';
    }
    if (view.screen === 'summary') {
      const coop = view.mode === 'cooperative'; const c = view.cooperative;
      const ranked = view.scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
      const top = ranked.filter(v => v.score === ranked[0]?.score);
      const headline = !view.completed ? 'À vous de rejouer !' : coop ? c.reached ? 'Défi collectif relevé !' : 'Ensemble, on progresse !' : top.length === ranked.length ? 'Toutes les équipes à égalité !' : top.length > 1 ? 'Victoire partagée !' : `Bravo ${view.teamNames[top[0].i]} !`;
      let rank = 1;
      $('summaryView').innerHTML = `<div class="summary-heading"><h1>${V.esc(headline)}</h1><p>${view.completed} manches jouées · ${V.esc(view.title)}</p></div>${coop ? `<div class="collective-result"><strong>${c.score}<small>points pour la classe</small></strong><div><h2>${c.done} réussite${c.done > 1 ? 's' : ''} · objectif ${c.goal}</h2><progress max="${c.goal}" value="${Math.min(c.done, c.goal)}"></progress></div></div>` : `<div class="podium">${ranked.map((v, i) => { if (i && v.score !== ranked[i - 1].score) rank = i + 1; return `<div class="ranking-row" style="--team-color:${V.colors[v.i]}"><span class="rank">${rank}</span><strong>${V.esc(view.teamNames[v.i])}</strong><span class="ranking-score">${v.score}<span>points</span></span></div>`; }).join('')}</div>`}${V.fairnessNote(view)}`;
    }
  }
  async function fullscreen() {
    if (window.audience) await window.audience.toggleFullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }
  $('projectionFullscreen').onclick = () => fullscreen().catch(() => {});
  document.addEventListener('dblclick', () => fullscreen().catch(() => {}));
  document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); fullscreen().catch(() => {}); } });
  if (window.audience) {
    let liveReceived = false;
    window.audience.onView(view => { liveReceived = true; receive(view); });
    window.audience.getView().then(view => { if (!liveReceived) receive(view); }).catch(() => {});
  } else if (location.hash.length > 1) {
    channel = new BroadcastChannel(`standup-${location.hash.slice(1)}`);
    channel.onmessage = e => { if (e.data?.type === 'view') receive(e.data.view); };
    channel.postMessage({ type: 'ready' });
    window.addEventListener('beforeunload', () => channel.postMessage({ type: 'closed' }));
  }
  // Interpolate the countdown locally, without receiving hidden game data.
  setInterval(() => {
    if (current?.screen !== 'game' || current.phase !== 'thinking') return;
    const remaining = Math.max(0, current.remaining - (performance.now() - receivedAt));
    $('timerNumber').textContent = Math.ceil(remaining / 1000);
    $('timer').style.setProperty('--progress', `${remaining / (current.seconds * 1000) * 100}%`);
    $('timer').classList.toggle('urgent', remaining <= 2000);
  }, 100);
})();
