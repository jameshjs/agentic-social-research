// Read-only bridge to Steven's recorded persona work. Survey reactions are never
// passed to the city trace or presented as measured Toronto outcomes.
(() => {
  const root = document.querySelector('#personaLab');
  if (!root) return;
  const byId = (id) => document.getElementById(id);
  const make = (tag, className, value) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value != null) el.textContent = value;
    return el;
  };
  const percent = (value) => `${(Number(value) * 100).toFixed(1)}%`;
  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };

  function renderRound(round) {
    const detail = byId('personaRoundDetail');
    detail.replaceChildren();
    const decision = round.kept === 'yes' ? 'RETAINED · HUMAN SIGN-OFF' : round.kept === 'baseline' ? 'BASELINE' : 'TESTED · DISCARDED';
    detail.append(make('span', 'persona-detail-kicker', `TRIAL ${round.round} / ${decision}`));
    detail.append(make('h3', '', round.hypothesis || 'Starting instructions'));
    const change = make('p', 'persona-detail-change');
    change.append(make('b', '', 'Agent proposal  '), document.createTextNode(round.change || 'No change; baseline measurement.'));
    detail.append(change);
    const metrics = make('div', 'persona-score-grid');
    [
      ['Right person', round.right_person],
      ['Answer spread', round.right_spread],
      ['Group gaps', round.right_group_gaps],
      ['Wording stability', round.steady],
    ].forEach(([label, value]) => {
      const card = make('div', 'persona-score');
      card.append(make('span', '', label), make('strong', '', percent(value)));
      const bar = make('i', 'persona-score-bar');
      bar.style.setProperty('--score-width', `${Math.min(100, Math.max(0, Number(value) * 100))}%`);
      card.append(bar);
      metrics.append(card);
    });
    detail.append(metrics);
    const footer = make('div', 'persona-detail-footer');
    const notes = String(round.papiers_ids || '').split(',').filter(Boolean);
    footer.append(make('span', '', `${round.marks_passed}/4 check-set marks · ${notes.length ? `${notes.length} Papiers references` : 'No Papiers references'}`));
    footer.append(make('span', '', round.signed_off_by ? `Signed off by ${round.signed_off_by}` : 'No human sign-off recorded for this trial'));
    detail.append(footer);
    if (round.coach_notes) detail.append(make('p', 'persona-coach-note', `Human review: ${round.coach_notes}`));
  }

  function renderRounds(rounds, final) {
    if (!Array.isArray(rounds) || !rounds.length) throw new Error('Persona research record is empty');
    byId('personaRoundCount').textContent = `${rounds.length} RECORDED TRIALS`;
    const buttons = rounds.map((round) => {
      const button = make('button', `persona-round ${round.kept === 'yes' ? 'persona-round--kept' : ''}`);
      button.type = 'button';
      button.setAttribute('aria-label', `Inspect trial ${round.round}: ${round.kept === 'yes' ? 'retained' : round.kept === 'baseline' ? 'baseline' : 'discarded'}`);
      button.append(make('small', '', round.round), make('span', '', round.kept === 'yes' ? '✓' : round.kept === 'baseline' ? '◉' : '·'));
      button.addEventListener('click', () => {
        buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
        renderRound(round);
      });
      return button;
    });
    byId('personaRounds').replaceChildren(...buttons);
    (buttons.find((button) => button.classList.contains('persona-round--kept')) || buttons[0]).click();
    byId('personaLatestTrial').addEventListener('click', () => {
      const lastWithNotes = rounds.map((round, index) => ({ round, index })).reverse().find(({ round }) => String(round.papiers_ids || '').trim());
      if (lastWithNotes) buttons[lastWithNotes.index].click();
      byId('personaRoundDetail').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    });
    const finalRow = Array.isArray(final) ? final[0] : null;
    byId('personaFinalStatus').textContent = finalRow?.section === 'pending' ? 'Pending' : finalRow?.status || 'See research record';
  }

  function renderReactions(young, older) {
    const files = [young, older];
    const count = files.reduce((sum, file) => sum + Number(file.summary?.responded || 0), 0);
    const grounded = files.reduce((sum, file) => sum + Number(file.summary?.quote_grounded || 0), 0);
    byId('personaReactionSummary').textContent = `${count} saved synthetic reactions across two US age groups; ${grounded} quoted a phrase from their assigned persona or context. Quote matching is a grounding check, not behavioral validation.`;
    const responses = [...young.responses, ...older.responses];
    const selected = [
      responses.find((r) => r.context?.label === 'transit_dependent' && r.stance === 'oppose'),
      responses.find((r) => r.context?.label === 'driver' && r.stance === 'oppose'),
      responses.find((r) => r.context?.label === 'driver' && r.stance === 'support'),
    ].filter(Boolean);
    const cards = selected.map((response, index) => {
      const card = make('article', 'persona-reaction-card');
      const top = make('div', 'persona-reaction-top');
      top.append(make('span', '', `0${index + 1} / SAVED AGENT REACTION`), make('span', `persona-stance persona-stance--${response.stance}`, response.stance.toUpperCase()));
      card.append(top, make('h4', '', response.persona?.name || 'Synthetic resident'));
      card.append(make('p', 'persona-reaction-context', `${response.context?.label?.replaceAll('_', ' ') || 'No assigned transit context'} · ${response.persona?.city || 'US'}, ${response.persona?.state || ''}`));
      card.append(make('p', 'persona-reaction-action', response.action || 'No action recorded.'));
      card.append(make('p', 'persona-reaction-quote', response.response || ''));
      return card;
    });
    byId('personaReactionCards').replaceChildren(...cards);
  }

  Promise.all([
    fetchJson('../persona-swarm/data/record/rounds.json'),
    fetchJson('../persona-swarm/data/record/final.json'),
    fetchJson('../persona-swarm/data/reactions/age_18_29/fare-with-transit-context.json'),
    fetchJson('../persona-swarm/data/reactions/age_65_plus/fare-with-transit-context.json'),
  ]).then(([rounds, final, young, older]) => {
    renderRounds(rounds, final);
    renderReactions(young, older);
  }).catch((error) => {
    byId('personaRoundCount').textContent = 'RECORD UNAVAILABLE';
    byId('personaRoundDetail').textContent = 'The local research files could not load. Serve this page from the repository root and open the full research dashboard.';
    byId('personaReactionSummary').textContent = 'Saved reactions could not load.';
    console.error('Persona research record:', error);
  });
})();
