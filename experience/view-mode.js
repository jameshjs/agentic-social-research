/* Demo view (default) and Researcher view.
 * The demo view is the four-beat stage walkthrough: city → prompt → 3D → report, then the 100-agent panel.
 * Researcher view (the header switch, or ?detail=1) shows every section, rail and tool as before.
 * It is a body class plus CSS, with two DOM moves so keyboard order matches what is on screen.
 * No run logic lives here. Loaded synchronously at the top of <body> so the first paint is already right. */
(function () {
  'use strict';
  const KEY = 'counterfactual:view';
  const body = document.body;
  const param = new URLSearchParams(window.location.search).get('detail');
  const fromUrl = param === '1' || param === 'true' ? 'detail' : param === '0' || param === 'false' ? 'demo' : null;
  let stored = null;
  try { stored = window.sessionStorage.getItem(KEY); } catch (error) { stored = null; }
  let mode = fromUrl || (stored === 'detail' ? 'detail' : 'demo');
  body.classList.toggle('demo-view', mode === 'demo');

  // Demo order: report → 100 agents → footer. Researcher order: the agents panel right after the composer (as before).
  function place() {
    const poll = document.getElementById('agentPoll');
    const intro = document.getElementById('intro');
    const about = document.getElementById('about');
    if (poll && intro && about) {
      if (mode === 'demo' && poll.nextElementSibling !== about) about.before(poll);
      if (mode === 'detail' && intro.nextElementSibling !== poll) intro.after(poll);
    }
    // In the demo report the chart detail opens under the five charts; in Researcher view it sits beside the sector board.
    const impact = document.getElementById('impact');
    const layout = impact && impact.querySelector('.impact-layout');
    const overview = impact && impact.querySelector('.overview-section');
    if (layout && overview) {
      if (mode === 'demo' && overview.nextElementSibling !== layout) overview.after(layout);
      if (mode === 'detail' && layout.nextElementSibling !== overview) overview.before(layout);
    }
    const toggle = document.getElementById('researchToggle');
    if (toggle) toggle.setAttribute('aria-pressed', String(mode === 'detail'));
  }

  function set(next) {
    mode = next === 'detail' ? 'detail' : 'demo';
    body.classList.toggle('demo-view', mode === 'demo');
    try { window.sessionStorage.setItem(KEY, mode); } catch (error) { /* private mode: not persisted */ }
    place();
    window.dispatchEvent(new CustomEvent('counterfactual:view', { detail: { mode } }));
  }

  window.CounterfactualView = { isDemo: () => mode === 'demo', mode: () => mode, set };
  document.addEventListener('DOMContentLoaded', () => {
    place();
    const toggle = document.getElementById('researchToggle');
    if (toggle) toggle.addEventListener('click', () => set(mode === 'demo' ? 'detail' : 'demo'));
  });
})();
