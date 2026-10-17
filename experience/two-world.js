/* Two Worlds demo view.
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
      <p class="tw-metrics-note">Without → with the policy, ${periods} simulated weekdays · ${people} of ${run.population.count} synthetic people changed a choice · simulated, not a forecast</p>`;
    box.hidden = false;
  }
  window.addEventListener('counterfactual:result', (event) => render(event.detail));
  if (window.CounterfactualCurrentRun) render(window.CounterfactualCurrentRun);
})();
