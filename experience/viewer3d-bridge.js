/* 3D view of the mapped run, inside the lab's city viewport.
 * Embeds ../world/viewer3d/?embed=1 over the 2D map and hands it the page's own experiment.v2 RunResult
 * (the `counterfactual:result` event), so the 3D people, the ledger and the charts read one event log.
 * The Baseline / With policy toggle and the decision ledger stay in charge; the 3D view follows them.
 * `?view=2d` starts on the 2D map. Nothing here changes the run. */
(function () {
  'use strict';
  const viewport = document.getElementById('simulationViewport');
  const bottom = viewport && viewport.querySelector('.viewport-bottom');
  if (!viewport || !bottom) return;
  const origin = window.location.origin;

  const style = document.createElement('style');
  style.textContent = `
    .view3d-frame{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:13px;z-index:2;display:none;background:#0d1f2b}
    .simulation-viewport.is-3d .view3d-frame{display:block}
    .simulation-viewport.is-3d #bloorMapMain,.simulation-viewport.is-3d .focus-marker,.simulation-viewport.is-3d .world-caption,
    .simulation-viewport.is-3d #mapPersonaCard,.simulation-viewport.is-3d #mapMotionNote,.simulation-viewport.is-3d .viewport-legend,
    .simulation-viewport.is-3d #mapAttribution{visibility:hidden}
    .simulation-viewport.is-3d .viewport-upper{pointer-events:none}
    .simulation-viewport.is-3d .viewport-bottom{left:auto;bottom:auto;top:14px;right:14px;gap:8px}
    .view3d-toggle{border:1px solid #a8f4d13b;border-radius:40px;background:#0b212af0;color:var(--mint,#a8f4d1);padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer}
    .view3d-toggle[aria-pressed="true"]{background:var(--mint,#a8f4d1);color:#0c2a2a}
    /* The button sits 10px under the Baseline / With policy toggle: top 16px, ~54px tall (~48px on phones). */
    .impact-tour{position:absolute;z-index:7;inset:0;display:none;color:#ecfff6;font-family:'Space Grotesk',sans-serif;pointer-events:none}
    .simulation-viewport.is-3d .impact-tour.is-ready{display:block}
    .impact-tour button{position:absolute;top:80px;left:16px;pointer-events:auto;border:1px solid #a8f4d1;background:#a8f4d1;color:#102b27;border-radius:999px;padding:10px 16px;font:700 11px 'Space Grotesk',sans-serif;letter-spacing:.04em;box-shadow:0 8px 30px #0009;cursor:pointer}
    .impact-tour button:hover{background:#d6ffe9;transform:translateY(-2px)}
    .impact-tour-card{position:absolute;left:50%;bottom:69px;transform:translateX(-50%);width:min(610px,calc(100% - 28px));padding:11px 16px;border:1px solid #a8f4d180;border-radius:13px;background:#09232ce3;box-shadow:0 12px 36px #0008;backdrop-filter:blur(12px);pointer-events:none;text-align:center}
    .impact-tour-card[hidden]{display:none}
    .impact-tour-phase{display:block;font:700 9px 'Space Grotesk',sans-serif;letter-spacing:.15em;color:#a8f4d1;text-transform:uppercase}
    .impact-tour-card strong{display:block;margin:2px 0;font-size:16px;line-height:1.2}
    .impact-tour-card{border-width:2px}
    .impact-tour-card.is-baseline{border-color:#4fe3ff;box-shadow:0 0 0 4px #4fe3ff22,0 12px 36px #0008}
    .impact-tour-card.is-baseline .impact-tour-phase{color:#4fe3ff}
    .impact-tour-card.is-policy{border-color:#ff3df0;box-shadow:0 0 0 4px #ff3df022,0 12px 36px #0008}
    .impact-tour-card.is-policy .impact-tour-phase{color:#ff8ff3}
    .impact-tour-card.is-switch{border-color:#ffe14d;background:#2a2410ee}
    .impact-tour-card.is-switch .impact-tour-phase{color:#ffe14d}
    .impact-tour-card strong{font-size:19px}
    .impact-tour-card p{margin:4px 0 0;color:#d4e6e3;font:500 13px/1.4 'Space Grotesk',sans-serif}
    .impact-tour-change{display:block;margin:4px 0 2px;font:600 clamp(22px,2.6vw,34px)/1.1 'Space Grotesk',sans-serif;letter-spacing:-.02em;color:#ff9ff3}
    .impact-tour-change i{font-style:normal;color:#fff;opacity:.7;margin:0 .2em}
    @media(max-width:760px){.impact-tour button{top:75px;padding:8px 11px;font-size:10px}.impact-tour-card{bottom:58px;padding:8px 10px}.impact-tour-card strong{font-size:13px}}`;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'view3d-toggle'; button.textContent = '3D';
  button.setAttribute('aria-pressed', 'false'); button.title = 'Show the mapped run in 3D';
  bottom.insertBefore(button, bottom.firstChild);

  const tour = document.createElement('div');
  tour.className = 'impact-tour';
  tour.innerHTML = '<button type="button" aria-label="Play the policy impact tour">▶ See policy impact</button><div class="impact-tour-card" aria-live="polite" hidden></div>';
  viewport.appendChild(tour);
  const tourButton = tour.querySelector('button'), tourCard = tour.querySelector('.impact-tour-card');
  let tourTimer = null;
  const stopTour = () => {
    if (tourTimer) clearTimeout(tourTimer);
    tourTimer = null;
    tourCard.hidden = true;
  };
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bikeRun = (r) => Object.hasOwn(r.scenario.levers.intervention || {}, 'bloor_cycle_track');
  const choiceText = (s) => ({ transit: 'takes TTC', drive: 'drives', bike_bloor: 'cycles on Bloor', bike_side_street: 'cycles via side streets', walk: 'walks', shop_elsewhere: 'shops elsewhere', defer: 'defers the trip' }[s] || `chooses ${s}`);
  // One person whose choice the policy changed: for the fare, a TTC rider who switches (driving first, the
  // clearest contrast); for the bike lane, a Bloor cyclist who leaves the track.
  function highlight(r) {
    const bike = bikeRun(r);
    const changed = r.changed_decisions.filter((d) => d.tick >= r.scenario.policy_start);
    const pick = (from, to) => changed.find((d) => d.baseline.action === from && (!to || d.intervention.action === to));
    return (bike ? pick('bike_bloor', 'bike_side_street') || pick('bike_bloor', 'transit') || pick('bike_bloor')
      : pick('transit', 'drive') || pick('transit', 'bike_bloor') || pick('transit')) || changed[0];
  }
  // What this trip cost and how long it took in one arm, from the run's own events.
  function tripFacts(r, d, armName) {
    const ev = r.runs[armName].events.filter((e) => e.actor === d.actor && e.tick === d.tick);
    const choose = ev.find((e) => e.action === 'choose_trip' && e.trip_id === d.trip_id);
    const done = ev.find((e) => e.action === 'trip_completed' && e.trip_id === d.trip_id);
    const inTrip = (e) => choose && e.t >= choose.t && (!done || e.t <= done.t);
    const fare = ev.filter((e) => e.action === 'pay_fare' && inTrip(e)).reduce((n, e) => n + e.amount_cad, 0);
    const cost = ev.filter((e) => e.action === 'pay_travel_cost' && inTrip(e)).reduce((n, e) => n + e.amount_cad, 0);
    const bits = [];
    if (fare) bits.push(`pays a $${fare.toFixed(2)} fare`);
    if (cost) bits.push(`pays $${cost.toFixed(2)} to drive and park`);
    if (done && done.total_minutes) bits.push(`${Math.round(done.total_minutes)} min door to door`);
    if (!done) bits.push('this trip no longer happens on Bloor');
    return bits.join(' · ');
  }
  const sum = (r, armName, id) => r.runs[armName].metrics.by_tick.filter((t) => t.tick >= r.scenario.policy_start).reduce((n, t) => n + (t[id] || 0), 0);
  function card(phase, label, title, sub, big) {
    tourCard.className = `impact-tour-card is-${phase}`;
    tourCard.innerHTML = `<span class="impact-tour-phase">${label}</span>${big ? `<b class="impact-tour-change">${big}</b>` : ''}<strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}`;
    tourCard.hidden = false;
  }
  function showPhase(r, d, phase) {
    const bike = bikeRun(r), baseline = phase === 'baseline';
    const name = escape(r.personas.find((p) => p.id === d.actor)?.name || d.actor);
    const levers = r.scenario.levers;
    if (phase === 'policy-intro') {
      const what = bike ? 'The protected cycle track is removed' : `The adult fare goes from $${levers.baseline.adult_fare_cad.toFixed(2)} to $${levers.intervention.adult_fare_cad.toFixed(2)}`;
      card('switch', 'Now switch on the policy', `${what}.`, `Same ${name}, same day, same seed. Watch what changes.`);
      send({ type: 'viewer3d:arm', arm: 'policy' });
      return;
    }
    const armName = baseline ? 'baseline' : 'intervention';
    const action = baseline ? d.baseline.action : d.intervention.action;
    const label = baseline ? '01 · Without the policy' : bike ? '02 · Track removed' : '02 · With the higher fare';
    const big = baseline ? '' : `${escape(choiceText(d.baseline.action))} <i>→</i> ${escape(choiceText(d.intervention.action))}`;
    card(baseline ? 'baseline' : 'policy', label, `${name} ${escape(choiceText(action))}.`, escape(tripFacts(r, d, armName)), big);
    send({ type: 'viewer3d:impact-phase', arm: baseline ? 'baseline' : 'policy', actor: d.actor, trip: d.trip_id, tick: d.tick, kind: bike ? 'bike' : 'fare', focus: 'person' });
  }
  function showSummary(r) {
    const bike = bikeRun(r), id = bike ? 'bloor_bike_trips' : 'transit_trips';
    const a = Math.round(sum(r, 'baseline', id)), b = Math.round(sum(r, 'intervention', id));
    const people = new Set(r.changed_decisions.map((c) => c.actor)).size;
    card('policy', 'Across the whole run', `${bike ? 'Bloor bike trips' : 'TTC trips'}: ${a} → ${b}`, `${people} of ${r.population.count} people changed a choice · simulated, not a forecast`);
  }
  tourButton.addEventListener('click', () => {
    const r = isMapped(last) ? last : window.CounterfactualCurrentRun;
    if (!ready || !isMapped(r)) return;
    stopTour();
    const d = highlight(r); if (!d) return;
    const beats = [[() => showPhase(r, d, 'baseline'), 9000], [() => showPhase(r, d, 'policy-intro'), 2600], [() => showPhase(r, d, 'policy'), 10000], [() => showSummary(r), 6000]];
    tourButton.textContent = '↻ Replay';
    const step = (k) => {
      if (k === beats.length) { stopTour(); return; }
      beats[k][0]();
      tourTimer = setTimeout(() => step(k + 1), beats[k][1]);
    };
    step(0);
  });

  let frame = null, ready = false, last = null;
  const isMapped = (r) => r && r.schema_version === 'experiment.v2';
  const send = (msg) => { if (frame && ready) frame.contentWindow.postMessage(msg, origin); };
  const arm = () => (document.getElementById('baselineView')?.classList.contains('selected') ? 'baseline' : 'policy');
  const sendRun = () => { const r = isMapped(last) ? last : window.CounterfactualCurrentRun; if (isMapped(r)) send({ type: 'viewer3d:run', result: r }); };

  function setOpen(open) {
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.className = 'view3d-frame'; frame.title = '3D view of the mapped run';
      frame.src = '../world/viewer3d/?embed=1&v=street-tour-7';
      viewport.appendChild(frame);
    }
    viewport.classList.toggle('is-3d', open);
    button.setAttribute('aria-pressed', String(open));
    button.textContent = open ? '2D' : '3D';
    button.title = open ? 'Back to the 2D map' : 'Show the mapped run in 3D';
  }
  button.addEventListener('click', () => setOpen(!viewport.classList.contains('is-3d')));

  window.addEventListener('counterfactual:result', (event) => { last = event.detail; stopTour(); if (isMapped(last)) sendRun(); tour.classList.toggle('is-ready', ready && isMapped(last)); tourButton.textContent = isMapped(last) && bikeRun(last) ? '▶ See bike impact' : '▶ See TTC impact'; });
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || !frame || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'viewer3d:ready') { ready = true; sendRun(); send({ type: 'viewer3d:arm', arm: arm() }); tour.classList.toggle('is-ready', isMapped(last || window.CounterfactualCurrentRun)); }
    if (event.data.type === 'viewer3d:arm' && event.data.arm !== arm()) document.getElementById(event.data.arm === 'baseline' ? 'baselineView' : 'policyView')?.click();
  });
  for (const id of ['baselineView', 'policyView']) document.getElementById(id)?.addEventListener('click', () => setTimeout(() => send({ type: 'viewer3d:arm', arm: arm() }), 0));
  // The page also changes arm without a click (a new run opens on Baseline in the demo view; following a ledger event
  // switches arm), so follow the toggle's own state as well. The viewer ignores an arm it already shows.
  const baselineButton = document.getElementById('baselineView');
  if (baselineButton) new MutationObserver(() => send({ type: 'viewer3d:arm', arm: arm() })).observe(baselineButton, { attributes: true, attributeFilter: ['class'] });
  // A changed decision chosen in the ledger: fly to that person in 3D.
  document.getElementById('runLedgerChoices')?.addEventListener('click', (event) => {
    const label = event.target.closest('button')?.querySelector('strong')?.textContent || '';
    const run = window.CounterfactualCurrentRun, name = label.split(' · ')[0];
    const person = isMapped(run) && run.personas.find((p) => p.name === name || p.id === name);
    if (person) send({ type: 'viewer3d:person', id: person.id });
  });
  // Any control marked data-viewer3d-person="<persona id>" (the demo view's "people who changed" strip) does the same.
  // app.js switches the page to "With policy" on the same click, before this bubbling handler runs.
  document.addEventListener('click', (event) => {
    const id = event.target.closest && event.target.closest('[data-viewer3d-person]')?.dataset.viewer3dPerson;
    const run = window.CounterfactualCurrentRun;
    if (id && isMapped(run) && run.personas.some((p) => p.id === id)) send({ type: 'viewer3d:person', id });
  });

  // The 3D view is the default when the mapped world is in use and WebGL works.
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  const wants2d = new URLSearchParams(window.location.search).get('view') === '2d';
  window.addEventListener('counterfactual:result', (event) => { if (gl && !wants2d && isMapped(event.detail) && !frame) setOpen(true); });
})();
