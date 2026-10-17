/* Two World demo view.
 * 1. The 100-agent panel sits right after the prompt, above the 3D view, because the demo view hides
 *    everything under the 3D view (two-world.css). Researcher view keeps view-mode.js's order.
 * 2. One row of metric tiles right under the 3D view: baseline → with policy over the periods after the
 *    policy starts, summed from the run's own metrics.by_tick (experiment.v2). No number is typed in here. */
(function () {
  'use strict';
  function place() {
    const poll = document.getElementById('agentPoll'), intro = document.getElementById('intro');
    const demo = !window.CounterfactualView || window.CounterfactualView.isDemo();
    if (demo && poll && intro && intro.nextElementSibling !== poll) intro.after(poll);
  }
  place();
  document.addEventListener('DOMContentLoaded', place);   // after view-mode.js's own DOMContentLoaded placement
  window.addEventListener('counterfactual:view', place);

  const box = document.createElement('section');
  box.className = 'tw-metrics'; box.hidden = true; box.setAttribute('aria-label', 'What changes with the policy');
  const layout = document.querySelector('#lab .lab-layout');
  if (layout) layout.after(box);

  const sum = (run, arm, id) => run.runs[arm].metrics.by_tick.filter((t) => t.tick >= run.scenario.policy_start).reduce((s, t) => s + (t[id] || 0), 0);
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const count = (v) => String(Math.round(v * 10) / 10);
  function tile(label, a, b, fmt) {
    const pct = a ? Math.round(((b - a) / a) * 100) : null;
    const d = a === b ? 'no change' : pct === null ? (b > a ? '▲ new' : '') : `${pct > 0 ? '▲ +' : '▼ '}${pct}%`;   // direction only, no good/bad colour
    const cls = a === b ? '' : b > a ? 'up' : 'down';
    return `<div class="tw-metric"><span>${label}</span><strong>${fmt(a)} <em>→</em> ${fmt(b)}</strong><i class="${cls}">${d}</i></div>`;
  }
  function render(run) {
    if (!run || run.schema_version !== 'experiment.v2') { box.hidden = true; return; }
    const bike = Object.keys(run.scenario.levers.intervention || {}).includes('bloor_cycle_track');
    const B = (id) => sum(run, 'baseline', id), P = (id) => sum(run, 'intervention', id);
    const people = new Set(run.changed_decisions.map((c) => c.actor)).size;
    const tiles = bike
      ? [tile('Bike trips on Bloor', B('bloor_bike_trips'), P('bloor_bike_trips'), count),
        tile('Metres cycled beside cars', B('bloor_shared_cycling_m'), P('bloor_shared_cycling_m'), (v) => `${Math.round(v).toLocaleString()} m`),
        tile('Sales at Bloor shops', B('shop_sales_cad'), P('shop_sales_cad'), money),
        tile('Car trips', B('car_trips'), P('car_trips'), count)]
      : [tile('TTC fare revenue', B('fare_revenue_cad'), P('fare_revenue_cad'), money),
        tile('TTC trips', B('transit_trips'), P('transit_trips'), count),
        tile('Car trips', B('car_trips'), P('car_trips'), count),
        tile('Sales at Bloor shops', B('shop_sales_cad'), P('shop_sales_cad'), money)];
    const periods = run.scenario.ticks - run.scenario.policy_start + 1;
    box.innerHTML = `<div class="tw-metrics-row">${tiles.join('')}</div>
      <p class="tw-metrics-note">Without → with the policy, ${periods} simulated weekdays · ${people} of ${run.population.count} synthetic people changed a choice · simulated, not a forecast</p>
      ${roster(run)}`;
    box.hidden = false;
  }
  /* Everyone in the run, the people whose choice changed first. A click flies the 3D view to them
   * (viewer3d-bridge.js listens for data-viewer3d-person) and opens their card. */
  const nice = (v) => String(v || '').replace(/_/g, ' ');
  const CHOICE = { bike_bloor: 'cycle on Bloor', bike_side_street: 'cycle via side streets', transit: 'TTC', car: 'drive', drive: 'drive', walk: 'walk', shop_elsewhere: 'shop elsewhere', defer: 'stay home' };
  const choice = (v) => CHOICE[v] || nice(v);
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function roster(run) {
    const changes = new Map();
    for (const c of run.changed_decisions) (changes.get(c.actor) || changes.set(c.actor, []).get(c.actor)).push(c);
    const rows = run.personas.map((p) => {
      const cs = changes.get(p.id) || [];
      const what = [...new Set(cs.map((c) => `${choice(c.baseline.action)} → ${choice(c.intervention.action)}`))].slice(0, 2).join(' · ');
      const kit = [p.fare_category === 'fair_pass' ? 'Fair Pass' : 'adult fare', p.has_car ? 'car' : null, p.has_bike ? 'bike' : null].filter(Boolean).join(' · ');
      return { p, cs, html: `<button type="button" class="tw-person${cs.length ? ' is-changed' : ''}" data-viewer3d-person="${esc(p.id)}" data-changed="${cs.length ? 1 : 0}">
        <strong>${esc(p.name)}</strong><span>${esc(nice(p.role))}</span><small>${esc(kit)}</small><em>${cs.length ? esc(what) : 'same choices'}</em></button>` };
    }).sort((a, b) => b.cs.length - a.cs.length || a.p.name.localeCompare(b.p.name));
    return `<div class="tw-people"><div class="tw-people-head"><span>Everyone in this run · ${run.personas.length} people</span><small>${changes.size} changed a choice with the policy · click anyone to follow them in 3D</small></div>
      <div class="tw-people-grid">${rows.map((r) => r.html).join('')}</div></div>`;
  }
  // A changed person is shown in the policy world; anyone else keeps the current view.
  document.addEventListener('click', (event) => {
    const b = event.target.closest && event.target.closest('.tw-person');
    if (!b) return;
    if (b.dataset.changed === '1') document.getElementById('policyView')?.click();
    for (const x of document.querySelectorAll('.tw-person')) x.setAttribute('aria-pressed', String(x === b));
    document.getElementById('simulationViewport')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, true);
  window.addEventListener('counterfactual:result', (event) => render(event.detail));
  if (window.CounterfactualCurrentRun) render(window.CounterfactualCurrentRun);
})();
