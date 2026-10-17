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
    .view3d-toggle[aria-pressed="true"]{background:var(--mint,#a8f4d1);color:#0c2a2a}`;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'view3d-toggle'; button.textContent = '3D';
  button.setAttribute('aria-pressed', 'false'); button.title = 'Show the mapped run in 3D';
  bottom.insertBefore(button, bottom.firstChild);

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

  window.addEventListener('counterfactual:result', (event) => { last = event.detail; if (isMapped(last)) sendRun(); });
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || !frame || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'viewer3d:ready') { ready = true; sendRun(); send({ type: 'viewer3d:arm', arm: arm() }); }
    if (event.data.type === 'viewer3d:arm' && event.data.arm !== arm()) document.getElementById(event.data.arm === 'baseline' ? 'baselineView' : 'policyView')?.click();
  });
  for (const id of ['baselineView', 'policyView']) document.getElementById(id)?.addEventListener('click', () => setTimeout(() => send({ type: 'viewer3d:arm', arm: arm() }), 0));
  // A changed decision chosen in the ledger: fly to that person in 3D.
  document.getElementById('runLedgerChoices')?.addEventListener('click', (event) => {
    const label = event.target.closest('button')?.querySelector('strong')?.textContent || '';
    const run = window.CounterfactualCurrentRun, name = label.split(' · ')[0];
    const person = isMapped(run) && run.personas.find((p) => p.name === name || p.id === name);
    if (person) send({ type: 'viewer3d:person', id: person.id });
  });

  // The 3D view is the default when the mapped world is in use and WebGL works.
  const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  const wants2d = new URLSearchParams(window.location.search).get('view') === '2d';
  window.addEventListener('counterfactual:result', (event) => { if (gl && !wants2d && isMapped(event.detail) && !frame) setOpen(true); });
})();
