/* Two Worlds demo view.
 * 1. The 100-agent panel sits right after the prompt, above the 3D view.
 * 2. The decision brief sits under the 3D view. Every figure is reduced from the
 *    current experiment.v2 run (metrics.by_tick, metrics.by_group, events).
 *    Nothing in the brief is a typed result. */
(function () {
  'use strict';

  function place() {
    const poll = document.getElementById('agentPoll'), intro = document.getElementById('intro');
    if (poll && intro && intro.nextElementSibling !== poll) intro.after(poll);
  }
  place();
  document.addEventListener('DOMContentLoaded', place);

  const box = document.createElement('section');
  box.className = 'tw-brief';
  box.hidden = true;
  box.setAttribute('aria-label', 'Decision brief');
  const layout = document.querySelector('#lab .lab-layout');
  if (layout) layout.after(box);

  const LITERATURE = {
    fare: 'Fare studies report ridership, revenue from fares actually paid, and differences by fare product — not the posted fare times every boarding (Guzman, Gomez and Moncada 2020; Hickey 2005; Kholodov et al. 2021; Morrissey and Oke 2022). A shop effect is not assumed: free-fare experiments found no clear commercial change (Studenmund and Connor 1982). No Toronto elasticity is applied.',
    bike: 'Cycle-track studies report route and mode shift, vehicle time, customer arrivals, and retail receipts, which run from gains to losses (Smith Lea et al. 2017/2019; Volker and Handy 2021; Stantec 2011). Installation results are not reversed into a removal effect. Metres shared with cars are exposure, not injuries. The 2025 counter west of Huron (3,524 passages/day) is street context, not a result of this run.',
    compiled: 'Any lever the world can run is reduced the same way: trips by mode, who pays, focal-shop receipts, and sample TTC receipts. Citywide totals, injuries, emissions, closures and GDP stay off this brief.',
  };
  const MEASURE = {
    fare: [
      'A Toronto response by fare product and trip purpose, counted from paid rides rather than the posted fare.',
      'Transactions at these six shops before the receipt change is treated as a retail effect.',
      'Sampling weights before any figure is scaled past these people or this 619 m section.',
    ],
    bike: [
      'Origin–destination counts on this Bathurst–Spadina block, kept separate from the Huron counter.',
      'A removal design and cost for this segment. The City multi-corridor estimate does not apply here.',
      'Shop transactions, and an exposure model, before any injury or retail claim. The 2016–17 installation studies are not a removal coefficient.',
    ],
    compiled: [
      'A measured response for this lever. The run only changes the mapped rules.',
      'The same limits on sampling, shop transactions and exposure as the prepared cases.',
    ],
  };

  const r1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const money = (n) => {
    const neg = n < -0.004;
    const body = Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '−' : '') + '$' + body;
  };
  const moneyDelta = (n) => (Math.abs(n) < 0.005 ? '$0.00' : (n > 0 ? '+' : '−') + money(Math.abs(n)));
  const count = (n) => {
    const v = r1(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const countDelta = (n) => {
    const v = r1(n);
    if (v === 0) return '0';
    return (v > 0 ? '+' : '−') + count(Math.abs(v));
  };
  const pct = (base, next) => (base ? Math.round(((next - base) / Math.abs(base)) * 100) : null);
  const pctText = (base, next) => {
    const p = pct(base, next);
    if (p === null) return next ? 'new' : '—';
    if (p === 0) return '0%';
    return (p > 0 ? '+' : '−') + Math.abs(p) + '%';
  };
  const same = (a, b) => Math.abs(a - b) < 0.005;

  function el(tag, attrs, kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value);
    }
    for (const kid of kids || []) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }
  function txt(tag, className, text) {
    return el(tag, className ? { class: className } : {}, [text]);
  }

  function kindOf(run) {
    const base = run.scenario.levers?.baseline || {};
    const next = run.scenario.levers?.intervention || {};
    if (next.bloor_cycle_track && next.bloor_cycle_track !== (base.bloor_cycle_track || 'protected')) return 'bike';
    if (Number(next.adult_fare_cad) !== Number(base.adult_fare_cad)) return 'fare';
    return 'compiled';
  }
  function sum(run, arm, id) {
    return run.runs[arm].metrics.by_tick
      .filter((row) => row.tick >= run.scenario.policy_start)
      .reduce((total, row) => total + (Number(row[id]) || 0), 0);
  }
  function series(run, arm, id) {
    return run.runs[arm].metrics.by_tick.map((row) => Number(row[id]) || 0);
  }
  function groupSum(run, arm, group, id) {
    const values = run.runs[arm].metrics.by_group?.[group]?.[id];
    if (!values) return null;
    return values.filter((_, index) => index + 1 >= run.scenario.policy_start).reduce((total, value) => total + (Number(value) || 0), 0);
  }
  function meanOf(run, arm, id) {
    const rows = run.runs[arm].metrics.by_tick.filter((row) => row.tick >= run.scenario.policy_start);
    if (!rows.length) return 0;
    return rows.reduce((total, row) => total + (Number(row[id]) || 0), 0) / rows.length;
  }
  function headcount(run, category) {
    return (run.personas || []).filter((person) => person.fare_category === category).length;
  }
  function reducedShopNames(run) {
    const names = new Map((run.places?.shops || []).map((shop) => [shop.business_id, shop.name]));
    const ids = run.runs.intervention.events
      .filter((event) => event.action === 'set_shop_hours' && event.reduced && event.tick >= run.scenario.policy_start)
      .map((event) => event.business_id);
    return [...new Set(ids)].map((id) => names.get(id) || 'A focal shop');
  }

  function model(run) {
    const kind = kindOf(run);
    const start = run.scenario.policy_start;
    const periods = run.scenario.ticks - start + 1;
    const B = (id) => sum(run, 'baseline', id);
    const P = (id) => sum(run, 'intervention', id);
    const changedPeople = new Set(run.changed_decisions.filter((row) => row.tick >= start).map((row) => row.actor)).size;
    const fareOk = same(B('household_fare_spend_cad'), B('fare_revenue_cad')) && same(P('household_fare_spend_cad'), P('fare_revenue_cad'));
    const shops = reducedShopNames(run);
    return {
      run, kind, start, periods, changedPeople, fareOk, shops,
      adultN: headcount(run, 'adult'), fairN: headcount(run, 'fair_pass'),
      fareBefore: run.scenario.levers?.baseline?.adult_fare_cad,
      fareAfter: run.scenario.levers?.intervention?.adult_fare_cad,
      B, P,
      adultFare: { base: groupSum(run, 'baseline', 'adult', 'household_fare_spend_cad'), next: groupSum(run, 'intervention', 'adult', 'household_fare_spend_cad') },
      fairFare: { base: groupSum(run, 'baseline', 'fair_pass', 'household_fare_spend_cad'), next: groupSum(run, 'intervention', 'fair_pass', 'household_fare_spend_cad') },
      adultTrips: { base: groupSum(run, 'baseline', 'adult', 'transit_trips'), next: groupSum(run, 'intervention', 'adult', 'transit_trips') },
      fairTrips: { base: groupSum(run, 'baseline', 'fair_pass', 'transit_trips'), next: groupSum(run, 'intervention', 'fair_pass', 'transit_trips') },
      driver: { base: meanOf(run, 'baseline', 'driver_mapped_minutes'), next: meanOf(run, 'intervention', 'driver_mapped_minutes') },
    };
  }

  function pair(base, next, format) {
    return `${format(base)} → ${format(next)}`;
  }

  function finding(m) {
    const revenueDown = m.P('fare_revenue_cad') < m.B('fare_revenue_cad') - 0.005;
    const revenueUp = m.P('fare_revenue_cad') > m.B('fare_revenue_cad') + 0.005;
    if (m.kind === 'fare') {
      const farePct = pct(m.fareBefore, m.fareAfter);
      const rideBit = revenueDown
        ? 'The extra fare does not cover the rides this sample gives up.'
        : revenueUp
          ? 'In this sample the extra fare more than covers the rides given up.'
          : 'Sample receipts do not move.';
      return `Adult fare ${money(m.fareBefore)} → ${money(m.fareAfter)}${farePct ? ` (${farePct > 0 ? '+' : '−'}${Math.abs(farePct)}% on the posted fare)` : ''}. ${rideBit}`;
    }
    if (m.kind === 'bike') {
      const driverSame = Math.abs(m.driver.next - m.driver.base) < 0.15;
      return driverSame
        ? 'Protection comes off Bloor. Sample cycling leaves the street. Driver time inside the 619 m does not improve.'
        : `Protection comes off Bloor. Sample cycling leaves the street. Mean driver time inside the section goes from ${m.driver.base.toFixed(1)} to ${m.driver.next.toFixed(1)} min per car leg.`;
    }
    const levers = (m.run.scenario.intervention || []).map((change) => change.lever || change.operator).filter(Boolean).join(', ') || 'compiled lever';
    return `Compiled change (${levers}) on the same 19 people and the same map. The figures below are what the event log records.`;
  }

  function suggests(m) {
    const lines = [];
    lines.push(`Line 2 trips ${pair(m.B('transit_trips'), m.P('transit_trips'), count)} (${pctText(m.B('transit_trips'), m.P('transit_trips'))}).`);
    if (m.kind === 'bike' || m.B('bloor_bike_trips') !== m.P('bloor_bike_trips')) {
      lines.push(`Cycling trips on Bloor ${pair(m.B('bloor_bike_trips'), m.P('bloor_bike_trips'), count)}. Cycling trips on any street ${pair(m.B('bike_trips'), m.P('bike_trips'), count)}.`);
    }
    lines.push(`Walking ${pair(m.B('walk_trips'), m.P('walk_trips'), count)}. Car ${pair(m.B('car_trips'), m.P('car_trips'), count)}. Errands outside the section ${pair(m.B('errands_elsewhere'), m.P('errands_elsewhere'), count)}. Completed trips ${pair(m.B('completed_trips'), m.P('completed_trips'), count)}.`);
    if (m.adultFare.base != null) {
      const fairHeld = same(m.fairFare.base, m.fairFare.next) && same(m.fairTrips.base, m.fairTrips.next);
      lines.push(`Adult riders (${m.adultN}) pay ${pair(m.adultFare.base, m.adultFare.next, money)} across ${pair(m.adultTrips.base, m.adultTrips.next, count)} Line 2 trips. Fair Pass riders (${m.fairN}) pay ${pair(m.fairFare.base, m.fairFare.next, money)} across ${pair(m.fairTrips.base, m.fairTrips.next, count)} trips${fairHeld ? ', unchanged' : ''}.`);
    }
    lines.push(`Sample TTC receipts ${pair(m.B('fare_revenue_cad'), m.P('fare_revenue_cad'), money)} (${moneyDelta(m.P('fare_revenue_cad') - m.B('fare_revenue_cad'))}). Focal shop receipts ${pair(m.B('shop_sales_cad'), m.P('shop_sales_cad'), money)}. Shop visits ${pair(m.B('local_shop_visits'), m.P('local_shop_visits'), count)}.`);
    if (m.kind === 'bike') {
      lines.push(`Distance cycled beside cars on Bloor ${pair(m.B('bloor_shared_cycling_m'), m.P('bloor_shared_cycling_m'), (n) => Math.round(n).toLocaleString('en-CA') + ' m')}. Mean driver time inside the section ${m.driver.base.toFixed(1)} → ${m.driver.next.toFixed(1)} min per car leg.`);
    }
    return lines.join(' ');
  }

  function barWidth(value, peak) {
    if (!value) return 'width:0;min-width:0';
    return `width:${(value / peak) * 100}%`;
  }
  function bars(rows, scale) {
    const shared = Math.max(1, ...rows.flatMap((row) => [row.base, row.next]));
    return el('div', { class: 'tw-bars' }, rows.map((row) => {
      const peak = scale === 'row' ? Math.max(1, row.base, row.next) : shared;
      return el('div', { class: 'tw-bar' }, [
        txt('span', 'tw-bar-label', row.label),
        el('span', { class: 'tw-bar-track', title: `Baseline ${row.format(row.base)}, with policy ${row.format(row.next)}` }, [
          el('i', { class: 'tw-bar-base', style: barWidth(row.base, peak) }),
          el('i', { class: 'tw-bar-next', style: barWidth(row.next, peak) }),
        ]),
        txt('b', null, `${row.format(row.base)} → ${row.format(row.next)}`),
      ]);
    }));
  }

  function chart(title, unit, base, next, format, policyStart) {
    const w = 360, h = 168, left = 52, right = 10, top = 16, bottom = 28;
    const all = [...base, ...next];
    const lo = Math.min(...all), hi = Math.max(...all);
    const span = hi - lo || 1;
    const x = (i) => left + (base.length === 1 ? (w - left - right) / 2 : i * (w - left - right) / (base.length - 1));
    const y = (v) => top + (1 - (v - lo) / span) * (h - top - bottom);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${title}. Unit: ${unit}. Baseline ${base.map(format).join(', ')}. With policy ${next.map(format).join(', ')}.`);
    const node = (name, attrs) => {
      const item = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
      return item;
    };
    svg.append(node('line', { x1: left, x2: w - right, y1: y(hi), y2: y(hi), stroke: '#94b5ad33' }));
    svg.append(node('line', { x1: left, x2: w - right, y1: y(lo), y2: y(lo), stroke: '#94b5ad33' }));
    const axis = (v) => {
      const full = format(v);
      if (full.length <= 7) return full;
      const abs = Math.abs(v);
      const body = abs >= 100 ? Math.round(abs).toLocaleString('en-CA') : abs.toFixed(1);
      return (v < -0.004 ? '−' : '') + (String(full).includes('$') ? '$' + body : body);
    };
    const hiLabel = node('text', { x: left - 6, y: y(hi) + 4, fill: '#8db3b3', 'font-size': 10, 'text-anchor': 'end' });
    hiLabel.textContent = axis(hi);
    const loLabel = node('text', { x: left - 6, y: y(lo) + 4, fill: '#8db3b3', 'font-size': 10, 'text-anchor': 'end' });
    loLabel.textContent = axis(lo);
    svg.append(hiLabel, loLabel);
    const path = (values) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    svg.append(node('path', { d: path(base), fill: 'none', stroke: '#ff987e', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    svg.append(node('path', { d: path(next), fill: 'none', stroke: '#a8f4d1', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    base.forEach((v, i) => {
      svg.append(node('circle', { cx: x(i), cy: y(v), r: 3, fill: '#ff987e' }));
      svg.append(node('circle', { cx: x(i), cy: y(next[i]), r: 3.2, fill: '#a8f4d1' }));
      const tick = node('text', { x: x(i), y: h - 8, fill: '#8db3b3', 'font-size': 10, 'text-anchor': 'middle' });
      tick.textContent = `P${i + 1}`;
      svg.append(tick);
    });
    const cut = Number(policyStart) - 1;
    if (cut > 0 && cut < base.length) {
      const mark = (x(cut - 1) + x(cut)) / 2;
      svg.append(node('line', { x1: mark, x2: mark, y1: top, y2: h - bottom, stroke: '#e4f69288', 'stroke-dasharray': '3 3' }));
    }
    return el('figure', { class: 'tw-chart' }, [
      el('figcaption', {}, [
        txt('span', null, title),
        txt('small', null, unit),
      ]),
      svg,
    ]);
  }

  function nodeCard(kicker, title, value, note) {
    return el('article', { class: 'tw-node' }, [
      txt('span', null, kicker),
      txt('strong', null, title),
      txt('b', null, value),
      txt('p', null, note),
    ]);
  }

  function flow(m) {
    const behaviour = m.kind === 'bike'
      ? nodeCard('Behaviour', 'Cycling trips on Bloor', pair(m.B('bloor_bike_trips'), m.P('bloor_bike_trips'), count), `${pctText(m.B('bloor_bike_trips'), m.P('bloor_bike_trips'))} · any-street cycling ${pair(m.B('bike_trips'), m.P('bike_trips'), count)}`)
      : nodeCard('Behaviour', 'Line 2 trips', pair(m.B('transit_trips'), m.P('transit_trips'), count), `${pctText(m.B('transit_trips'), m.P('transit_trips'))} · completed trips ${pair(m.B('completed_trips'), m.P('completed_trips'), count)}`);
    const access = m.kind === 'bike'
      ? nodeCard('Exposure', 'Metres beside cars', pair(m.B('bloor_shared_cycling_m'), m.P('bloor_shared_cycling_m'), (n) => Math.round(n).toLocaleString('en-CA') + ' m'), 'Summed over the policy weekdays. Exposure, not injuries.')
      : nodeCard('Access', 'Errands that leave the section', pair(m.B('errands_elsewhere'), m.P('errands_elsewhere'), count), m.B('deferred_trips') || m.P('deferred_trips') ? `Deferred trips ${pair(m.B('deferred_trips'), m.P('deferred_trips'), count)}.` : 'No trip in this sample is deferred.');
    const firms = nodeCard('Firms', 'Focal shop receipts', pair(m.B('shop_sales_cad'), m.P('shop_sales_cad'), money), `Visits ${pair(m.B('local_shop_visits'), m.P('local_shop_visits'), count)}. ${m.shops.length ? m.shops.join(', ') + ' shortens hours under the synthetic staffing rule. Not a closure.' : 'No focal shop shortens its hours.'}`);
    const who = m.adultFare.base == null
      ? nodeCard('Households', 'Recorded transport payments', pair(m.B('household_transport_spend_cad'), m.P('household_transport_spend_cad'), money), 'Fares plus stated travel costs. Time is not priced.')
      : nodeCard('Households', 'Who pays the fare', `Adult ${pair(m.adultFare.base, m.adultFare.next, money)}`, `Fair Pass ${pair(m.fairFare.base, m.fairFare.next, money)}. ${m.adultN} adult, ${m.fairN} Fair Pass.`);
    const budget = nodeCard('Public ledger', 'Sample TTC receipts', pair(m.B('fare_revenue_cad'), m.P('fare_revenue_cad'), money), m.fareOk ? 'Equals household fare payments. A transfer, not a second benefit.' : 'Compare with household fare payments before treating this as the public side.');
    const lever = m.kind === 'bike'
      ? nodeCard('Lever', 'Protected track', 'Removed', 'No car lane is added. Cyclists who stay on Bloor share the car lane.')
      : m.kind === 'fare'
        ? nodeCard('Lever', 'Adult single fare', `${money(m.fareBefore)} → ${money(m.fareAfter)}`, 'Fair Pass fare is unchanged. Citywide TTC rule, applied inside this section.')
        : nodeCard('Lever', 'Compiled change', (m.run.scenario.intervention || []).map((change) => `${change.lever || change.operator} ${change.value ?? ''}`).join(', ') || 'See the question', 'The validator accepted this lever. The response is not from a published coefficient.');
    return el('div', { class: 'tw-flow', role: 'group', 'aria-label': 'Causal chain from the lever to behaviour, households, the public ledger and shops' }, [
      lever, behaviour, access, who, budget, firms,
    ]);
  }

  function limits(run, kind) {
    return (run.not_estimable || [])
      .filter((item) => kind === 'bike' || item.id !== 'removal_construction_cost_cad')
      .map((item) => ({ id: item.id, reason: item.reason }));
  }
  const LIMIT_LABEL = {
    citywide_ttc_revenue_cad: 'Citywide TTC revenue',
    business_closures: 'Business closures',
    injuries: 'Injuries',
    emissions_kg: 'Emissions',
    gdp_cad: 'GDP',
    driver_time_beyond_section: 'Driver time past this block',
    removal_construction_cost_cad: 'Removal construction cost',
  };

  function render(run) {
    if (!run || run.schema_version !== 'experiment.v2') { box.hidden = true; box.replaceChildren(); return; }
    const m = model(run);
    const modes = [
      ['Line 2', m.B('transit_trips'), m.P('transit_trips')],
      ['Bike on Bloor', m.B('bloor_bike_trips'), m.P('bloor_bike_trips')],
      ['Bike, other street', m.B('bike_trips') - m.B('bloor_bike_trips'), m.P('bike_trips') - m.P('bloor_bike_trips')],
      ['Walk', m.B('walk_trips'), m.P('walk_trips')],
      ['Car', m.B('car_trips'), m.P('car_trips')],
      ['Errand outside section', m.B('errands_elsewhere'), m.P('errands_elsewhere')],
    ].filter((row) => row[1] || row[2]);
    const length = Math.round(run.world?.section_length_m || 619);
    const relevant = { fare: ['cost_weight', 'shop_staffing_response'], bike: ['unprotected_cycling_discomfort_per_km', 'shop_staffing_response'] };
    const assumptions = (run.assumptions || []).filter((item) => item.kind === 'sensitivity' && (!relevant[m.kind] || relevant[m.kind].includes(item.id)));

    const distribution = m.adultFare.base == null ? null : el('div', { class: 'tw-panel' }, [
      el('header', {}, [txt('span', null, 'Who is affected'), txt('h3', null, 'Adult fare versus Fair Pass')]),
      bars([
        { label: `Line 2 · adult (${m.adultN})`, base: m.adultTrips.base, next: m.adultTrips.next, format: count },
        { label: `Line 2 · Fair Pass (${m.fairN})`, base: m.fairTrips.base, next: m.fairTrips.next, format: count },
        { label: 'Fare paid · adult', base: m.adultFare.base, next: m.adultFare.next, format: money },
        { label: 'Fare paid · Fair Pass', base: m.fairFare.base, next: m.fairFare.next, format: money },
      ], 'row'),
      txt('p', 'tw-panel-note', m.kind === 'fare'
        ? 'Each row is scaled on its own. Length compares baseline with policy, not trips with dollars. Fair Pass is the concession this fare change holds fixed.'
        : 'Each row is scaled on its own. Length compares baseline with policy, not trips with dollars.'),
    ]);

    box.replaceChildren(
      el('header', { class: 'tw-brief-head' }, [
        txt('p', 'tw-kicker', `Decision brief · ${m.periods} modelled weekdays after the change · ${run.population.count} synthetic people · ${String(run.evidence_tier || 'assumption-driven').replace(/_/g, ' ')}`),
        txt('h2', null, run.scenario.question || 'What changed in this run'),
        txt('p', 'tw-scope', `${run.world?.title || 'Bathurst–Spadina'} · ${length} m · seed ${run.seed} · policy starts period ${m.start} of ${run.scenario.ticks} · ${m.changedPeople} of ${run.population.count} people change a choice`),
      ]),
      el('div', { class: 'tw-hero' }, [
        el('div', {}, [
          txt('span', null, m.kind === 'bike' ? 'Sample cycling trips on Bloor' : 'Sample TTC receipts'),
          txt('strong', null, m.kind === 'bike'
            ? pair(m.B('bloor_bike_trips'), m.P('bloor_bike_trips'), count)
            : pair(m.B('fare_revenue_cad'), m.P('fare_revenue_cad'), money)),
          txt('em', null, m.kind === 'bike'
            ? `${pctText(m.B('bloor_bike_trips'), m.P('bloor_bike_trips'))} · ${countDelta(m.P('bloor_bike_trips') - m.B('bloor_bike_trips'))} trips`
            : `${moneyDelta(m.P('fare_revenue_cad') - m.B('fare_revenue_cad'))} · ${pctText(m.B('fare_revenue_cad'), m.P('fare_revenue_cad'))}`),
        ]),
        txt('p', null, finding(m)),
      ]),
      el('div', { class: 'tw-ledgers' }, [
        el('article', {}, [
          txt('span', null, 'Households'),
          txt('strong', null, pair(m.B('household_transport_spend_cad'), m.P('household_transport_spend_cad'), money)),
          txt('p', null, `Recorded transport payments. Fare portion ${pair(m.B('household_fare_spend_cad'), m.P('household_fare_spend_cad'), money)}.`),
        ]),
        el('article', {}, [
          txt('span', null, 'Firms on this block'),
          txt('strong', null, pair(m.B('shop_sales_cad'), m.P('shop_sales_cad'), money)),
          txt('p', null, `Receipts at the six mapped shops. Visits ${pair(m.B('local_shop_visits'), m.P('local_shop_visits'), count)}. ${moneyDelta(m.P('shop_sales_cad') - m.B('shop_sales_cad'))}.`),
        ]),
        el('article', {}, [
          txt('span', null, 'Public ledger'),
          txt('strong', null, pair(m.B('fare_revenue_cad'), m.P('fare_revenue_cad'), money)),
          txt('p', null, m.fareOk ? 'Matches household fare payments in both arms. One transfer, two sides.' : 'Sample fare payments received inside the section.'),
        ]),
      ]),
      el('div', { class: 'tw-split' }, [
        distribution,
        el('div', { class: 'tw-panel' }, [
          el('header', {}, [
            txt('span', null, 'Substitution'),
            txt('h3', null, 'Where the trips went'),
            el('p', { class: 'tw-legend' }, [txt('i', 'is-base', ''), ' Baseline ', txt('i', 'is-next', ''), ' With policy']),
          ]),
          bars(modes.map(([label, base, next]) => ({ label, base, next, format: count })), 'shared'),
          txt('p', 'tw-panel-note', 'Counts of completed sample trips over the same weekdays. A trip that leaves the section is not a deferred trip.'),
        ]),
      ].filter(Boolean)),
      el('div', { class: 'tw-charts' }, [
        chart(
          m.kind === 'bike' ? 'Cycling trips on Bloor' : 'Sample TTC receipts',
          m.kind === 'bike' ? 'trips per modelled weekday' : 'CAD per modelled weekday',
          series(run, 'baseline', m.kind === 'bike' ? 'bloor_bike_trips' : 'fare_revenue_cad'),
          series(run, 'intervention', m.kind === 'bike' ? 'bloor_bike_trips' : 'fare_revenue_cad'),
          m.kind === 'bike' ? count : money,
          m.start,
        ),
        chart(
          m.kind === 'bike' ? 'Metres cycled beside cars' : 'Line 2 trips',
          m.kind === 'bike' ? 'metres per modelled weekday' : 'trips per modelled weekday',
          series(run, 'baseline', m.kind === 'bike' ? 'bloor_shared_cycling_m' : 'transit_trips'),
          series(run, 'intervention', m.kind === 'bike' ? 'bloor_shared_cycling_m' : 'transit_trips'),
          m.kind === 'bike' ? (n) => Math.round(n).toLocaleString('en-CA') : count,
          m.start,
        ),
        chart(
          'Focal shop receipts',
          'CAD per modelled weekday',
          series(run, 'baseline', 'shop_sales_cad'),
          series(run, 'intervention', 'shop_sales_cad'),
          money,
          m.start,
        ),
      ]),
      txt('p', 'tw-chart-note', `Each point is one modelled weekday. The dashed line is where the policy starts (period ${m.start}). Coral is baseline, mint is with the policy. Same people, same seed.`),
      el('section', { class: 'tw-graph', 'aria-label': 'How the lever reaches each ledger' }, [
        el('header', {}, [txt('span', null, 'Causal chain'), txt('h3', null, 'One lever, five ledgers')]),
        flow(m),
        txt('p', 'tw-panel-note', 'The lever changes the choice score. That changes trips. Trips change who pays, what the sample TTC receives, and which shop door opens. Fare payments appear once as a household cost and once as a public receipt.'),
      ]),
      el('section', { class: 'tw-limits' }, [
        el('div', {}, [txt('span', null, 'Not estimable from this run'), txt('strong', null, 'Left off the brief on purpose')]),
        el('ul', {}, limits(run, m.kind).map((item) => {
          const li = txt('li', null, LIMIT_LABEL[item.id] || item.id);
          if (item.reason) li.title = item.reason;
          return li;
        })),
      ]),
      el('div', { class: 'tw-decide' }, [
        el('section', {}, [
          txt('span', null, 'What this run suggests'),
          txt('p', null, suggests(m)),
        ]),
        el('section', {}, [
          txt('span', null, 'What is still uncertain'),
          el('ul', {}, assumptions.map((item) => txt('li', null, `${item.id.replace(/_/g, ' ')}: base ${item.value}${item.low !== undefined ? `, low ${item.low}, high ${item.high}` : ''}. ${item.note || ''}`))),
          txt('p', null, 'The charts are the base case. Low and high are the declared range, not a computed confidence interval. A versioned rerun is in Researcher view.'),
        ]),
        el('section', {}, [
          txt('span', null, 'What to measure before acting'),
          el('ol', {}, (MEASURE[m.kind] || MEASURE.compiled).map((line) => txt('li', null, line))),
        ]),
      ]),
      el('aside', { class: 'tw-context' }, [
        txt('span', null, 'Observed context, not a model output'),
        txt('p', null, m.kind === 'bike'
          ? 'Streets, signals, Line 2 and the six shop doors are mapped. The 2025 Bloor counter west of Huron recorded 3,524 passages/day. That is a scale cue for the street, not a removal effect and not a number this run produced.'
          : 'The adult PRESTO fare is $3.30 and Fair Pass is $2.10, citywide TTC rules. Streets, signals, Line 2 and the six shop doors are mapped. The choice response, baskets and shop-hour rule are synthetic.'),
      ]),
      txt('p', 'tw-lit', LITERATURE[m.kind] || LITERATURE.compiled),
    );
    box.hidden = false;
  }

  window.addEventListener('counterfactual:result', (event) => render(event.detail));
  if (window.CounterfactualCurrentRun) render(window.CounterfactualCurrentRun);
})();
