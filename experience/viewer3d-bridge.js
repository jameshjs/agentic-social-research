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
    .impact-tour{position:absolute;z-index:7;top:66px;left:16px;max-width:min(330px,calc(100% - 32px));display:none;color:#ecfff6;font-family:'Space Grotesk',sans-serif}
    .simulation-viewport.is-3d .impact-tour.is-ready{display:block}
    .impact-tour button{border:1px solid #a8f4d1;background:#a8f4d1;color:#102b27;border-radius:999px;padding:10px 16px;font:700 11px 'Space Grotesk',sans-serif;letter-spacing:.04em;box-shadow:0 8px 30px #0009;cursor:pointer}
    .impact-tour button:hover{background:#d6ffe9;transform:translateY(-2px)}
    .impact-tour-card{margin-top:8px;padding:12px 14px;border:1px solid #a8f4d166;border-radius:12px;background:#09232cdb;box-shadow:0 12px 36px #0008;backdrop-filter:blur(12px);pointer-events:none}
    .impact-tour-card[hidden]{display:none}
    .impact-tour-phase{display:block;font:700 9px 'Space Grotesk',sans-serif;letter-spacing:.15em;color:#a8f4d1;text-transform:uppercase}
    .impact-tour-card strong{display:block;margin:5px 0;font-size:17px;line-height:1.2}
    .impact-tour-card p{margin:0;color:#c6dcda;font-size:11px;line-height:1.5}
    .impact-tour-card small{display:block;margin-top:7px;color:#91afb0;font:10px/1.35 'Space Grotesk',sans-serif}
    @media(max-width:760px){.impact-tour{top:61px;left:10px;max-width:min(280px,calc(100% - 20px))}.impact-tour-card{padding:9px 11px}.impact-tour-card strong{font-size:14px}}`;
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
  let tourTimer = null, hideTimer = null;
  const stopTour = () => {
    if (tourTimer) clearTimeout(tourTimer);
    if (hideTimer) clearTimeout(hideTimer);
    tourTimer = hideTimer = null;
    tourCard.hidden = true;
  };
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = (r, armName, metric) => r.runs[armName].metrics.by_tick.filter((p) => p.tick >= r.scenario.policy_start).reduce((n, p) => n + (p[metric] || 0), 0);
  const bikeRun = (r) => Object.hasOwn(r.scenario.levers.intervention || {}, 'bloor_cycle_track');
  const choiceText = (s) => ({ transit: 'takes TTC', drive: 'drives', bike_bloor: 'cycles on Bloor', bike_side_street: 'cycles via side streets', walk: 'walks', shop_elsewhere: 'shops elsewhere', defer: 'defers the trip' }[s] || `chooses ${s}`);
  function highlight(r) {
    const bike = bikeRun(r);
    const changed = r.changed_decisions.filter((d) => d.tick >= r.scenario.policy_start);
    const bathurstTransit = (d) => r.personas.find((p) => p.id === d.actor)?.routine
      ?.find((trip) => trip.id === d.trip_id)?.options
      ?.some((option) => option.action === 'transit' && option.legs?.some((leg) => leg.to === 'stn_bathurst'));
    return (bike
      ? changed.find((d) => d.baseline.action === 'bike_bloor' && d.intervention.action === 'bike_side_street')
      : changed.find((d) => d.baseline.action === 'transit' && d.intervention.action === 'bike_bloor' && bathurstTransit(d))
        || changed.find((d) => d.baseline.action === 'transit' && d.intervention.action === 'bike_bloor'))
      || changed.find((d) => bike ? d.baseline.action === 'bike_bloor' : d.baseline.action === 'transit')
      || changed[0];
  }
  function showPhase(r, d, phase) {
    const bike = bikeRun(r), baseline = phase === 'baseline';
    const person = r.personas.find((p) => p.id === d.actor);
    const name = escape(person?.name || d.actor);
    const action = baseline ? d.baseline.action : d.intervention.action;
    const trips = Math.round(sum(r, phase === 'baseline' ? 'baseline' : 'intervention', bike ? 'bloor_bike_trips' : 'transit_trips'));
    const alongside = Math.round(sum(r, phase === 'baseline' ? 'baseline' : 'intervention', 'bloor_shared_cycling_m'));
    const label = baseline ? '01 / WITHOUT THE POLICY' : '02 / WITH THE POLICY';
    const fact = bike ? `${trips} Bloor bike trips; ${alongside.toLocaleString()} m cycled beside cars in this synthetic sample.`
      : `${trips} TTC trips in this synthetic sample. Bus service is scheduled context; these are not bus boardings.`;
    tourCard.innerHTML = `<span class="impact-tour-phase">${label}</span><strong>${name} ${escape(choiceText(action))}.</strong><p>${fact}</p><small>Same person, seed and mapped world · ${r.scenario.ticks - r.scenario.policy_start + 1} simulated weekdays · not a Toronto forecast</small>`;
    tourCard.hidden = false;
    send({ type: 'viewer3d:impact-phase', arm: phase === 'baseline' ? 'baseline' : 'policy', actor: d.actor, trip: d.trip_id, tick: d.tick, kind: bike ? 'bike' : 'fare' });
  }
  tourButton.addEventListener('click', () => {
    const r = isMapped(last) ? last : window.CounterfactualCurrentRun;
    if (!ready || !isMapped(r)) return;
    stopTour();
    const d = highlight(r); if (!d) return;
    showPhase(r, d, 'baseline');
    tourButton.textContent = '↻ Replay policy impact';
    tourTimer = setTimeout(() => {
      showPhase(r, d, 'policy'); tourTimer = null;
      hideTimer = setTimeout(() => { tourCard.hidden = true; hideTimer = null; }, 8000);
    }, 7200);
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
      frame.src = '../world/viewer3d/?embed=1';
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
