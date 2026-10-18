/* Two Worlds demo view.
 * 1. The 100-agent panel sits right after the prompt, above the 3D view.
 * 2. The policy impact assessment sits under the 3D view. Every figure is reduced from the committed
 *    events of the current experiment.v2 run. The sensitivity table reruns the same people, spec and
 *    seed in this browser with each declared assumption at its low and high value. */
(function () {
  'use strict';

  // Held, not looked up: app.js finds the panel by id, so it must never be left detached when the brief is rebuilt.
  let panel = null;
  const agentPanel = () => (panel ||= document.getElementById('agentPoll'));
  function place() {
    const poll = agentPanel(), intro = document.getElementById('intro');
    if (poll && intro && intro.nextElementSibling !== poll) intro.after(poll);
  }
  place();
  document.addEventListener('DOMContentLoaded', () => place());
  // A question with no run shows the panel inside its report instead (renderSpeculative).
  function adopt(slot) {
    const poll = agentPanel();
    if (poll && poll.parentNode !== slot) slot.append(poll);
  }

  const box = document.createElement('section');
  box.className = 'tw-brief';
  box.hidden = true;
  box.setAttribute('aria-label', 'Policy impact assessment');
  const layout = document.querySelector('#lab .lab-layout');
  if (layout) layout.after(box);

  // Short-run fare elasticities from papers.md (F03, F06). A benchmark for the simulated response; never applied to the TTC.
  const FARE_ELASTICITY = { mild: -0.23, strong: -0.57 };
  const FARE_SOURCES = [
    { label: 'Davis (2021), subway fare changes in three Mexican cities: −0.23 to −0.32', url: 'https://www.nber.org/papers/w28244' },
    { label: 'Guzman, Gomez and Moncada (2020), Bogotá BRT: −0.41 (one month) to −0.57 (one week)', url: 'https://doi.org/10.1007/s11116-019-10034-6' },
  ];
  const HURON_COUNTER_PER_DAY = 3524;

  const CONTEXT = {
    fare: 'Observed: adult PRESTO fare $3.30 and Fair Pass $2.10 (citywide TTC rules); streets, crosswalks, signal locations, the Line 2 schedule, building footprints and the six focal shops (OpenStreetMap). Synthetic: every person, routine, preference, budget and basket, and the shop staffing rule. Signal timings are assumed.',
    bike: 'Observed: streets, crosswalks, signal locations, the Line 2 schedule, building footprints and the six focal shops (OpenStreetMap). Context only: the 2025 Bloor counter west of Huron recorded 3,524 cyclist passages a day. Synthetic: every person, routine, preference, budget and basket, and the shop staffing rule. Signal timings are assumed.',
    compiled: 'Observed: streets, crosswalks, signal locations, the Line 2 schedule, building footprints and the six focal shops (OpenStreetMap). Synthetic: every person, routine, preference, budget and basket, and the shop staffing rule. Signal timings are assumed.',
  };
  const LITERATURE = {
    fare: 'Fare studies report ridership, receipts from fares actually paid, and differences by fare product and income (Guzman, Gomez and Moncada 2020; Hickey 2005; Kholodov et al. 2021; Morrissey and Oke 2022). Free-fare experiments found no clear effect on shops (Studenmund and Connor 1982). No Toronto elasticity is applied; published values are used only as a benchmark.',
    bike: 'Cycle-track studies report route and mode shift, vehicle time, customer arrivals and retail sales, with results from gains to losses (Smith Lea et al. 2017/2019; Volker and Handy 2021; Stantec 2011). They describe installations; none is reversed into a removal effect.',
    compiled: 'The run applies only the mapped rules for this lever. No published response for it is applied.',
  };
  const NEEDED = {
    fare: [
      'Toronto fare response by fare product and trip purpose, from PRESTO taps, before sizing ridership or receipts.',
      'Transactions at the focal shops, before a change in receipts is read as a retail effect.',
      'Survey weights for the Bathurst–Spadina population, before any figure is scaled beyond these people.',
    ],
    bike: [
      'Origin–destination cycling counts for this block, kept separate from the Huron counter.',
      'A removal design, signal plan and cost for this segment. The City multi-corridor estimate does not apply.',
      'Shop transactions and a conflict model, before any retail or safety claim.',
    ],
    compiled: [
      'A measured Toronto response to this lever. The run applies only the mapped rules.',
      'Survey weights, shop transactions and an exposure model, as for the prepared cases.',
    ],
  };
  const LIMIT_LABEL = {
    citywide_ttc_revenue_cad: 'Citywide TTC revenue',
    business_closures: 'Business closures',
    injuries: 'Injuries',
    emissions_kg: 'Emissions',
    gdp_cad: 'GDP',
    driver_time_beyond_section: 'Driver time beyond the section',
    removal_construction_cost_cad: 'Removal construction cost',
  };
  const ASSUMPTION_LABEL = {
    cost_weight: 'Price sensitivity (cost weight)',
    unprotected_cycling_discomfort_per_km: 'Mixed-traffic cycling discomfort',
    shop_staffing_response: 'Shop staffing rule',
  };
  const ASSUMPTION_SHORT = { cost_weight: 'Price sensitivity', unprotected_cycling_discomfort_per_km: 'Cycling discomfort', shop_staffing_response: 'Shop staffing rule' };
  const CHOICE = {
    transit: 'Line 2', bike_bloor: 'Cycle on Bloor', bike_side_street: 'Cycle on a side street', drive: 'Drive', walk: 'Walk',
    shop_elsewhere: 'Shop outside the section', defer: 'Forgo the trip',
  };
  const CHOICE_TO = {
    transit: 'Line 2', bike_bloor: 'cycling on Bloor', bike_side_street: 'cycling on side streets', drive: 'driving', walk: 'walking',
    shop_elsewhere: 'shops outside the section', defer: 'forgoing the trip',
  };
  const choiceTo = (action) => CHOICE_TO[action] || action.replace(/_/g, ' ');
  const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) && !/^(Line \d|Bloor|Fair Pass)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const MODE_KEY = { transit: 'transit', bike: 'bike', walk: 'walk', car: 'car' };

  // ---------- formatting ----------
  const MINUS = '\u2212';
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const plain = (n, digits = 0) => Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const neg = (n, body) => (n < 0 ? MINUS : '') + body;
  const minSec = (n) => {
    const s = Math.round(Math.abs(n) * 60), mm = Math.floor(s / 60), ss = s % 60;
    return mm ? `${mm} min${ss ? ` ${ss} s` : ''}` : `${ss} s`;
  };
  const FMT = {
    cad: { v: (n) => neg(n, '$' + plain(n, 2)), eps: 0.005 },
    n: { v: (n) => neg(n, plain(n, Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1)), eps: 0.05 },
    m: { v: (n) => neg(n, plain(n) + ' m'), eps: 0.5 },
    min: { v: (n) => neg(n, Math.abs(n) < 10 ? minSec(n) : plain(n, 1) + ' min'), eps: 0.01, d: (d) => (Math.abs(d) < 1 ? neg(d, plain(d * 60) + ' s') : neg(d, plain(d, 1) + ' min')) },
    pmin: { v: (n) => neg(n, plain(n) + ' min'), eps: 0.5 },
  };
  const isZero = (d, f) => Math.abs(d) < FMT[f].eps;
  const show = (n, f) => (n == null ? '—' : FMT[f].v(n));
  function delta(d, f) {
    if (d == null) return '—';
    if (isZero(d, f)) return '0';
    const body = (FMT[f].d || FMT[f].v)(d);
    return d > 0 ? '+' + body : body;
  }
  function pct(b, n) {
    if (b == null || n == null) return '—';
    if (Math.abs(b) < 1e-9) return Math.abs(n) < 1e-9 ? '—' : 'new';
    const p = ((n - b) / Math.abs(b)) * 100;
    if (Math.abs(p) < 0.05) return '0%';
    return (p > 0 ? '+' : MINUS) + plain(p, 1) + '%';
  }
  const signedPct = (p) => (Math.abs(p) < 0.05 ? '0%' : (p > 0 ? '+' : MINUS) + plain(p, 1) + '%');
  const elastic = (e) => neg(e, plain(e, 2));
  const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const plural = (n, one, many = one + 's') => `${plain(n)} ${Math.abs(n) === 1 ? one : many}`;

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
  const chip = (state, label) => (label ? txt('span', `tw-chip is-${state}`, label) : null);
  const card = (title, kids, extra = '') => el('section', { class: `tw-card ${extra}`.trim() }, [txt('h3', null, title), ...kids]);
  const scroll = (table) => el('div', { class: 'tw-scroll' }, [table]);
  const link = (source) => (/^https?:/.test(source.url || '') ? el('a', { href: source.url, target: '_blank', rel: 'noopener' }, [source.label]) : source.label);

  // ---------- reading the run: every figure below comes from committed events in the policy period ----------
  function kindOf(run) {
    const base = run.scenario.levers?.baseline || {};
    const next = run.scenario.levers?.intervention || {};
    if (next.bloor_cycle_track && next.bloor_cycle_track !== (base.bloor_cycle_track || 'protected')) return 'bike';
    if (Number(next.adult_fare_cad) !== Number(base.adult_fare_cad)) return 'fare';
    return 'compiled';
  }

  function reduce(run, arm) {
    const start = run.scenario.policy_start;
    const r = {
      trips: 0, transit: 0, bike: 0, bloorBike: 0, walk: 0, car: 0, deferred: 0, elsewhere: 0,
      receipts: 0, rides: 0, adultRides: 0, fairRides: 0, adultPaid: 0, fairPaid: 0, otherCost: 0, minutes: 0,
      sales: 0, visits: 0, shortDays: 0, sharedM: 0, carLegs: 0, carMin: 0, bloorLegs: 0, bloorMin: 0, person: {},
    };
    const who = (id) => (r.person[id] ||= { rides: 0, cost: 0, minutes: 0, lost: 0 });
    const onBloor = new Set(), cycled = [];
    for (const e of run.runs[arm].events) {
      if (e.tick < start) continue;
      const amount = Number(e.amount_cad) || 0;
      if (e.action === 'travel') {
        const legMin = (e.arrive_t - e.depart_t) / 60;
        if (e.mode === 'bike' && e.uses_bloor) {
          onBloor.add(`${e.tick}|${e.actor}|${e.trip_id}`);
          r.bloorLegs++; r.bloorMin += legMin; r.sharedM += Number(e.shared_with_cars_m) || 0;
        }
        if (e.mode === 'car') { r.carLegs++; r.carMin += legMin; }
      } else if (e.action === 'trip_completed') {
        r.trips++;
        if (MODE_KEY[e.mode]) r[MODE_KEY[e.mode]]++;
        if (e.mode === 'bike') cycled.push(`${e.tick}|${e.actor}|${e.trip_id}`);
        const minutes = Number(e.total_minutes) || 0;
        r.minutes += minutes; who(e.actor).minutes += minutes;
        if (e.purpose === 'errand' && e.destination === 'offmap') { r.elsewhere++; who(e.actor).lost++; }
      } else if (e.action === 'defer_trip') {
        r.deferred++; who(e.actor).lost++;
      } else if (e.action === 'pay_fare') {
        r.receipts += amount; r.rides++; who(e.actor).rides++; who(e.actor).cost += amount;
        if (e.fare_product === 'fair_pass') { r.fairRides++; r.fairPaid += amount; } else { r.adultRides++; r.adultPaid += amount; }
      } else if (e.action === 'pay_travel_cost') {
        r.otherCost += amount; who(e.actor).cost += amount;
      } else if (e.action === 'purchase') r.sales += amount;
      else if (e.action === 'enter_business') r.visits++;
      else if (e.action === 'set_shop_hours' && e.reduced) r.shortDays++;
    }
    r.bloorBike = cycled.filter((key) => onBloor.has(key)).length;
    for (const key of ['receipts', 'adultPaid', 'fairPaid', 'otherCost', 'sales']) r[key] = r2(r[key]);
    return r;
  }

  const measure = (run) => ({
    base: reduce(run, 'baseline'),
    next: reduce(run, 'intervention'),
    changed: run.changed_decisions.filter((change) => change.tick >= run.scenario.policy_start),
  });

  // Indicators. `get` reads one reduced arm; `f` picks the unit format.
  const IND = {
    receipts: { label: 'TTC fare receipts', get: (r) => r.receipts, f: 'cad', sub: 'Equals rider fare payments: a transfer from households' },
    rides: { label: 'Paid Line 2 rides', get: (r) => r.rides, f: 'n' },
    perRide: { label: 'Average receipt per paid ride', get: (r) => (r.rides ? r.receipts / r.rides : null), f: 'cad', sub: 'Mix of adult and Fair Pass rides' },
    adultRides: { label: 'Adult-fare Line 2 rides', get: (r) => r.adultRides, f: 'n', sub: (m) => plural(m.adultN, 'person', 'people') },
    fairRides: { label: 'Fair Pass Line 2 rides', get: (r) => r.fairRides, f: 'n', sub: (m) => `${plural(m.fairN, 'person', 'people')}; low-income discount` },
    adultPaid: { label: 'Fares paid, adult', get: (r) => r.adultPaid, f: 'cad' },
    fairPaid: { label: 'Fares paid, Fair Pass', get: (r) => r.fairPaid, f: 'cad' },
    cost: { label: 'Out-of-pocket travel cost', get: (r) => r2(r.receipts + r.otherCost), f: 'cad', sub: 'Fares plus parking and vehicle costs' },
    minutes: { label: 'Total travel time', get: (r) => r.minutes, f: 'pmin', sub: 'Person-minutes, including fixed off-map minutes' },
    trips: { label: 'Trips completed', get: (r) => r.trips, f: 'n' },
    transit: { label: 'Line 2 trips', get: (r) => r.transit, f: 'n' },
    bike: { label: 'Cycling trips, all streets', get: (r) => r.bike, f: 'n' },
    walk: { label: 'Walking trips', get: (r) => r.walk, f: 'n' },
    car: { label: 'Car trips', get: (r) => r.car, f: 'n' },
    elsewhere: { label: 'Errands moved outside the section', get: (r) => r.elsewhere, f: 'n', sub: 'Planned Bloor shop trips done elsewhere' },
    deferred: { label: 'Trips forgone', get: (r) => r.deferred, f: 'n', sub: 'Scheduled trips not made' },
    bloorBike: { label: 'Cycling trips using Bloor', get: (r) => r.bloorBike, f: 'n' },
    sideBike: { label: 'Cycling trips avoiding Bloor', get: (r) => r.bike - r.bloorBike, f: 'n' },
    sharedM: { label: 'Cycling in mixed traffic on Bloor', get: (r) => r.sharedM, f: 'm', sub: 'Exposure, not injuries' },
    bloorMean: { label: 'Time per Bloor cycling leg', get: (r) => (r.bloorLegs ? r.bloorMin / r.bloorLegs : null), f: 'min', sub: (m) => `Mean, inside the ${m.length} m` },
    carMean: { label: 'Time per car leg', get: (r) => (r.carLegs ? r.carMin / r.carLegs : null), f: 'min', sub: (m) => `Mean, inside the ${m.length} m` },
    carMin: { label: 'Driver time, all car legs', get: (r) => r.carMin, f: 'pmin', sub: (m) => `Inside the ${m.length} m only` },
    sales: { label: 'Focal shop receipts', get: (r) => r.sales, f: 'cad', sub: 'Synthetic basket values' },
    visits: { label: 'Customer visits', get: (r) => r.visits, f: 'n' },
    shortDays: { label: 'Shop-days on shortened hours', get: (r) => r.shortDays, f: 'n', sub: '18:00 close after a day below the receipt floor; not a closure' },
  };
  const SHORT = {
    adultRides: 'Adult rides', receipts: 'TTC receipts', sales: 'Shop receipts', elsewhere: 'Errands elsewhere', bloorBike: 'Bloor cycling trips',
    sharedM: 'Mixed-traffic cycling', carMean: 'Car-leg time', bloorMean: 'Bloor cycling-leg time', transit: 'Line 2 trips', bike: 'Cycling trips',
    car: 'Car trips', walk: 'Walking trips', deferred: 'Trips forgone',
  };
  const ALWAYS = new Set(['trips', 'deferred', 'receipts', 'sales']);
  const SECTIONS = {
    ttc: { title: () => 'Public budget · TTC', rows: ['receipts', 'rides', 'perRide'] },
    riders: { title: (m) => `Transit riders · ${m.adultN} adult fare, ${m.fairN} Fair Pass`, rows: ['adultRides', 'fairRides', 'adultPaid', 'fairPaid'] },
    households: { title: (m) => `Households · all ${m.people} people`, rows: ['cost', 'minutes', 'deferred', 'elsewhere'] },
    travel: { title: () => 'Trips by mode', rows: ['trips', 'transit', 'bike', 'walk', 'car'] },
    cyclists: { title: () => 'Cyclists', rows: ['bloorBike', 'sideBike', 'sharedM', 'bloorMean'] },
    drivers: { title: () => 'Drivers', rows: ['carMean', 'carMin'] },
    shops: { title: (m) => `Local businesses · ${m.shopCount} focal shops`, rows: ['sales', 'visits', 'shortDays'] },
  };
  const ORDER = {
    fare: ['ttc', 'riders', 'households', 'travel', 'shops', 'cyclists', 'drivers'],
    bike: ['cyclists', 'drivers', 'travel', 'households', 'shops', 'ttc', 'riders'],
    compiled: ['travel', 'households', 'ttc', 'riders', 'cyclists', 'drivers', 'shops'],
  };
  const KEY = { fare: ['adultRides', 'receipts', 'sales', 'elsewhere'], bike: ['bloorBike', 'sharedM', 'carMean', 'sales', 'receipts'] };
  const TILES = { fare: ['receipts', 'adultRides', 'sales'], bike: ['bloorBike', 'sharedM', 'carMean', 'sales'] };

  const deltaOf = (x, id) => {
    const b = IND[id].get(x.base), n = IND[id].get(x.next);
    return b == null || n == null ? null : n - b;
  };
  const noEffect = (x) => !x.changed.length && Object.keys(IND).every((id) => { const d = deltaOf(x, id); return d == null || isZero(d, IND[id].f); });
  function compiledKeys(m) {
    const ids = ['transit', 'bike', 'bloorBike', 'car', 'walk', 'elsewhere', 'deferred', 'receipts', 'sales', 'minutes', 'cost', 'carMean', 'bloorMean', 'sharedM'];
    const weight = (id) => {
      const b = IND[id].get(m.base), d = deltaOf(m, id);
      if (d == null || isZero(d, IND[id].f)) return 0;
      return Math.abs(b) < 1e-9 ? Infinity : Math.abs(d / b);
    };
    const moved = ids.filter((id) => weight(id) > 0).sort((a, b) => weight(b) - weight(a));
    return [...new Set([...moved, 'transit', 'receipts', 'sales', 'car'])].slice(0, 4);
  }

  function model(run) {
    const kind = kindOf(run);
    const people = run.personas || [];
    const m = {
      run, kind, ...measure(run),
      start: run.scenario.policy_start, ticks: run.scenario.ticks, days: run.scenario.ticks - run.scenario.policy_start + 1,
      people: people.length, adultN: people.filter((p) => p.fare_category !== 'fair_pass').length, fairN: people.filter((p) => p.fare_category === 'fair_pass').length,
      residents: run.population?.residents ?? people.filter((p) => p.home?.kind === 'mapped').length,
      shopCount: (run.places?.shops || []).length || 6,
      length: Math.round(run.world?.section_length_m || 619),
      fare: { base: Number(run.scenario.levers?.baseline?.adult_fare_cad), next: Number(run.scenario.levers?.intervention?.adult_fare_cad) },
    };
    m.visitors = m.people - m.residents;
    m.changedPeople = new Set(m.changed.map((change) => change.actor)).size;
    m.key = KEY[kind] || compiledKeys(m);
    m.bench = fareBench(m);
    return m;
  }

  // Arc (midpoint) elasticity of adult paid rides to the adult fare, and the published range for comparison.
  function fareBench(m) {
    const p0 = m.fare.base, p1 = m.fare.next, q0 = m.base.adultRides, q1 = m.next.adultRides;
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || p0 === p1 || !q0) return null;
    const half = (p1 - p0) / (p1 + p0);
    const arc = (a, b) => ((b - a) / (b + a)) / half;
    const at = (e) => ((1 + e * half) / (1 - e * half) - 1) * 100;
    const e = arc(q0, q1);
    const lo = FARE_ELASTICITY.strong, hi = FARE_ELASTICITY.mild;
    return {
      p0, p1, q0, q1, e,
      farePct: ((p1 - p0) / p0) * 100, ridePct: ((q1 - q0) / q0) * 100,
      published: [at(hi), at(lo)],
      breakeven: p1 > 0 ? (p0 / p1 - 1) * 100 : null,
      oneRide: { pct: 100 / q0, e: arc(q0, q0 + Math.sign(p0 - p1)) },
      position: e < lo - 1e-9 ? 'stronger' : e > hi + 1e-9 ? 'weaker' : 'inside',
    };
  }

  // ---------- sensitivity: same people, spec and seed, one assumption at a time ----------
  const SENS = new WeakMap();
  let current = null;
  function variantsOf(run) {
    return (run.assumptions || []).filter((a) => a.kind === 'sensitivity').flatMap((a) => {
      const now = run.assumption_values?.[a.id] ?? a.value;
      const values = typeof a.value === 'boolean' ? [!now] : [a.low, a.high].filter((v) => Number.isFinite(v) && v !== now);
      return values.map((value) => ({ id: a.id, value, now, end: typeof a.value === 'boolean' ? null : value === a.low ? 'low' : 'high' }));
    });
  }
  function sameAs(a, b) {
    if (a.changed.length !== b.changed.length) return false;
    return Object.values(IND).every((ind) => ['base', 'next'].every((arm) => {
      const x = ind.get(a[arm]), y = ind.get(b[arm]);
      return x == null || y == null ? x === y : Math.abs(x - y) < 1e-6;
    }));
  }
  function startSensitivity() {
    const run = current;
    if (!run || SENS.has(run)) return;
    const state = { status: 'running', total: variantsOf(run).length };
    SENS.set(run, state);
    const hook = window.counterfactualPreview?.variant;
    if (!hook) { state.status = 'error'; state.error = 'the in-browser engine is not loaded'; render(run); return; }
    render(run);
    (async () => {
      try {
        const own = run.assumption_overrides || {};
        const yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 30));
        const base = measure(run);
        await yieldFrame();
        state.replayOk = sameAs(measure(await hook(run, own)), base);
        const done = [];
        for (const v of variantsOf(run)) {
          await yieldFrame();
          done.push({ ...v, m: measure(await hook(run, { ...own, [v.id]: v.value })) });
        }
        state.used = done.filter((v) => !sameAs(v.m, base));
        state.inert = done.filter((v) => sameAs(v.m, base));
        state.status = 'done';
      } catch (error) {
        state.status = 'error';
        state.error = String(error?.message || error);
      }
      if (run === current) render(run);
    })();
  }

  // Sign stability of one indicator's change across the base case and every variant that moved any figure.
  function spread(m, sens, id) {
    const f = IND[id].f, d0 = deltaOf(m, id);
    if (d0 == null) return null;
    if (sens.status !== 'done') return { d0, state: sens.status === 'error' ? 'info' : 'pending', label: sens.status === 'error' ? 'Not tested' : 'Testing…' };
    const ds = [d0, ...sens.used.map((v) => deltaOf(v.m, id)).filter((d) => d != null)];
    const sg = (d) => (isZero(d, f) ? 0 : Math.sign(d));
    const s0 = sg(d0), others = ds.slice(1).map(sg), n = ds.length;
    const out = { d0, min: Math.min(...ds), max: Math.max(...ds), n };
    if (s0 === 0 && others.every((s) => s === 0)) return { ...out, state: 'none', label: 'No effect' };
    const flips = others.filter((s) => s !== 0 && s === -s0).length;
    if (s0 !== 0 && flips) return { ...out, state: 'reverses', label: `Reverses in ${flips} of ${n} runs` };
    const off = others.filter((s) => s !== s0).length;
    if (off) return { ...out, state: 'sensitive', label: s0 === 0 ? `Non-zero in ${off} of ${n} runs` : `Zero in ${off} of ${n} runs` };
    return { ...out, state: 'holds', label: `Holds in ${n} of ${n} runs` };
  }

  // ---------- derived tables ----------
  function diversion(m) {
    const events = new Map(m.run.runs.intervention.events.map((e) => [e.id, e]));
    const rows = new Map();
    for (const change of m.changed) {
      const from = change.baseline.action, to = change.intervention.action;
      const caused = events.get(change.intervention_event_id)?.caused_by || [];
      const knock = caused.some((id) => events.get(id)?.action === 'set_shop_hours');
      const key = `${from}|${to}|${knock}`;
      const row = rows.get(key) || { from, to, knock, trips: 0, people: new Set() };
      row.trips++; row.people.add(change.actor);
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.trips - a.trips || a.from.localeCompare(b.from));
  }

  const GROUPS = [
    { label: 'All people', test: () => true },
    { label: 'Adult fare', test: (p) => p.fare_category !== 'fair_pass', band: 'Fare product' },
    { label: 'Fair Pass', sub: 'low-income discount', test: (p) => p.fare_category === 'fair_pass' },
    { label: 'Car available', test: (p) => p.has_car, band: 'Vehicle access' },
    { label: 'Bike, no car', test: (p) => p.has_bike && !p.has_car },
    { label: 'No car or bike', test: (p) => !p.has_bike && !p.has_car },
    { label: 'Residents', sub: 'homes on mapped streets', test: (p) => p.home?.kind === 'mapped', band: 'Home' },
    { label: 'Visitors', sub: 'enter to shop', test: (p) => p.home?.kind !== 'mapped' },
  ];
  function incidence(m) {
    const changedBy = new Set(m.changed.map((change) => change.actor));
    const sumOf = (arm, ids, key) => ids.reduce((s, id) => s + (m[arm].person[id]?.[key] || 0), 0);
    return GROUPS.map((g) => {
      const ids = (m.run.personas || []).filter(g.test).map((p) => p.id);
      const per = ids.length * m.days;
      const d = (key) => sumOf('next', ids, key) - sumOf('base', ids, key);
      return {
        ...g, n: ids.length, changed: ids.filter((id) => changedBy.has(id)).length,
        rides: d('rides'), cost: per ? d('cost') / per : 0, minutes: per ? d('minutes') / per : 0, lost: d('lost'),
      };
    }).filter((g) => g.n > 0);
  }

  function checks(m, sens) {
    const run = m.run, arms = ['baseline', 'intervention'], out = [];
    if (m.start > 1) {
      const ids = (run.metric_definitions || []).map((d) => d.id);
      const pre = (arm) => run.runs[arm].metrics.by_tick.filter((row) => row.tick < m.start);
      const a = pre('baseline'), b = pre('intervention');
      const ok = a.length === b.length && a.every((row, i) => ids.every((id) => Math.abs((Number(row[id]) || 0) - (Number(b[i][id]) || 0)) < 1e-9));
      out.push({ state: ok ? 'pass' : 'fail', title: 'Paired design', text: ok
        ? `Before the change (day${m.start > 2 ? `s 1–${m.start - 1}` : ' 1'}), all ${ids.length} metrics are identical in both arms.`
        : 'The arms differ before the change, so the comparison is not paired.' });
    }
    const gm = arms.map((arm) => run.runs[arm].game_master || {});
    const accepted = gm.reduce((s, g) => s + (g.accepted_moves || 0), 0), rejected = gm.reduce((s, g) => s + (g.rejected_actions || 0), 0);
    out.push({ state: rejected ? 'fail' : 'pass', title: 'Movement rules', text: `${plain(accepted)} moves checked by the mapped sandbox (signals, crosswalks, scheduled trains); ${plain(rejected)} rejected.` });
    const ledger = arms.every((arm) => run.runs[arm].metrics.by_tick.every((row) => Math.abs((row.household_fare_spend_cad || 0) - (row.fare_revenue_cad || 0)) < 0.005));
    out.push({ state: ledger ? 'pass' : 'fail', title: 'Fare ledger', text: ledger ? 'Rider fare payments equal TTC receipts on every day, in both arms.' : 'Rider fare payments and TTC receipts differ.' });
    const tally = arms.map((arm) => {
      const events = run.runs[arm].events;
      return [events.filter((e) => e.action === 'choose_trip').length, events.filter((e) => e.action === 'trip_completed' || e.action === 'defer_trip').length];
    });
    const counted = tally.every(([chosen, closed]) => chosen === closed);
    out.push({ state: counted ? 'pass' : 'fail', title: 'Trip accounting', text: counted ? `${plain(tally[0][0])} scheduled trips per arm; each is completed or recorded as forgone.` : 'Some scheduled trips have no recorded outcome.' });
    out.push(sens.status === 'done'
      ? { state: sens.replayOk ? 'pass' : 'fail', title: 'Same-seed replay', text: sens.replayOk ? 'A fresh run in this browser reproduces every figure on this page.' : 'A fresh run in this browser does not reproduce the reported figures; the sensitivity table may not describe this run.' }
      : sens.status === 'error'
        ? { state: 'info', title: 'Same-seed replay', text: `Not run: ${sens.error}.` }
        : { state: 'pending', title: 'Same-seed replay', text: 'Runs with the sensitivity analysis.' });
    const decisions = run.runs.intervention.decisions || [];
    const rule = decisions.filter((d) => d.provider === 'fixture_rule').length;
    out.push({ state: 'info', title: 'Decision model', text: rule === decisions.length
      ? `All ${plain(decisions.length)} trip choices per arm come from the profile-conditioned choice rule over sandbox-checked options. The persona-agent ratings above are a separate survey.`
      : `${plain(decisions.length - rule)} of ${plain(decisions.length)} trip choices per arm come from persona agents; ${plain(rule)} from the profile-conditioned rule.` });
    if (m.bench) {
      const b = m.bench;
      out.push({ state: b.position === 'inside' ? 'pass' : 'warn', title: 'Evidence benchmark', text: b.position === 'inside'
        ? `Implied fare elasticity ${elastic(b.e)} is within published short-run estimates (${elastic(FARE_ELASTICITY.mild)} to ${elastic(FARE_ELASTICITY.strong)}).`
        : `Implied fare elasticity ${elastic(b.e)} is ${b.position} than published short-run estimates (${elastic(FARE_ELASTICITY.mild)} to ${elastic(FARE_ELASTICITY.strong)}).` });
    }
    return out;
  }

  // ---------- building blocks ----------
  // The change across runs on a scale that always includes zero: the bar runs from the smallest to the
  // largest change, the white dot is the base case, the tick marked 0 is no change, and the bar takes
  // the Robustness colour (mint holds, yellow touches zero, orange reverses).
  function rangeCell(s, f) {
    if (!s || s.min == null) return txt('span', 'tw-range-text is-quiet', s?.state === 'pending' ? 'Testing…' : '—');
    if (isZero(s.min, f) && isZero(s.max, f)) return txt('span', 'tw-range-text is-quiet', 'No change in any run');
    const lo = Math.min(0, s.min), hi = Math.max(0, s.max), span = hi - lo || 1;
    const x = (v) => (4 + (92 * (v - lo)) / span).toFixed(1);
    const words = isZero(s.max - s.min, f) ? delta(s.min, f) : `${delta(s.min, f)} to ${delta(s.max, f)}`;
    const plot = el('span', { class: 'tw-range-plot', 'aria-hidden': 'true' }, [
      el('span', { class: 'tw-range-zero', style: `left:${x(0)}%` }, [txt('em', null, '0')]),
      el('b', { style: `left:${x(s.min)}%;width:${Math.max(2, x(s.max) - x(s.min))}%` }),
      el('i', { style: `left:${x(s.d0)}%` }),
    ]);
    return el('span', { class: `tw-range is-${s.state}` }, [txt('span', 'tw-range-text', words), plot]);
  }
  function rangeLegend(runs) {
    const key = (cls, text) => el('span', {}, [el('span', { class: cls, 'aria-hidden': 'true' }), text]);
    return el('p', { class: 'tw-range-legend' }, [
      txt('strong', null, 'Change across all runs: '),
      key('tw-key-bar', `lowest to highest change over ${runs ? plural(runs, 'run') : 'the runs'}`),
      key('tw-key-dot', 'base case'),
      key('tw-key-zero', '0 = no change'),
      key('tw-key-bar is-holds', 'same direction every run'),
      key('tw-key-bar is-sensitive', 'sometimes zero'),
      key('tw-key-bar is-reverses', 'direction flips'),
    ]);
  }

  function header(m) {
    const levers = policyLines(m);
    const days = m.start === m.ticks ? `day ${m.start}` : `days ${m.start}–${m.ticks}`;
    const cell = (label, value, note) => el('div', {}, [txt('dt', null, label), el('dd', {}, [value, note ? txt('small', null, note) : null])]);
    return el('header', { class: 'tw-head' }, [
      txt('p', 'tw-eyebrow', 'Policy impact assessment · simulated'),
      txt('h2', null, m.run.scenario.question || 'Policy change'),
      el('dl', { class: 'tw-scope' }, [
        cell('Policy change', levers.join('; ') || 'Compiled change', `From day ${m.start}`),
        cell('Study area', `Bloor St W, Bathurst to Spadina`, `${m.length} m mapped section`),
        cell('Population', `${m.people} synthetic people`, `${m.residents} residents, ${m.visitors} visitors; not representative`),
      ]),
    ]);
  }
  function policyLines(m) {
    const b = m.run.scenario.levers?.baseline || {}, n = m.run.scenario.levers?.intervention || {};
    const defaults = window.BloorSandbox?.DEFAULT_POLICY || {};
    const onOff = (v) => (v ? 'on' : 'off');
    const text = {
      adult_fare_cad: (x, y) => `Adult fare ${show(x, 'cad')} → ${show(y, 'cad')} (${pct(x, y)})${m.fairN ? '; Fair Pass unchanged' : ''}`,
      bloor_cycle_track: (x, y) => (y === 'none' ? 'Protected cycle track removed' : `Cycle track ${x || 'protected'} → ${y}`),
      line2_headway_multiplier: (x, y) => `Line 2 headway ×${x ?? 1} → ×${y}`,
      bloor_car_lanes_per_direction: (x, y) => `Car lanes per direction ${x} → ${y}`,
      on_street_parking: (x, y) => `On-street parking ${onOff(x)} → ${onOff(y)}`,
      signal_cycle_s: (x, y) => `Signal cycle ${x} s → ${y} s`,
      bloor_green_share: (x, y) => `Bloor green share ${x} → ${y}`,
    };
    return Object.keys(n).filter((key) => JSON.stringify(b[key] ?? defaults[key]) !== JSON.stringify(n[key]))
      .map((key) => (text[key] ? text[key](b[key] ?? defaults[key], n[key]) : `${key.replace(/_/g, ' ')} ${b[key] ?? defaults[key] ?? 'default'} → ${n[key]}`));
  }

  function tile(m, sens, id) {
    const ind = IND[id], b = ind.get(m.base), n = ind.get(m.next), s = spread(m, sens, id);
    return el('article', { class: 'tw-kpi' }, [
      txt('span', 'tw-kpi-label', ind.label),
      el('p', { class: 'tw-kpi-value' }, [txt('span', 'is-before', show(b, ind.f)), txt('span', 'tw-arrow', '→'), txt('span', 'is-after', show(n, ind.f))]),
      txt('p', 'tw-kpi-change', `${delta(n == null || b == null ? null : n - b, ind.f)} (${pct(b, n)})`),
      el('p', { class: 'tw-kpi-foot' }, [s ? chip(s.state, s.label) : null]),
    ]);
  }
  function elasticityTile(m) {
    const b = m.bench;
    return el('article', { class: 'tw-kpi' }, [
      txt('span', 'tw-kpi-label', 'Implied fare elasticity'),
      el('p', { class: 'tw-kpi-value' }, [txt('span', 'is-after', elastic(b.e))]),
      txt('p', 'tw-kpi-change', `Published short-run: ${elastic(FARE_ELASTICITY.mild)} to ${elastic(FARE_ELASTICITY.strong)}`),
      el('p', { class: 'tw-kpi-foot' }, [chip(b.position === 'inside' ? 'holds' : 'warn', b.position === 'inside' ? 'Within published range' : `${b.position === 'stronger' ? 'Stronger' : 'Weaker'} than published`)]),
    ]);
  }
  function tiles(m, sens) {
    const ids = TILES[m.kind] || m.key;
    const out = ids.map((id) => tile(m, sens, id));
    if (m.bench) out.push(elasticityTile(m));
    return el('div', { class: 'tw-kpis' }, out.slice(0, 4));
  }

  // ---------- assessment ----------
  function findings(m, sens) {
    const S = (id) => spread(m, sens, id);
    const ch = (id) => { const s = S(id); return s ? chip(s.state, s.label) : null; };
    const fig = (id) => {
      const ind = IND[id], b = ind.get(m.base), n = ind.get(m.next);
      return { b: show(b, ind.f), n: show(n, ind.f), d: delta(b == null || n == null ? null : n - b, ind.f), p: pct(b, n) };
    };
    const routes = diversion(m);
    const knock = routes.filter((row) => row.knock).reduce((s, row) => s + row.trips, 0);
    const to = Object.entries(routes.reduce((acc, row) => ({ ...acc, [row.to]: (acc[row.to] || 0) + row.trips }), {}))
      .sort((a, b) => b[1] - a[1]).map(([action, trips]) => `${trips} to ${choiceTo(action)}`);
    const dMin = deltaOf(m, 'minutes');
    const changeLine = m.changed.length
      ? { text: `${plural(m.changed.length, 'trip')} change for ${m.changedPeople} of ${m.people} people: ${list(to)}.${knock ? ` ${knock} of these follow shortened shop hours, a knock-on effect.` : ''}` }
      : { text: `No trip choice changes for any of the ${m.people} people${dMin != null && !isZero(dMin, 'pmin') ? `; the policy is absorbed as ${show(Math.abs(dMin), 'pmin')} ${dMin > 0 ? 'more' : 'less'} travel time over ${m.days} days` : ''}.` };
    const shopLine = () => {
      const s = fig('sales'), days = m.next.shortDays - m.base.shortDays;
      return { text: `Focal shop receipts ${s.d} (${s.p}): ${s.b} → ${s.n}.${days > 0 ? ` ${plural(days, 'more shop-day')} on shortened hours under the staffing rule.` : ''}`, chip: ch('sales') };
    };
    const out = [];
    if (noEffect(m)) {
      const same = m.key.map((id) => `${lowerFirst(IND[id].label)} (${show(IND[id].get(m.base), IND[id].f)})`);
      const levels = list(same);
      return [changeLine, { text: `${levels[0].toUpperCase()}${levels.slice(1)} ${same.length > 1 ? 'are' : 'is'} identical in both arms, as is every other indicator.` }];
    }
    if (m.kind === 'fare') {
      const a = fig('adultRides'), f = fig('fairRides'), r = fig('receipts'), b = m.bench;
      out.push({ text: `Adult-fare Line 2 rides ${a.d} (${a.p}): ${a.b} → ${a.n}. ${m.base.fairRides === m.next.fairRides ? `Fair Pass rides unchanged at ${f.n}.` : `Fair Pass rides ${f.b} → ${f.n}.`}`, chip: ch('adultRides') });
      const runShift = b && (Math.abs(b.ridePct) < 0.05 ? 'keeps every adult ride' : `${b.ridePct < 0 ? 'loses' : 'gains'} ${plain(Math.abs(b.ridePct), 1)}%`);
      out.push({ text: `TTC fare receipts ${r.d} (${r.p}): ${r.b} → ${r.n}.${b && b.breakeven != null ? ` Receipts hold only if adult rides ${b.breakeven < 0 ? 'fall by less than' : 'rise by at least'} ${plain(Math.abs(b.breakeven), 1)}%; this run ${runShift}.` : ''}`, chip: ch('receipts') });
      out.push(changeLine);
      out.push(shopLine());
      if (b) out.push({ text: `Implied fare elasticity ${elastic(b.e)} against published short-run estimates of ${elastic(FARE_ELASTICITY.mild)} to ${elastic(FARE_ELASTICITY.strong)}${b.position === 'stronger' ? `: ${plain(b.e / FARE_ELASTICITY.strong, 1)}–${plain(b.e / FARE_ELASTICITY.mild, 1)}× the published response` : b.position === 'weaker' ? ': weaker than the published response' : ''}.`, chip: chip(b.position === 'inside' ? 'holds' : 'warn', b.position === 'inside' ? 'Within evidence' : 'Outside evidence') });
    } else if (m.kind === 'bike') {
      const c = fig('bloorBike'), x = fig('sharedM'), t = fig('carMean'), r = fig('receipts');
      const lost = routes.filter((row) => row.from === 'bike_bloor');
      const lostTrips = lost.reduce((s, row) => s + row.trips, 0), kept = lost.filter((row) => row.to === 'bike_side_street').reduce((s, row) => s + row.trips, 0);
      out.push({ text: `Cycling trips using Bloor ${c.d} (${c.p}): ${c.b} → ${c.n}.${lostTrips ? ` ${kept} of ${lostTrips} diverted trips stay on a bicycle via side streets.` : ''}`, chip: ch('bloorBike') });
      out.push({ text: `Cycling in mixed traffic on Bloor: ${x.b} → ${x.n} over ${m.days} days. Exposure only; no injury model.`, chip: ch('sharedM') });
      const dCar = deltaOf(m, 'carMean');
      out.push({ text: `Time per car leg in the section ${t.d}: ${t.b} → ${t.n}.${dCar != null && dCar > -0.01 ? ' Removal does not shorten driving inside the section.' : ''}`, chip: ch('carMean') });
      out.push(shopLine());
      if (!isZero(deltaOf(m, 'receipts'), 'cad')) out.push({ text: `TTC fare receipts ${r.d} (${r.p}) as riders switch to Line 2. Households pay this; it is a transfer, not a gain.`, chip: ch('receipts') });
    } else {
      const moved = (id) => !isZero(deltaOf(m, id) ?? 0, IND[id].f);
      for (const id of m.key.filter(moved).slice(0, 3)) {
        const v = fig(id);
        out.push({ text: `${IND[id].label} ${v.d} (${v.p}): ${v.b} → ${v.n}.`, chip: ch(id) });
      }
      out.push(changeLine);
      const still = [...new Set([...m.key, 'sales'])].filter((id) => !moved(id)).map((id) => `${lowerFirst(IND[id].label)} (${show(IND[id].get(m.base), IND[id].f)})`);
      if (!m.key.includes('sales') && moved('sales')) out.push(shopLine());
      if (still.length) out.push({ text: `Unchanged in both arms: ${list(still)}.` });
    }
    return out;
  }
  function readiness(m, sens) {
    if (sens.status === 'idle' || sens.status === 'running') return { state: 'pending', label: 'Robustness pending', text: `Rerunning ${plural(variantsOf(m.run).length, 'assumption variant')} with the same people and seed.` };
    if (sens.status === 'error') return { state: 'warn', label: 'Robustness not tested', text: `The sensitivity runs did not complete (${sens.error}). Every figure rests on one set of assumptions.` };
    if (noEffect(m)) {
      const moved = sens.used.filter((v) => !noEffect(v.m)).length, runs = sens.used.length + 1;
      return moved
        ? { state: 'warn', label: 'Exploratory', text: `No effect in the base case, but figures move in ${moved} of ${runs} runs. Whether this lever matters depends on the assumptions.` }
        : { state: 'info', label: 'No effect detected', text: `No trip choice or figure changes in any of the ${runs} runs. The mapped rules give this lever no channel to these ${m.people} people’s choices within ${m.days} days; that is a limit of the model, not evidence that the real policy has no effect.` };
    }
    const flips = m.key.filter((id) => spread(m, sens, id)?.state === 'reverses').map((id) => lowerFirst(IND[id].label));
    const outside = m.bench && m.bench.position !== 'inside';
    if (flips.length || outside || !sens.replayOk) {
      const why = [
        flips.length ? `The sign of ${list(flips)} reverses within the declared assumption ranges.` : '',
        outside ? `The simulated fare response is ${m.bench.position} than published evidence.` : '',
        sens.replayOk ? '' : 'The same-seed replay did not reproduce this run.',
      ].filter(Boolean).join(' ');
      return { state: 'warn', label: 'Exploratory', text: `${why} Use this run to trace mechanisms and who is exposed, not to size the effect.` };
    }
    return { state: 'holds', label: 'Indicative', text: `Headline directions hold across the declared assumption ranges. Magnitudes rest on ${m.people} synthetic people and an unvalidated choice rule.` };
  }
  function assessment(m, sens) {
    const r = readiness(m, sens);
    return el('section', { class: 'tw-card tw-assess' }, [
      el('div', { class: 'tw-assess-head' }, [txt('h3', null, 'Assessment'), chip(r.state, r.label)]),
      txt('p', 'tw-assess-grade', r.text),
      el('ol', { class: 'tw-findings' }, findings(m, sens).map((item) => el('li', {}, [txt('span', null, item.text), item.chip || null]))),
    ]);
  }

  // ---------- impacts by stakeholder ----------
  function impacts(m, sens) {
    const head = el('thead', {}, [el('tr', {}, ['Indicator', 'Baseline', 'Policy', 'Change', '%', 'Change across all runs', 'Robustness']
      .map((label, i) => txt('th', i === 0 ? 'tw-col-label' : i === 5 ? 'tw-col-range' : null, label)))]);
    const hidden = new Set();
    const row = (id) => {
      const ind = IND[id], b = ind.get(m.base), n = ind.get(m.next);
      if (!ALWAYS.has(id) && !b && !n) return null;
      const s = spread(m, sens, id), sub = typeof ind.sub === 'function' ? ind.sub(m) : ind.sub;
      const keep = ALWAYS.has(id) || m.key.includes(id) || (m.kind === 'fare' && /^fair/.test(id)) || s?.state === 'sensitive';
      if (!keep && isZero(deltaOf(m, id) ?? 0, ind.f)) { hidden.add(lowerFirst(ind.label)); return null; }
      return el('tr', {}, [
        el('th', { scope: 'row' }, [txt('span', null, ind.label), sub ? txt('small', null, sub) : null]),
        txt('td', 'is-before', show(b, ind.f)),
        txt('td', 'is-after', show(n, ind.f)),
        txt('td', 'tw-num-strong', delta(b == null || n == null ? null : n - b, ind.f)),
        txt('td', null, pct(b, n)),
        el('td', { class: 'tw-col-range' }, [rangeCell(s, ind.f)]),
        el('td', {}, [s ? chip(s.state, s.label) : null]),
      ]);
    };
    const input = m.kind === 'fare' ? el('tr', {}, [
      el('th', { scope: 'row' }, [txt('span', null, 'Adult fare per ride'), txt('small', null, m.fairN ? 'Fair Pass unchanged' : null)]),
      txt('td', 'is-before', show(m.fare.base, 'cad')), txt('td', 'is-after', show(m.fare.next, 'cad')),
      txt('td', 'tw-num-strong', delta(m.fare.next - m.fare.base, 'cad')), txt('td', null, pct(m.fare.base, m.fare.next)),
      el('td', { class: 'tw-col-range' }, [txt('span', 'tw-range-text', '—')]), el('td', {}, [chip('info', 'Policy input')]),
    ]) : null;
    const body = el('tbody', {}, (ORDER[m.kind] || ORDER.compiled).flatMap((key) => {
      const section = SECTIONS[key];
      const rows = section.rows.map(row).filter(Boolean);
      if (key === 'riders' && input) rows.unshift(input);
      return rows.length ? [el('tr', { class: 'tw-group' }, [el('th', { colspan: 7, scope: 'rowgroup' }, [section.title(m)])]), ...rows] : [];
    }));
    const runs = sens.status === 'done' ? sens.used.length + 1 : null;
    return card('Impacts by stakeholder', [
      rangeLegend(runs),
      scroll(el('table', { class: 'tw-table tw-impacts' }, [head, body])),
      txt('p', 'tw-note', `Totals over ${m.days} modelled weekdays after the change. Change across all runs: the bar spans the smallest to largest change across ${runs ? plural(runs, 'run') : 'the runs'} (the base case, shown as the white dot, and each assumption variant that moves a figure), on a scale that always includes 0. Robustness: whether the change keeps its sign in every run. Lower spending can reflect trips given up; travel time is not monetised.${hidden.size ? ` Unchanged and not listed: ${[...hidden].join('; ')}.` : ''}`),
    ]);
  }

  function incidenceCard(m) {
    const rows = incidence(m);
    const head = el('thead', {}, [el('tr', {}, ['Group', 'People', 'Changed a trip', 'Line 2 rides', 'Travel cost per person-day', 'Travel time per person-day', 'Trips lost']
      .map((label, i) => txt('th', i === 0 ? 'tw-col-label' : null, label)))]);
    const body = el('tbody', {}, rows.flatMap((g) => [
      g.band ? el('tr', { class: 'tw-group' }, [el('th', { colspan: 7, scope: 'rowgroup' }, [g.band])]) : null,
      el('tr', { class: g.label === 'All people' ? 'is-total' : null }, [
        el('th', { scope: 'row' }, [txt('span', null, g.label), g.sub ? txt('small', null, g.sub) : null]),
        txt('td', null, plain(g.n)),
        txt('td', null, plain(g.changed)),
        txt('td', 'tw-num-strong', delta(g.rides, 'n')),
        txt('td', 'tw-num-strong', delta(g.cost, 'cad')),
        txt('td', 'tw-num-strong', delta(g.minutes, 'min')),
        txt('td', 'tw-num-strong', delta(g.lost, 'n')),
      ]),
    ].filter(Boolean)));
    return card('Who is affected', [
      scroll(el('table', { class: 'tw-table' }, [head, body])),
      txt('p', 'tw-note', `Changes from baseline over the ${m.days} days. Per person-day = group change ÷ (people × ${m.days}). Travel cost is fares plus parking and vehicle costs; it falls when people stop paying for trips, which is not a saving. Trips lost = forgone trips plus errands moved outside the section. Groups overlap across bands.`),
    ]);
  }

  function diversionCard(m) {
    const rows = diversion(m);
    if (!rows.length) return card('Where changed trips went', [txt('p', 'tw-note', 'No trip choice differs between the arms.')]);
    const head = el('thead', {}, [el('tr', {}, ['Baseline choice', 'Policy choice', 'Trips', 'People', 'Cause'].map((label, i) => txt('th', i < 2 ? 'tw-col-label' : null, label)))]);
    const body = el('tbody', {}, rows.map((row) => el('tr', {}, [
      txt('th', null, CHOICE[row.from] || row.from.replace(/_/g, ' ')),
      txt('td', 'tw-col-label', CHOICE[row.to] || row.to.replace(/_/g, ' ')),
      txt('td', 'tw-num-strong', plain(row.trips)),
      txt('td', null, plain(row.people.size)),
      el('td', {}, [chip(row.knock ? 'sensitive' : 'info', row.knock ? 'Shop hours' : 'Policy')]),
    ])));
    return card('Where changed trips went', [
      scroll(el('table', { class: 'tw-table' }, [head, body])),
      txt('p', 'tw-note', 'Each changed choice is one person’s trip on one day, compared with the same trip in the baseline arm. Shop hours: the planned shop had shortened its hours under the staffing rule.'),
    ]);
  }

  function sensitivityCard(m, sens) {
    const ids = m.key;
    const intro = txt('p', 'tw-note tw-note--lead', `Each declared assumption is rerun at the low and high end of its test range with the same people, spec and seed, in this browser. Declared ranges are test ranges, not confidence intervals.`);
    if (sens.status !== 'done') {
      return card('Sensitivity analysis', [intro, txt('p', 'tw-status', sens.status === 'error' ? `Not run: ${sens.error}.` : `Running ${plural(sens.total ?? variantsOf(m.run).length, 'variant')}…`)]);
    }
    const head = el('thead', {}, [el('tr', {}, [txt('th', 'tw-col-label', 'Run'), txt('th', null, 'Choices changed'), ...ids.map((id) => txt('th', null, SHORT[id] || IND[id].label))])]);
    const cells = (x) => ids.map((id) => {
      const d = deltaOf(x, id), d0 = deltaOf(m, id), f = IND[id].f;
      const flip = d != null && d0 != null && !isZero(d, f) && !isZero(d0, f) && Math.sign(d) !== Math.sign(d0);
      return el('td', { class: flip ? 'is-flip' : null }, [delta(d, f), txt('small', null, pct(IND[id].get(x.base), IND[id].get(x.next)))]);
    });
    const name = (id) => ASSUMPTION_SHORT[id] || id.replace(/_/g, ' ');
    const setting = (v) => (typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
    const baseNote = Object.entries(m.run.assumption_values || {}).map(([id, v]) => `${name(id)} ${setting(v)}`).join(' · ');
    const body = el('tbody', {}, [
      el('tr', { class: 'is-total' }, [el('th', { scope: 'row' }, [txt('span', null, 'Base case'), txt('small', null, baseNote)]), txt('td', null, plain(m.changed.length)), ...cells(m)]),
      ...sens.used.map((v) => el('tr', {}, [
        el('th', { scope: 'row' }, [txt('span', null, `${name(v.id)} ${setting(v.value)}`), txt('small', null, v.end ? `${v.end} end of test range` : `base ${setting(v.now)}`)]),
        txt('td', null, plain(v.m.changed.length)), ...cells(v.m),
      ])),
    ]);
    const inert = [...new Set(sens.inert.map((v) => v.id))].map((id) => `${name(id).toLowerCase()} (${sens.inert.filter((v) => v.id === id).map((v) => setting(v.value)).join(' and ')})`);
    return card('Sensitivity analysis', [
      intro,
      scroll(el('table', { class: 'tw-table tw-sens' }, [head, body])),
      txt('p', 'tw-note', `Cells: change from that run’s own baseline, with %. Highlighted: the sign differs from the base case.${inert.length ? ` Not listed: ${list(inert)} move${inert.length > 1 ? '' : 's'} no figure in this run.` : ''}`),
    ]);
  }

  function facts(rows) {
    return el('dl', { class: 'tw-facts' }, rows.filter(Boolean).flatMap(([label, value]) => [txt('dt', null, label), el('dd', {}, Array.isArray(value) ? value : [value])]));
  }
  function fareCheck(m) {
    const b = m.bench;
    const switchers = new Set(m.changed.filter((c) => c.baseline.action === 'transit' || c.intervention.action === 'transit').map((c) => c.actor)).size;
    const reading = b.position === 'inside'
      ? 'The simulated response is within the published range.'
      : b.position === 'stronger'
        ? `The simulated response is ${plain(b.e / FARE_ELASTICITY.strong, 1)}–${plain(b.e / FARE_ELASTICITY.mild, 1)}× the published estimates. It rests on ${plural(switchers, 'synthetic rider')} changing mode or destination, so the ridership and receipts figures describe this sample, not an expected TTC outcome.`
        : b.q1 === b.q0
          ? 'No adult rider in this sample is close enough to the margin to respond, so the response is weaker than published estimates.'
          : 'The simulated response is weaker than published estimates.';
    return card('Fare response check', [
      facts([
        ['Adult fare', `${show(b.p0, 'cad')} → ${show(b.p1, 'cad')} (${signedPct(b.farePct)})`],
        ['Adult paid rides', `${plain(b.q0)} → ${plain(b.q1)} (${signedPct(b.ridePct)})`],
        ['Implied arc elasticity', elastic(b.e)],
        ['Published short-run range', [`${elastic(FARE_ELASTICITY.mild)} to ${elastic(FARE_ELASTICITY.strong)}. `, txt('small', null, 'Mexican subways and Bogotá BRT; not Toronto estimates.')]],
        ['Ride change at that range', [`${signedPct(b.published[0])} to ${signedPct(b.published[1])}. `, txt('small', null, 'Arithmetic for this fare change, not a forecast.')]],
        b.breakeven != null ? ['Receipts break-even', `Adult receipts hold if adult rides ${b.breakeven < 0 ? 'fall by less than' : 'rise by at least'} ${plain(Math.abs(b.breakeven), 1)}%.`] : ['Receipts break-even', 'Adult receipts are zero at a zero fare, whatever the ridership.'],
        ['Sample resolution', `One adult ride is ${plain(b.oneRide.pct, 1)}% of adult rides; the smallest possible response implies ${elastic(b.oneRide.e)}.`],
      ]),
      txt('p', 'tw-reading', reading),
    ]);
  }
  function streetCheck(m) {
    const routes = diversion(m).filter((row) => row.from === 'bike_bloor');
    const to = Object.entries(routes.reduce((acc, row) => ({ ...acc, [row.to]: (acc[row.to] || 0) + row.trips }), {}))
      .sort((a, b) => b[1] - a[1]).map(([action, trips]) => `${trips} to ${choiceTo(action)}`);
    const dCar = deltaOf(m, 'carMean');
    const perDay = m.base.bloorBike / m.days;
    const lanes = (lever) => m.run.scenario.levers?.[lever]?.bloor_car_lanes_per_direction ?? window.BloorSandbox?.DEFAULT_POLICY?.bloor_car_lanes_per_direction;
    const sameLanes = lanes('baseline') === lanes('intervention');
    const reading = dCar != null && dCar > -0.01 && m.next.sharedM > m.base.sharedM
      ? `Removal adds ${show(m.next.sharedM - m.base.sharedM, 'm')} of mixed-traffic cycling and does not shorten car legs inside the section (${delta(dCar, 'min')} per leg).`
      : `Removal changes car-leg time by ${delta(dCar, 'min')} and mixed-traffic cycling by ${delta(m.next.sharedM - m.base.sharedM, 'm')}.`;
    return card('Street trade-off check', [
      facts([
        ['Cycling trips using Bloor', `${plain(m.base.bloorBike)} → ${plain(m.next.bloorBike)} (${pct(m.base.bloorBike, m.next.bloorBike)})`],
        routes.length ? ['Diverted Bloor cycling trips', list(to)] : null,
        ['Mixed-traffic cycling on Bloor', `${show(m.base.sharedM, 'm')} → ${show(m.next.sharedM, 'm')}`],
        ['Time per car leg', `${show(IND.carMean.get(m.base), 'min')} → ${show(IND.carMean.get(m.next), 'min')} (${delta(dCar, 'min')})`],
        ['Car trips', `${plain(m.base.car)} → ${plain(m.next.car)}`],
        lanes('intervention') != null ? ['Car lanes per direction', sameLanes
          ? [`${lanes('intervention')} in both arms. `, txt('small', null, 'The track is removed without giving its space to cars; cyclists share the car lane.')]
          : `${lanes('baseline')} → ${lanes('intervention')}`] : null,
        ['Observed context', [`${plain(HURON_COUNTER_PER_DAY)} cyclist passages a day at the Bloor counter west of Huron (2025). `, txt('small', null, `This sample has ${plain(perDay, 1)} Bloor cycling trips a day before the change and is not scaled to the counter.`)]],
      ]),
      txt('p', 'tw-reading', reading),
    ]);
  }

  function checksCard(m, sens) {
    const icon = { pass: '✓', fail: '✕', warn: '!', info: 'i', pending: '…' };
    return card('Validity checks', [el('ul', { class: 'tw-checks' }, checks(m, sens).map((c) => el('li', { class: `is-${c.state}` }, [
      txt('span', 'tw-check-icon', icon[c.state]),
      el('div', {}, [txt('strong', null, c.title), txt('span', null, c.text)]),
    ])))]);
  }

  function limitsCard(m) {
    const limits = (m.run.not_estimable || []).filter((item) => m.kind === 'bike' || item.id !== 'removal_construction_cost_cad');
    return el('section', { class: 'tw-card tw-limits-card' }, [
      el('div', {}, [
        txt('h3', null, 'Not estimable from this run'),
        el('ul', { class: 'tw-limits' }, limits.map((item) => el('li', {}, [txt('strong', null, LIMIT_LABEL[item.id] || item.id.replace(/_/g, ' ')), item.reason ? txt('span', null, item.reason) : null]))),
      ]),
      el('div', {}, [
        txt('h3', null, 'Evidence needed before a decision'),
        el('ol', { class: 'tw-measure' }, (NEEDED[m.kind] || NEEDED.compiled).map((line) => txt('li', null, line))),
      ]),
    ]);
  }

  function methodCard(m, open) {
    const run = m.run;
    const sensitivity = (run.assumptions || []).filter((a) => a.kind === 'sensitivity');
    const rule = (run.assumptions || []).find((a) => a.id === 'synthetic_choice_rule');
    const sources = [...(run.sources || []).map((s) => ({ label: s.claim || s.id, url: s.url })), ...(m.bench ? FARE_SOURCES : [])];
    const events = run.runs.baseline.events.length + run.runs.intervention.events.length;
    return el('details', { class: 'tw-card tw-method', open: open ? '' : null }, [
      el('summary', {}, ['Method, assumptions and sources']),
      txt('p', null, `Design: paired counterfactual. Both arms run the same ${m.people} people, routines, spec and seed ${run.seed} on the mapped sandbox; only the policy lever differs from day ${m.start}. Every figure is reduced from the ${plain(events)} committed events of run v${run.version}.`),
      txt('p', null, CONTEXT[m.kind] || CONTEXT.compiled),
      rule ? txt('p', null, `Choice rule: ${rule.note}`) : null,
      sensitivity.length ? scroll(el('table', { class: 'tw-table tw-assumptions' }, [
        el('thead', {}, [el('tr', {}, ['Assumption', 'Value', 'Test range', 'Note'].map((label, i) => txt('th', i === 0 || i === 3 ? 'tw-col-label' : null, label)))]),
        el('tbody', {}, sensitivity.map((a) => {
          const v = run.assumption_values?.[a.id] ?? a.value;
          const fmt = (x) => (typeof x === 'boolean' ? (x ? 'on' : 'off') : String(x));
          return el('tr', {}, [txt('th', null, ASSUMPTION_LABEL[a.id] || a.id), txt('td', null, fmt(v)), txt('td', null, `${fmt(a.low)} – ${fmt(a.high)}`), txt('td', 'tw-col-label', a.note || '')]);
        })),
      ])) : null,
      txt('p', null, LITERATURE[m.kind] || LITERATURE.compiled),
      sources.length ? el('ul', {}, sources.map((s) => el('li', {}, [link(s)]))) : null,
    ]);
  }

  // ---------- line charts: each metric per simulated day, baseline vs with the policy ----------
  const CHART_SETS = {
    fare: [['transit_trips', 'TTC trips', 'n'], ['fare_revenue_cad', 'TTC fare receipts', '$'], ['car_trips', 'Car trips', 'n'], ['shop_sales_cad', 'Bloor shop receipts', '$']],
    bike: [['bloor_bike_trips', 'Bike trips on Bloor', 'n'], ['bloor_shared_cycling_m', 'Metres cycled beside cars', 'm'], ['car_trips', 'Car trips', 'n'], ['shop_sales_cad', 'Bloor shop receipts', '$']],
    compiled: [['completed_trips', 'Completed trips', 'n'], ['transit_trips', 'TTC trips', 'n'], ['car_trips', 'Car trips', 'n'], ['shop_sales_cad', 'Bloor shop receipts', '$']],
  };
  const series = (run, arm, id) => run.runs[arm].metrics.by_tick.map((row) => Number(row[id]) || 0);
  const sum = (run, arm, id) => run.runs[arm].metrics.by_tick.filter((row) => row.tick >= run.scenario.policy_start).reduce((t, row) => t + (Number(row[id]) || 0), 0);
  const fmtUnit = (v, unit) => (unit === '$' ? `$${Math.round(v).toLocaleString()}` : unit === 'm' ? `${Math.round(v).toLocaleString()} m` : String(Math.round(v * 10) / 10));
  const xmlEsc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function lineChart(run, id, label, unit) {
    const base = series(run, 'baseline', id), next = series(run, 'intervention', id);
    if (!base.length) return null;
    const W = 320, H = 150, L = 46, R = 12, T = 14, B = 26, n = base.length;
    const max = Math.max(1, ...base, ...next) * 1.12;
    const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const grid = [0, 0.5, 1].map((f) => { const v = max / 1.12 * f, yy = y(v).toFixed(1);
      return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="g"/><text x="${L - 6}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${xmlEsc(fmtUnit(v, unit))}</text>`; }).join('');
    const ps = run.scenario.policy_start, px = x(ps - 1) - (n > 1 ? (x(1) - x(0)) / 2 : 0);
    const marker = ps > 1 ? `<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${T}" y2="${H - B}" class="p"/><text x="${(px + 4).toFixed(1)}" y="${T + 8}" class="pl">policy starts</text>` : '';
    const days = base.map((_, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">Day ${i + 1}</text>`).join('');
    const dots = (vals, cls, who) => vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" class="${cls}"><title>Day ${i + 1} · ${who}: ${xmlEsc(fmtUnit(v, unit))}</title></circle>`).join('');
    const a = sum(run, 'baseline', id), b = sum(run, 'intervention', id);
    const fig = el('figure', { class: 'tw-line' });
    fig.innerHTML = `<figcaption><span>${xmlEsc(label)}</span><small>${xmlEsc(fmtUnit(a, unit))} → ${xmlEsc(fmtUnit(b, unit))} after the change</small></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${xmlEsc(label)} per day, baseline and with the policy">${grid}${marker}${days}
        <path d="${path(base)}" class="lb"/><path d="${path(next)}" class="ln"/>${dots(base, 'db', 'baseline')}${dots(next, 'dn', 'with policy')}</svg>`;
    return fig;
  }
  function chartsCard(m) {
    const set = CHART_SETS[m.kind] || CHART_SETS.compiled;
    const figs = set.map(([id, label, unit]) => lineChart(m.run, id, label, unit)).filter(Boolean);
    if (!figs.length) return null;
    return el('section', { class: 'tw-card tw-lines' }, [
      el('header', { class: 'tw-lines-head' }, [txt('h3', null, 'Day by day'),
        el('p', { class: 'tw-lines-key' }, [txt('i', 'is-base', ''), 'Baseline', txt('i', 'is-next', ''), 'With the policy'])]),
      el('div', { class: 'tw-lines-grid' }, figs),
    ]);
  }

  // ---------- the brief ----------
  function render(run) {
    speculative = false;
    place();
    if (!run || run.schema_version !== 'experiment.v2') { current = null; box.hidden = true; box.replaceChildren(); return; }
    const fresh = run !== current;
    current = run;
    const m = model(run);
    const sens = SENS.get(run) || { status: 'idle' };
    const methodOpen = !fresh && Boolean(box.querySelector('details.tw-method')?.open);
    box.replaceChildren(
      header(m),
      tiles(m, sens),
      chartsCard(m),
      assessment(m, sens),
      impacts(m, sens),
      incidenceCard(m),
      txt('p', 'tw-footnote', `Simulated · ${m.people} synthetic people on the mapped Bloor St W section · not a forecast`),
    );
    box.hidden = false;
    if (fresh) requestAnimationFrame(() => { if (inView()) startSensitivity(); });
  }
  const inView = () => { const r = box.getBoundingClientRect(); return !box.hidden && r.top < window.innerHeight * 0.7 && r.bottom > 0; };
  // Sensitivity runs start once the brief is on screen, so they never compete with the 3D tour above it.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) startSensitivity(); }, { rootMargin: '0px 0px -30% 0px' }).observe(box);
  } else {
    window.addEventListener('scroll', () => { if (inView()) startSensitivity(); }, { passive: true });
  }

  // ---------- a question with no mapped lever: no run, no 3D street, no simulated figures ----------
  // The report is the 100 persona agents on top, then their ratings as metrics. No compiler cards.
  const STANCES = ['strongly oppose', 'oppose', 'neutral', 'support', 'strongly support'];
  let speculative = false, poll = null;
  window.addEventListener('counterfactual:poll', (event) => { poll = event.detail; if (speculative) pollReport(); });

  function pollReport() {
    const report = box.querySelector('.tw-poll-report'), agentsCard = box.querySelector('.tw-agents');
    if (!report) return;
    const live = poll && poll.view === 'custom' ? poll : null;
    const rows = live ? live.rows.filter((row) => row.rating) : [];
    if (agentsCard) agentsCard.hidden = false;
    const drafted = live && !/^Drafting/.test(live.question)
      ? el('p', { class: 'tw-drafted' }, [txt('span', null, 'Policy the agents rated, drafted from your question'), live.question]) : null;
    if (!rows.length) {
      const offline = document.getElementById('agentsNote')?.dataset.state === 'offline';
      const status = !live ? (offline ? 'The persona-agent panel is offline, so this question has no ratings yet.' : 'Waiting for the persona-agent panel…')
        : live.failed ? `The agent poll did not complete: ${live.status.replace(/^AGENT POLL FAILED · /, '').toLowerCase()}.`
        : `${live.status.charAt(0)}${live.status.slice(1).toLowerCase()}`;
      report.replaceChildren(...[drafted, card('Persona-agent ratings', [txt('p', 'tw-status', status)])].filter(Boolean));
      return;
    }
    const n = rows.length, asked = live.asked || 100;
    const avg = (list) => list.reduce((s, row) => s + row.rating, 0) / list.length;
    const split = (list) => [list.filter((r) => r.rating <= 2).length, list.filter((r) => r.rating === 3).length, list.filter((r) => r.rating >= 4).length];
    const [oppose, neutral, support] = split(rows);
    const share = (k, of = n) => `${plain((k / of) * 100)}%`;
    const kpi = (label, value, tone, change, foot) => el('article', { class: 'tw-kpi' }, [
      txt('span', 'tw-kpi-label', label),
      el('p', { class: 'tw-kpi-value' }, [txt('span', tone, value)]),
      txt('p', 'tw-kpi-change', change),
      el('p', { class: 'tw-kpi-foot' }, [txt('small', 'tw-note', foot)]),
    ]);
    const done = n >= asked || (/ANSWERED$/.test(live.status) && !/^LIVE/.test(live.status));

    // Groups: role, then fare product. Smallest groups are still shown, with their size beside the average.
    const groupBy = (key) => Object.entries(rows.reduce((acc, row) => ((acc[key(row.agent)] ||= []).push(row), acc), {}))
      .sort((a, b) => b[1].length - a[1].length);
    const roles = groupBy((agent) => words(agent.role || 'agent'));
    const fares = rows.some((row) => row.agent.fare_category) ? groupBy((agent) => (agent.fare_category === 'fair_pass' ? 'Fair Pass' : 'Adult fare')) : [];
    const bar = (list) => {
      const [o, u, s] = split(list);
      return el('span', { class: 'tw-split', 'aria-label': `${o} oppose, ${u} neutral, ${s} support` }, [
        o ? el('i', { class: 'is-oppose', style: `flex:${o}` }, []) : null,
        u ? el('i', { class: 'is-neutral', style: `flex:${u}` }, []) : null,
        s ? el('i', { class: 'is-support', style: `flex:${s}` }, []) : null,
      ]);
    };
    const groupRows = (title, groups) => (groups.length ? [
      el('tr', { class: 'tw-group' }, [el('th', { colspan: '5' }, [title])]),
      ...groups.map(([name, list]) => el('tr', {}, [
        txt('th', null, name), txt('td', null, plain(list.length)), txt('td', 'tw-num-strong', avg(list).toFixed(1)),
        txt('td', null, share(split(list)[2], list.length)), el('td', {}, [bar(list)]),
      ])),
    ] : []);
    const ranked = roles.filter(([, list]) => list.length >= 3).map(([name, list]) => ({ name, list, mean: avg(list) })).sort((a, b) => a.mean - b.mean);
    const lo = ranked[0], hi = ranked[ranked.length - 1];
    const lead = lo && hi && hi.mean - lo.mean >= 0.2
      ? `Least supportive: ${lo.name}s (average ${lo.mean.toFixed(1)}, ${plural(lo.list.length, 'agent')}). Most supportive: ${hi.name}s (${hi.mean.toFixed(1)}, ${plural(hi.list.length, 'agent')}).`
      : 'Every role with three or more agents rated it within 0.2 of the others.';
    const legend = el('p', { class: 'tw-note tw-split-legend' }, [txt('i', 'is-oppose', ''), 'oppose (1–2)', txt('i', 'is-neutral', ''), 'neutral (3)', txt('i', 'is-support', ''), 'support (4–5)']);

    // Voices: the first clear reason at each end of the scale and in the middle, in agent-id order.
    const clear = rows.filter((row) => row.answer.reason && row.answer.consistency !== 'check').sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const voices = [clear.find((r) => r.rating <= 2), clear.find((r) => r.rating === 3), clear.find((r) => r.rating >= 4)].filter(Boolean);
    const summary = String(live.summary || '').replace(/^Summarising…$/, '');

    report.replaceChildren(...[
      drafted,
      done ? null : txt('p', 'tw-status tw-poll-live', `${n} of ${asked} agents have answered so far; the figures update as answers arrive.`),
      el('div', { class: 'tw-kpis' }, [
        kpi('Support', share(support), 'is-support', `${support} of ${n} agents`, 'Rated 4 or 5'),
        kpi('Oppose', share(oppose), 'is-oppose', `${oppose} of ${n} agents`, 'Rated 1 or 2'),
        kpi('Neutral', share(neutral), 'is-neutral', `${neutral} of ${n} agents`, 'Rated 3'),
        kpi('Average rating', `${avg(rows).toFixed(1)} / 5`, 'is-after', `${n} of ${asked} answered`, '1 = strongly oppose, 5 = strongly support'),
      ]),
      el('div', { class: 'tw-grid' }, [
        card('How each group rated it', [
          txt('p', 'tw-note tw-note--lead', lead),
          scroll(el('table', { class: 'tw-table tw-groups' }, [
            el('thead', {}, [el('tr', {}, ['Group', 'Agents', 'Average', 'Support', 'Split'].map((label, i) => txt('th', i === 0 || i === 4 ? 'tw-col-label' : null, label)))]),
            el('tbody', {}, [...groupRows('By role', roles), ...groupRows('By fare product', fares)]),
          ])),
          legend,
        ]),
        card('In their own words', [
          el('ul', { class: 'tw-voices' }, voices.map((row) => el('li', {}, [
            txt('p', null, `“${row.answer.reason}”`),
            txt('small', null, `${row.agent.name || row.id} · ${words(row.agent.role || 'agent')} · rated ${row.rating}, ${STANCES[row.rating - 1]}`),
          ]))),
          summary ? txt('p', 'tw-note', `Panel summary: ${summary}`) : null,
        ]),
      ]),
    ].filter(Boolean));
  }
  const words = (text) => String(text || 'agent').replaceAll('_', ' ');

  function renderSpeculative(scenario) {
    place();
    current = null;
    speculative = true;
    const agentsSlot = el('div', { class: 'tw-agents-slot' }, []);
    box.replaceChildren(
      el('header', { class: 'tw-head' }, [
        txt('p', 'tw-eyebrow', 'Persona-agent reaction · not simulated'),
        txt('h2', null, scenario.title || 'This question'),
      ]),
      el('section', { class: 'tw-card tw-agents' }, [
        txt('h3', null, 'Every agent’s answer'),
        txt('p', 'tw-note tw-note--lead', 'One card per agent, coloured by rating. Open a card for that agent’s reason, or filter by role.'),
        agentsSlot,
      ]),
      el('div', { class: 'tw-poll-report' }, []),
    );
    adopt(agentsSlot);
    box.hidden = false;
    pollReport();
  }

  window.addEventListener('counterfactual:result', (event) => render(event.detail));
  if (window.CounterfactualCurrentRun) render(window.CounterfactualCurrentRun);
  new MutationObserver(() => {
    const { phase, scenario } = document.body.dataset;
    if (scenario !== 'custom') { if (speculative) { speculative = false; place(); } return; }
    if (phase !== 'lab') return;
    const now = window.counterfactualPreview?.current?.();
    if (now && now.id === 'custom' && !now.run) renderSpeculative(now);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-phase', 'data-scenario'] });
})();
