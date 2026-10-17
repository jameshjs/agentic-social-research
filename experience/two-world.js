/* Two Worlds demo view.
 * 1. The 100-agent panel sits right after the prompt, above the 3D view.
 * 2. The results brief sits under the 3D view. Every figure is reduced from the
 *    current experiment.v2 run (metrics.by_tick, metrics.by_group, events), as
 *    before → after over the same weekdays. Nothing in the brief is a typed result. */
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
  box.setAttribute('aria-label', 'Results brief');
  const layout = document.querySelector('#lab .lab-layout');
  if (layout) layout.after(box);

  const LITERATURE = {
    fare: 'Fare studies report ridership, revenue from fares actually paid, and differences by fare product (Guzman, Gomez and Moncada 2020; Hickey 2005; Kholodov et al. 2021; Morrissey and Oke 2022). Free-fare experiments found no clear effect on shops (Studenmund and Connor 1982), so no shop effect is assumed. No Toronto elasticity is applied.',
    bike: 'Cycle-track studies report route and mode shift, vehicle time, customer arrivals and retail sales, with results ranging from gains to losses (Smith Lea et al. 2017/2019; Volker and Handy 2021; Stantec 2011). Installation results are not reversed into a removal effect.',
    compiled: 'Any lever the world can run is reduced the same way: trips by mode, who pays, shop sales and TTC fare revenue. Citywide totals, injuries, emissions, closures and GDP stay off this brief.',
  };
  const CONTEXT = {
    fare: 'Observed: the adult PRESTO fare is $3.30 and Fair Pass is $2.10 (citywide TTC rules); streets, signals, Line 2 and the six shops are mapped. Synthetic: the residents, their trip choices, shopping baskets and the shop-hours rule.',
    bike: 'Observed: streets, signals, Line 2 and the six shops are mapped; the 2025 Bloor counter west of Huron recorded 3,524 cyclist passages a day (street context, not a result of this run). Synthetic: the residents, their trip choices, shopping baskets and the shop-hours rule.',
    compiled: 'Observed: streets, signals, Line 2 and the six shops are mapped. Synthetic: the residents, their trip choices, shopping baskets and the shop-hours rule.',
  };
  const MEASURE = {
    fare: [
      'How Toronto riders respond by fare product and trip purpose, counted from paid rides.',
      'Sales at these six shops, before a change in sales is treated as a retail effect.',
      'Sampling weights, before any figure is scaled beyond these residents or this block.',
    ],
    bike: [
      'Trip counts on this Bathurst–Spadina block, kept separate from the Huron counter.',
      'A removal design and cost for this segment. The City multi-corridor estimate does not apply.',
      'Shop sales and a traffic-conflict model, before any retail or injury claim.',
    ],
    compiled: [
      'A measured response for this lever. The run only changes the mapped rules.',
      'The same limits on sampling, shop sales and exposure as the prepared cases.',
    ],
  };
  const LIMIT_LABEL = {
    citywide_ttc_revenue_cad: 'Citywide TTC revenue',
    business_closures: 'Business closures',
    injuries: 'Injuries',
    emissions_kg: 'Emissions',
    gdp_cad: 'GDP',
    driver_time_beyond_section: 'Driver time beyond this block',
    removal_construction_cost_cad: 'Removal construction cost',
  };
  const ASSUMPTION_LABEL = {
    cost_weight: 'How strongly price affects trip choices',
    unprotected_cycling_discomfort_per_km: 'Discomfort of cycling in traffic, per km',
    shop_staffing_response: 'Shops shorten hours when daily sales fall below a floor',
  };

  // ---------- formatting: one rule per unit, used everywhere ----------
  const whole = (n) => Math.abs(n - Math.round(n)) < 0.005;
  const cad = (n) => {
    const v = Math.abs(n);
    const body = whole(v) ? Math.round(v).toLocaleString('en-CA') : v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < -0.004 ? '−' : '') + '$' + body;
  };
  const fare = (n) => '$' + Number(n).toFixed(2);
  const num = (n) => (whole(n) ? Math.round(n).toLocaleString('en-CA') : (Math.round(n * 10) / 10).toFixed(1));
  const metres = (n) => Math.round(n).toLocaleString('en-CA') + ' m';
  const minutes = (n) => (Math.round(n * 10) / 10).toFixed(1) + ' min';
  const pct = (base, next) => (base ? Math.round(((next - base) / Math.abs(base)) * 100) : null);
  const signed = (d, fmt) => (d > 0 ? '+' : '−') + fmt(Math.abs(d)).replace(/^−/, '');
  function change(base, next, fmt) {
    const d = next - base;
    if (Math.abs(d) < (fmt === minutes ? 0.05 : 0.005)) return { text: 'No change', dir: 0 };
    const p = pct(base, next);
    return { text: signed(d, fmt) + (p === null ? '' : ` (${p > 0 ? '+' : '−'}${Math.abs(p)}%)`), dir: d > 0 ? 1 : -1 };
  }
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
  const txt = (tag, className, text) => el(tag, className ? { class: className } : {}, [text]);

  // ---------- reading the run ----------
  function kindOf(run) {
    const base = run.scenario.levers?.baseline || {};
    const next = run.scenario.levers?.intervention || {};
    if (next.bloor_cycle_track && next.bloor_cycle_track !== (base.bloor_cycle_track || 'protected')) return 'bike';
    if (Number(next.adult_fare_cad) !== Number(base.adult_fare_cad)) return 'fare';
    return 'compiled';
  }
  const policyRows = (run, arm) => run.runs[arm].metrics.by_tick.filter((row) => row.tick >= run.scenario.policy_start);
  const sum = (run, arm, id) => policyRows(run, arm).reduce((total, row) => total + (Number(row[id]) || 0), 0);
  function mean(run, arm, id) {
    const rows = policyRows(run, arm);
    return rows.length ? rows.reduce((total, row) => total + (Number(row[id]) || 0), 0) / rows.length : 0;
  }
  const series = (run, arm, id) => run.runs[arm].metrics.by_tick.map((row) => Number(row[id]) || 0);
  function groupSum(run, arm, group, id) {
    const values = run.runs[arm].metrics.by_group?.[group]?.[id];
    if (!values) return null;
    return values.filter((_, index) => index + 1 >= run.scenario.policy_start).reduce((total, value) => total + (Number(value) || 0), 0);
  }
  const headcount = (run, category) => (run.personas || []).filter((person) => person.fare_category === category).length;
  function reducedShopNames(run) {
    const names = new Map((run.places?.shops || []).map((shop) => [shop.business_id, shop.name]));
    const ids = run.runs.intervention.events
      .filter((event) => event.action === 'set_shop_hours' && event.reduced && event.tick >= run.scenario.policy_start)
      .map((event) => event.business_id);
    return [...new Set(ids)].map((id) => names.get(id) || 'A mapped shop');
  }
  const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  function model(run) {
    const kind = kindOf(run);
    const start = run.scenario.policy_start;
    const pair = (id, how = sum) => ({ base: how(run, 'baseline', id), next: how(run, 'intervention', id) });
    const group = (g, id) => ({ base: groupSum(run, 'baseline', g, id), next: groupSum(run, 'intervention', g, id) });
    const m = {
      run, kind, start,
      days: run.scenario.ticks - start + 1,
      people: run.population?.count || (run.personas || []).length,
      changed: new Set(run.changed_decisions.filter((row) => row.tick >= start).map((row) => row.actor)).size,
      shops: reducedShopNames(run),
      shopCount: (run.places?.shops || []).length || 6,
      adultN: headcount(run, 'adult'), fairN: headcount(run, 'fair_pass'),
      fare: { base: run.scenario.levers?.baseline?.adult_fare_cad, next: run.scenario.levers?.intervention?.adult_fare_cad },
      transit: pair('transit_trips'), bike: pair('bike_trips'), bloorBike: pair('bloor_bike_trips'),
      walk: pair('walk_trips'), car: pair('car_trips'), elsewhere: pair('errands_elsewhere'), completed: pair('completed_trips'),
      revenue: pair('fare_revenue_cad'), paid: pair('household_fare_spend_cad'), transport: pair('household_transport_spend_cad'),
      sales: pair('shop_sales_cad'), visits: pair('local_shop_visits'), reduced: pair('shops_reduced_hours', mean),
      shared: pair('bloor_shared_cycling_m'), driver: pair('driver_mapped_minutes', mean), cyclist: pair('cyclist_mapped_minutes', mean),
      adultTrips: group('adult', 'transit_trips'), fairTrips: group('fair_pass', 'transit_trips'),
      adultPaid: group('adult', 'household_fare_spend_cad'), fairPaid: group('fair_pass', 'household_fare_spend_cad'),
    };
    m.offBloor = { base: m.bike.base - m.bloorBike.base, next: m.bike.next - m.bloorBike.next };
    m.transfer = same(m.paid.base, m.revenue.base) && same(m.paid.next, m.revenue.next);
    m.hasGroups = m.adultTrips.base != null;
    return m;
  }

  // ---------- plain-language takeaways, each built from the figures in the table ----------
  function takeaways(m) {
    const out = [];
    const d = (p) => p.next - p.base;
    const modes = m.kind === 'bike'
      ? [['subway', m.transit], ['cycling on Bloor', m.bloorBike], ['cycling on other streets', m.offBloor], ['walking', m.walk], ['driving', m.car], ['errands outside the area', m.elsewhere]]
      : [['subway', m.transit], ['cycling', m.bike], ['walking', m.walk], ['driving', m.car], ['errands outside the area', m.elsewhere]];
    const moved = (sign) => modes.filter(([, p]) => sign * d(p) > 0.5).sort((a, b) => sign * (d(b[1]) - d(a[1])))
      .map(([label, p]) => `${label} (${sign > 0 ? '+' : '−'}${num(Math.abs(d(p)))})`);
    const losses = moved(-1), gains = moved(1);
    const kept = same(m.completed.base, m.completed.next) ? ` No one stops travelling: all ${num(m.completed.next)} trips still happen.` : '';
    const shift = losses.length && gains.length ? `${list(losses).replace(/^./, (c) => c.toUpperCase())} trips shift to ${list(gains)}.` : '';
    const shopLine = () => {
      const c = change(m.sales.base, m.sales.next, cad);
      const hours = m.shops.length ? ` ${list(m.shops)} ${m.shops.length > 1 ? 'shorten their' : 'shortens its'} hours under the simulated staffing rule (not a closure).` : '';
      return c.dir === 0 ? `Sales at the ${m.shopCount} mapped shops do not change.${hours}` : `Sales at the ${m.shopCount} mapped shops ${c.dir < 0 ? 'fall' : 'rise'} ${c.text.replace(/^[+−]/, '')}.${hours}`;
    };

    if (m.kind === 'fare') {
      const up = m.fare.next > m.fare.base;
      if (m.hasGroups) {
        const fairHeld = same(m.fairTrips.base, m.fairTrips.next);
        const n = d(m.adultTrips);
        out.push(`${Math.abs(n) < 0.5 ? 'Adult riders take the same number of subway trips' : `Adult riders take ${num(Math.abs(n))} ${n < 0 ? 'fewer' : 'more'} subway trips`} (${num(m.adultTrips.base)} → ${num(m.adultTrips.next)}).${fairHeld ? ` The ${m.fairN} Fair Pass riders keep all ${num(m.fairTrips.next)} of theirs.` : ''}`);
      } else {
        out.push(`Subway trips go from ${num(m.transit.base)} to ${num(m.transit.next)}.`);
      }
      if (shift) out.push(shift + kept);
      const r = change(m.revenue.base, m.revenue.next, cad);
      const why = r.dir < 0
        ? (up ? 'the higher fare does not make up for the rides lost' : 'the extra rides do not make up for the lower fare')
        : (up ? 'the higher fare outweighs the rides lost' : 'the extra rides outweigh the lower fare');
      out.push(r.dir === 0 ? 'TTC fare revenue does not change.' : `TTC fare revenue ${r.dir < 0 ? 'falls' : 'rises'} ${r.text.replace(/^[+−]/, '')}: ${why}.`);
      out.push(shopLine());
    } else if (m.kind === 'bike') {
      const r = change(m.revenue.base, m.revenue.next, cad);
      out.push(`Cycling trips on Bloor ${d(m.bloorBike) < 0 ? 'drop' : 'go'} from ${num(m.bloorBike.base)} to ${num(m.bloorBike.next)}. ${shift}${r.dir > 0 ? ` TTC fare revenue rises ${r.text.replace(/^\+/, '')} as a result.` : ''}`.trim());
      if (d(m.shared) > 0) out.push(`Residents who keep riding Bloor now cycle ${metres(m.shared.next)} in mixed traffic, up from ${metres(m.shared.base)}. That is exposure, not an injury count.`);
      out.push(Math.abs(d(m.driver)) < 0.15
        ? `Drivers do not get through faster: average time through the block stays at ${minutes(m.driver.next)}.`
        : `Average driver time through the block goes from ${minutes(m.driver.base)} to ${minutes(m.driver.next)}.`);
      out.push(shopLine());
    } else {
      out.push(`Subway trips go from ${num(m.transit.base)} to ${num(m.transit.next)}; cycling from ${num(m.bike.base)} to ${num(m.bike.next)}.`);
      if (shift) out.push(shift + kept);
      out.push(shopLine());
    }
    return out.slice(0, 4);
  }

  // ---------- building blocks ----------
  function kpi(label, base, next, fmt, note) {
    const c = change(base, next, fmt);
    return el('article', { class: 'tw-kpi' }, [
      txt('span', 'tw-kpi-label', label),
      el('p', { class: 'tw-kpi-value' }, [txt('span', 'is-before', fmt(base)), txt('span', 'tw-arrow', '→'), txt('span', 'is-after', fmt(next))]),
      txt('p', `tw-kpi-change${c.dir ? '' : ' is-flat'}`, c.text),
      note ? txt('p', 'tw-kpi-note', note) : null,
    ]);
  }
  function kpiCount(label, value, note) {
    return el('article', { class: 'tw-kpi' }, [
      txt('span', 'tw-kpi-label', label),
      el('p', { class: 'tw-kpi-value' }, [txt('span', 'is-after', value)]),
      txt('p', 'tw-kpi-note', note),
    ]);
  }

  function table(groups) {
    const head = el('thead', {}, [el('tr', {}, [
      txt('th', 'tw-col-measure', 'Measure'), txt('th', null, 'Before'), txt('th', null, 'After'), txt('th', null, 'Change'),
    ])]);
    const body = el('tbody', {}, groups.flatMap((g) => [
      el('tr', { class: 'tw-group' }, [el('th', { colspan: 4, scope: 'rowgroup' }, [g.title])]),
      ...g.rows.filter(Boolean).map((row) => {
        const c = change(row.base, row.next, row.fmt);
        return el('tr', {}, [
          el('th', { scope: 'row' }, [txt('span', null, row.label), row.sub ? txt('small', null, row.sub) : null]),
          txt('td', 'is-before', row.fmt(row.base)),
          txt('td', 'is-after', row.fmt(row.next)),
          txt('td', `tw-change${c.dir ? '' : ' is-flat'}`, c.text),
        ]);
      }),
    ]));
    return el('table', { class: 'tw-table' }, [head, body]);
  }

  function modeBars(rows) {
    const peak = Math.max(1, ...rows.flatMap((row) => [row.base, row.next]));
    const w = (v) => (v ? `width:${Math.max(1.5, (v / peak) * 100)}%` : 'width:0');
    return el('div', { class: 'tw-bars' }, rows.map((row) => el('div', { class: 'tw-bar' }, [
      txt('span', 'tw-bar-label', row.label),
      el('span', { class: 'tw-bar-track', 'aria-hidden': 'true' }, [
        el('i', { class: 'tw-bar-before', style: w(row.base) }),
        el('i', { class: 'tw-bar-after', style: w(row.next) }),
      ]),
      el('span', { class: 'tw-bar-values' }, [txt('span', 'is-before', num(row.base)), ' → ', txt('span', 'is-after', num(row.next))]),
    ])));
  }

  function dayChart(base, next, fmt, policyStart) {
    const w = 420, h = 190, left = 56, right = 14, top = 22, bottom = 30;
    const all = [...base, ...next];
    const lo = Math.min(0, ...all);
    const raw = Math.max(lo + 1, ...all), mag = 10 ** Math.floor(Math.log10(raw));
    const hi = [1, 2, 2.5, 4, 5, 6, 8, 10].map((f) => f * mag).find((v) => v >= raw);
    const x = (i) => left + (base.length === 1 ? (w - left - right) / 2 : i * (w - left - right) / (base.length - 1));
    const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
    const ns = 'http://www.w3.org/2000/svg';
    const node = (name, attrs, text) => {
      const item = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
      if (text != null) item.textContent = text;
      return item;
    };
    const svg = node('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `Before: ${base.map(fmt).join(', ')}. After: ${next.map(fmt).join(', ')}.` });
    for (const v of [lo, (lo + hi) / 2, hi]) {
      svg.append(node('line', { x1: left, x2: w - right, y1: y(v), y2: y(v), stroke: '#a8c4c41f' }));
      svg.append(node('text', { x: left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tw-axis' }, fmt(v)));
    }
    const cut = Number(policyStart) - 1;
    if (cut > 0 && cut < base.length) {
      const mx = (x(cut - 1) + x(cut)) / 2;
      svg.append(node('line', { x1: mx, x2: mx, y1: top - 8, y2: h - bottom, stroke: '#e4f692aa', 'stroke-dasharray': '4 4' }));
      svg.append(node('text', { x: mx + 6, y: top - 8, class: 'tw-axis is-mark' }, 'Policy starts'));
    }
    const path = (values) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    svg.append(node('path', { d: path(base), fill: 'none', stroke: '#9db0b5', 'stroke-width': 2.2, 'stroke-dasharray': '6 5' }));
    svg.append(node('path', { d: path(next), fill: 'none', stroke: '#a8f4d1', 'stroke-width': 2.6 }));
    base.forEach((v, i) => {
      svg.append(node('circle', { cx: x(i), cy: y(v), r: 3.4, fill: '#9db0b5' }));
      svg.append(node('circle', { cx: x(i), cy: y(next[i]), r: 3.8, fill: '#a8f4d1' }));
      svg.append(node('text', { x: x(i), y: h - 8, 'text-anchor': 'middle', class: 'tw-axis' }, `Day ${i + 1}`));
    });
    return svg;
  }

  const legend = () => el('p', { class: 'tw-legend' }, [txt('i', 'is-before', ''), 'Before: current rules', txt('i', 'is-after', ''), 'After: with the policy']);

  // ---------- the brief ----------
  function render(run) {
    if (!run || run.schema_version !== 'experiment.v2') { box.hidden = true; box.replaceChildren(); return; }
    const m = model(run);
    const shopsSub = m.shops.length ? list(m.shops) : null;

    const kpis = m.kind === 'bike'
      ? [
        kpi('Cycling trips on Bloor', m.bloorBike.base, m.bloorBike.next, num),
        kpi('Distance cycled in mixed traffic', m.shared.base, m.shared.next, metres, 'Exposure, not injuries'),
        kpi('Driver time through the block', m.driver.base, m.driver.next, minutes, 'Average per car trip'),
        kpi('Sales at the mapped shops', m.sales.base, m.sales.next, cad),
      ]
      : [
        kpi('TTC fare revenue', m.revenue.base, m.revenue.next, cad),
        kpi('Subway trips', m.transit.base, m.transit.next, num),
        kpi('Sales at the mapped shops', m.sales.base, m.sales.next, cad),
        kpiCount('Residents who change a trip', `${m.changed} of ${m.people}`, 'Everyone else travels as before'),
      ];

    const travelRows = [
      { label: 'Subway (Line 2)', base: m.transit.base, next: m.transit.next, fmt: num },
      ...(m.kind === 'bike'
        ? [
          { label: 'Cycling on Bloor', base: m.bloorBike.base, next: m.bloorBike.next, fmt: num },
          { label: 'Cycling on other streets', base: m.offBloor.base, next: m.offBloor.next, fmt: num },
        ]
        : [{ label: 'Cycling', base: m.bike.base, next: m.bike.next, fmt: num }]),
      { label: 'Walking', base: m.walk.base, next: m.walk.next, fmt: num },
      { label: 'Driving', base: m.car.base, next: m.car.next, fmt: num },
      { label: 'Errands moved outside the area', base: m.elsewhere.base, next: m.elsewhere.next, fmt: num },
    ].filter((row) => row.base || row.next);

    const groups = [];
    if (m.kind === 'fare' || (m.kind === 'compiled' && m.hasGroups)) {
      groups.push({ title: 'Riders', rows: [
        m.kind === 'fare' ? { label: 'Adult fare per ride', sub: 'Fair Pass stays at $2.10', base: m.fare.base, next: m.fare.next, fmt: fare } : null,
        m.hasGroups ? { label: 'Subway trips by adult riders', sub: `${m.adultN} residents`, base: m.adultTrips.base, next: m.adultTrips.next, fmt: num } : null,
        m.hasGroups ? { label: 'Subway trips by Fair Pass riders', sub: `${m.fairN} residents`, base: m.fairTrips.base, next: m.fairTrips.next, fmt: num } : null,
        m.hasGroups ? { label: 'Fares paid by adult riders', base: m.adultPaid.base, next: m.adultPaid.next, fmt: cad } : null,
        m.hasGroups ? { label: 'Fares paid by Fair Pass riders', base: m.fairPaid.base, next: m.fairPaid.next, fmt: cad } : null,
        { label: 'All transport spending', sub: 'Fares plus travel costs; time is not priced', base: m.transport.base, next: m.transport.next, fmt: cad },
      ] });
    }
    if (m.kind === 'bike') {
      groups.push({ title: 'Cycling and traffic on Bloor', rows: [
        { label: 'Distance cycled in mixed traffic', sub: 'Exposure, not injuries', base: m.shared.base, next: m.shared.next, fmt: metres },
        { label: 'Average cycling time through the block', base: m.cyclist.base, next: m.cyclist.next, fmt: minutes },
        { label: 'Average driver time through the block', sub: `Inside the ${Math.round(run.world?.section_length_m || 619)} m only`, base: m.driver.base, next: m.driver.next, fmt: minutes },
      ] });
    }
    groups.push({ title: `How residents travel · trips by mode`, rows: [
      ...travelRows,
      { label: 'All trips completed', base: m.completed.base, next: m.completed.next, fmt: num },
    ] });
    groups.push({ title: 'TTC', rows: [
      { label: 'Fare revenue from these residents', sub: m.transfer ? 'Equal to fares paid: a transfer, not a gain' : null, base: m.revenue.base, next: m.revenue.next, fmt: cad },
    ] });
    groups.push({ title: `Local businesses · ${m.shopCount} mapped shops`, rows: [
      { label: 'Sales', base: m.sales.base, next: m.sales.next, fmt: cad },
      { label: 'Customer visits', base: m.visits.base, next: m.visits.next, fmt: num },
      { label: 'Shops on shorter hours', sub: shopsSub ? `${shopsSub}; simulated rule, not a closure` : 'Simulated rule, not a closure', base: m.reduced.base, next: m.reduced.next, fmt: num },
    ] });

    const trend = m.kind === 'bike'
      ? { title: 'Cycling trips on Bloor, per day', id: 'bloor_bike_trips', fmt: num }
      : { title: 'TTC fare revenue, per day', id: 'fare_revenue_cad', fmt: cad };
    const assumptions = (run.assumptions || []).filter((item) => item.kind === 'sensitivity'
      && (m.kind === 'bike' ? item.id !== 'cost_weight' : item.id !== 'unprotected_cycling_discomfort_per_km'));
    const limits = (run.not_estimable || []).filter((item) => m.kind === 'bike' || item.id !== 'removal_construction_cost_cad');
    const length = Math.round(run.world?.section_length_m || 619);

    box.replaceChildren(
      el('header', { class: 'tw-head' }, [
        txt('p', 'tw-eyebrow', 'Results · simulated'),
        txt('h2', null, run.scenario.question || 'What changed in this run'),
        txt('p', 'tw-lede', `${m.people} synthetic residents on a real map of Bloor St W, Bathurst to Spadina (${length} m). Before and after use the same people and the same random seed; only the policy differs. Figures are totals for the ${m.days} weekdays after the change. This shows how the effect travels, not a forecast for Toronto.`),
        legend(),
      ]),
      el('div', { class: 'tw-kpis' }, kpis),
      el('section', { class: 'tw-card tw-takeaways' }, [
        txt('h3', null, 'What happens'),
        el('ol', {}, takeaways(m).map((line) => txt('li', null, line))),
      ]),
      el('div', { class: 'tw-grid' }, [
        el('section', { class: 'tw-card' }, [txt('h3', null, 'Scorecard'), table(groups)]),
        el('div', { class: 'tw-side' }, [
          el('section', { class: 'tw-card' }, [txt('h3', null, 'Trips by mode'), modeBars(travelRows)]),
          el('section', { class: 'tw-card' }, [
            txt('h3', null, trend.title),
            dayChart(series(run, 'baseline', trend.id), series(run, 'intervention', trend.id), trend.fmt, m.start),
            txt('p', 'tw-note', 'Both lines match until the policy starts, because the people and seed are the same.'),
          ]),
        ]),
      ]),
      el('div', { class: 'tw-grid tw-grid--even' }, [
        el('section', { class: 'tw-card' }, [
          txt('h3', null, 'What this run cannot tell you'),
          el('ul', { class: 'tw-limits' }, limits.map((item) => el('li', {}, [txt('strong', null, LIMIT_LABEL[item.id] || item.id.replace(/_/g, ' ')), item.reason ? txt('span', null, item.reason) : null]))),
        ]),
        el('section', { class: 'tw-card' }, [
          txt('h3', null, 'Measure before acting'),
          el('ol', { class: 'tw-measure' }, (MEASURE[m.kind] || MEASURE.compiled).map((line) => txt('li', null, line))),
        ]),
      ]),
      el('details', { class: 'tw-card tw-method' }, [
        el('summary', {}, ['Method, assumptions and sources']),
        txt('p', null, CONTEXT[m.kind] || CONTEXT.compiled),
        txt('p', null, `Seed ${run.seed}. The policy starts on day ${m.start} of ${run.scenario.ticks}. Evidence tier: ${String(run.evidence_tier || 'assumption-driven').replace(/_/g, ' ')}.`),
        assumptions.length ? el('ul', {}, assumptions.map((item) => txt('li', null, typeof item.value === 'boolean'
          ? `${ASSUMPTION_LABEL[item.id] || item.id.replace(/_/g, ' ')}: ${item.value ? 'on' : 'off'}. ${item.note || ''}`
          : `${ASSUMPTION_LABEL[item.id] || item.id.replace(/_/g, ' ')}: ${item.value} (declared test range ${item.low}–${item.high}, not a confidence interval). ${item.note || ''}`))) : null,
        txt('p', null, LITERATURE[m.kind] || LITERATURE.compiled),
      ]),
    );
    box.hidden = false;
  }

  // A question with no mapped lever has no run: no 3D street and no figures, only the agents and this card.
  function renderSpeculative(scenario) {
    const reason = String(scenario.summary || '').split(' The compiler kept')[0].trim();
    box.replaceChildren(
      el('header', { class: 'tw-head' }, [
        txt('p', 'tw-eyebrow', 'Not simulated'),
        txt('h2', null, scenario.title || 'This question'),
        txt('p', 'tw-lede', 'Two Worlds simulates a question when it maps to something the Bloor St W world can change: the adult fare, Line 2 frequency, the cycle track, car lanes, parking or signal timing. This one does not, so there is no 3D street and no simulated figures. The 100 persona agents still rate it; their answers are synthetic opinions, not measured effects.'),
      ]),
      el('div', { class: 'tw-grid tw-grid--even' }, [
        el('section', { class: 'tw-card' }, [
          txt('h3', null, 'Why it was not run'),
          txt('p', 'tw-measure-text', reason || 'No mapped Bathurst–Spadina lever directly represents this question.'),
          scenario.compilerBadge ? txt('p', 'tw-note', `Read by: ${scenario.compilerBadge}.`) : null,
        ]),
        el('section', { class: 'tw-card' }, [
          txt('h3', null, 'What a simulation would need'),
          el('ol', { class: 'tw-measure' }, [
            txt('li', null, 'A lever the world can change, with a before and an after value.'),
            txt('li', null, 'A mechanism linking that change to people’s choices, with evidence for its size.'),
            txt('li', null, 'The residents, firms and places it reaches, mapped into the world.'),
          ]),
        ]),
      ]),
    );
    box.hidden = false;
  }

  window.addEventListener('counterfactual:result', (event) => render(event.detail));
  if (window.CounterfactualCurrentRun) render(window.CounterfactualCurrentRun);
  new MutationObserver(() => {
    const { phase, scenario } = document.body.dataset;
    if (phase !== 'lab' || scenario !== 'custom') return;
    const now = window.counterfactualPreview?.current?.();
    if (now && now.id === 'custom' && !now.run) renderSpeculative(now);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-phase', 'data-scenario'] });
})();
