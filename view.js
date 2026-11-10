/* © Sylvain Bovat. Rendu commun à la partie et à l’écran élèves. */
(() => {
  'use strict';
  const colors = ['#9980f5', '#39bce3', '#fa8798', '#53cba5', '#edbe42', '#8a9be4'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const symbol = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  function fairnessNote(view) {
    const f = view.opportunities; if (!f) return '';
    if (view.practice) return '<p class="fairness-note">Révision ciblée en coopération · score commun, sans classement.</p>';
    if (f.complete && f.equal) return `<p class="fairness-note balanced">Même nombre d’occasions de répondre : ${f.counts[0]} par équipe.</p>`;
    return `<p class="fairness-note">${f.complete ? 'Partie commencée avec les anciennes règles.' : 'Partie interrompue : l’équilibre prévu n’est pas garanti.'}<span>${f.counts.map((count, i) => `${esc(view.teamNames[i])} : ${count}`).join(' · ')}</span></p>`;
  }
  function paintGame(doc, view, interactive = false) {
    const $ = id => doc.getElementById(id);
    const v = view; const ready = v.phase === 'ready'; const paused = v.phase === 'paused';
    const revealed = ['revealed', 'scored'].includes(v.phase);
    const coop = v.mode === 'cooperative';
    doc.body.classList.toggle('is-cooperative', coop);
    $('gameView').classList.toggle('cooperative-layout', coop);
    $('cooperativeBoard').hidden = !coop;
    if (coop) {
      const c = v.cooperative;
      $('cooperativeBoard').innerHTML = `<div class="coop-identity"><span class="coop-mode">MODE COOPÉRATIF</span><strong>Tous ensemble !</strong><span>${v.practice ? 'Révision ciblée · sans classement' : 'Une seule classe. Un objectif commun.'}</span></div><div class="coop-total"><strong id="collectiveScore">${c.score}</strong><span>POINTS DE LA CLASSE</span></div><div class="coop-progress"><div><span>Objectif collectif</span><strong>${c.done}<small> / ${c.goal}</small></strong></div><progress aria-label="Manches réussies sans faux départ" max="${c.goal}" value="${Math.min(c.done, c.goal)}"></progress><p>${c.reached ? 'Objectif atteint, bravo la classe !' : `${c.goal} manche${c.goal > 1 ? 's' : ''} réussie${c.goal > 1 ? 's' : ''} sans faux départ pour relever le défi.`}</p></div>`;
      $('cooperativeBoard').classList.toggle('goal-reached', c.reached);
    } else $('cooperativeBoard').replaceChildren();
    $('roundLabel').innerHTML = `<span>${v.practice ? 'Révision · ' : ''}Question ${v.cursor + 1} / ${v.total}</span>${!coop && v.opportunities?.plannedPerTeam ? `<span class="mode-badge">${v.opportunities.plannedPerTeam} réponse${v.opportunities.plannedPerTeam > 1 ? 's' : ''} attendue${v.opportunities.plannedPerTeam > 1 ? 's' : ''} par équipe</span>` : ''}`;
    $('questionWord').textContent = ready ? 'Prêts à vous lever ?' : paused ? 'On fait une pause.' : v.question;
    $('questionWord').classList.toggle('long-question', $('questionWord').textContent.length > 35);
    $('questionInstruction').textContent = ready ? v.practice ? 'Un seul passage sur les questions à revoir. La première démarre à votre signal.' : `${v.total} questions${v.opportunities?.plannedPerTeam ? ` · ${v.opportunities.plannedPerTeam} par équipe` : ''}. La première démarre à votre signal.` : paused ? 'Les réponses réapparaîtront à la reprise.' : revealed ? `${v.teamNames[v.correctTeam]}, c’était à vous de vous lever !` : coop ? 'Levez-vous si votre équipe a la réponse. Les points sont pour toute la classe.' : 'Levez-vous si votre équipe possède la bonne réponse.';
    $('revealedAnswer').hidden = false;
    $('revealedAnswer').textContent = revealed ? v.answer : '\u00a0';
    $('revealedAnswer').classList.remove('teacher-secret');
    $('timerNumber').textContent = ready ? v.seconds || '∞' : paused ? 'Ⅱ' : v.phase === 'thinking' ? Math.ceil(v.remaining / 1000) : v.phase === 'waiting' ? v.seconds ? '0' : '∞' : '✓';
    $('timerUnit').textContent = paused ? 'pause' : revealed ? 'réponse' : !v.seconds ? 'sans limite' : 'secondes';
    $('timer').classList.toggle('urgent', v.phase === 'thinking' && Math.ceil(v.remaining / 1000) <= 2);
    $('timer').style.setProperty('--progress', `${v.seconds ? v.remaining / (v.seconds * 1000) * 100 : 100}%`);
    $('teamsContainer').style.setProperty('--teams', v.teams);
    $('teamsContainer').innerHTML = Array.from({ length: v.teams }, (_, i) => {
      const correct = revealed && i === v.correctTeam; const falseStart = revealed && v.standing[i] && !correct;
      const frozen = ['thinking', 'paused'].includes(v.phase);
      const score = coop ? '' : `<div class="points-container">${interactive ? `<button class="score-adjust" data-score-team="${i}" data-score-delta="-1" aria-label="Retirer un point à ${esc(v.teamNames[i])}" ${frozen ? 'disabled' : ''}>${symbol('minus')}</button>` : ''}<div class="score-value"><strong>${v.scores[i]}</strong><span>points</span></div>${interactive ? `<button class="score-adjust" data-score-team="${i}" data-score-delta="1" aria-label="Ajouter un point à ${esc(v.teamNames[i])}" ${frozen ? 'disabled' : ''}>${symbol('plus')}</button>` : ''}</div>`;
      const foot = interactive && v.phase === 'revealed' && !correct ? `<button data-false-start="${i}" aria-pressed="${v.standing[i]}">${v.standing[i] ? 'Faux départ ✓' : 'Faux départ'} <span>−${v.points.falseStart}</span></button>` : correct ? '<span class="correct-note">Bonne réponse ✓</span>' : falseStart ? '<span class="false-note">Faux départ</span>' : '<span aria-hidden="true">&nbsp;</span>';
      return `<article class="team-card ${correct ? 'correct' : ''} ${falseStart ? 'false-start' : ''}" style="--team-color:${colors[i]}"><h2><span class="team-dot" aria-hidden="true"></span>${esc(v.teamNames[i])}</h2>${ready || paused ? `<div class="word-mask"><div class="mask-lines"><i></i><i></i><i></i><span>${paused ? 'Partie en pause' : 'À votre signal'}</span></div></div>` : `<ul class="team-words">${v.columns[i].map(word => `<li class="${correct && word === v.answer ? 'answer-word' : ''}">${esc(word)}</li>`).join('')}</ul>`}<div class="team-footer">${score}<div class="round-team-status">${foot}</div></div></article>`;
    }).join('');
    doc.body.classList.toggle('large-text', v.largeText === true);
    fit(doc);
  }
  let fitFrame;
  function fit(doc = document) {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      if (innerWidth < 761) return;
      doc.querySelectorAll('.team-words').forEach(list => {
        list.style.removeProperty('font-size');
        const base = parseFloat(getComputedStyle(list).fontSize);
        let size = base;
        // Preserve every answer. The available height stays stable after revealing.
        while (size > 10 && (list.scrollHeight > list.clientHeight + 1 || [...list.children].some(li => li.scrollWidth > li.clientWidth + 1))) {
          size--; list.style.fontSize = `${size}px`;
        }
      });
      const area = doc.querySelector('.question-copy');
      if (area) {
        const heading = doc.getElementById('questionWord'); const answer = doc.getElementById('revealedAnswer');
        heading.style.removeProperty('font-size'); answer.style.removeProperty('font-size');
        let headingSize = parseFloat(getComputedStyle(heading).fontSize); let answerSize = parseFloat(getComputedStyle(answer).fontSize);
        while (area.scrollHeight > area.clientHeight + 1 && (headingSize > 18 || answerSize > 14)) {
          headingSize = Math.max(18, headingSize - 1); answerSize = Math.max(14, answerSize - 1);
          heading.style.fontSize = `${headingSize}px`; answer.style.fontSize = `${answerSize}px`;
        }
      }
    });
  }
  window.addEventListener('resize', () => fit());
  window.QuizView = { paintGame, fairnessNote, fit, esc, colors };
})();
