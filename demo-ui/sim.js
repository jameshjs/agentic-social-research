// Two Worlds — demo trace generator for the TTC fare case.
// Deterministic, rule-based stand-in for the full agent model: same seed + same params => same trace.
// Output follows demo-ui/replay-trace-spec.md. Works in the browser (window.CFSim) and in Node.
(function (root) {
  'use strict';

  const FARE_ADULT = 3.30;
  const FARE_FAIR = 2.10;
  const ROADS = [0, 12, 24, 36];
  const LOOP_LEN = 144;
  const SPEED = { walk: 200, drive: 700, bus: 900 }; // world units per tick (1 tick = one simulated week, animated as a typical weekday)
  const BUSES = [
    { id: 'bus_a', dir: 1, off: 0 }, { id: 'bus_b', dir: 1, off: 72 },
    { id: 'bus_c', dir: -1, off: 36 }, { id: 'bus_d', dir: -1, off: 108 },
  ];

  const DEFAULT_PARAMS = {
    fare_delta: 0.5, policy_tick: 2, horizon: 4,
    e_commute: -0.3, e_errand: -0.7, low_income_mult: 2, plaza_share: 0.6, spend_local: 16, spend_plaza: 38,
    shop_threshold: 0.12, scale: 18, walk_max: 20, late_after: 0.3,
  };

  const ASSUMPTIONS = [
    { id: 'e_commute', label: 'Commute fare elasticity', value: -0.3, low: -0.5, high: -0.1, step: 0.05, unit: '', kind: 'transferred', status: 'accepted', neutral: 0,
      note: 'A 10% fare rise cuts commute bus trips by about 3%. Taken from UK and international reviews, not measured in Toronto.', source_ids: ['s_elast'] },
    { id: 'e_errand', label: 'Errand fare elasticity', value: -0.7, low: -1.2, high: -0.3, step: 0.05, unit: '', kind: 'transferred', status: 'accepted', neutral: 0,
      note: 'Shopping and other optional trips respond more strongly than commutes.', source_ids: ['s_holmgren'] },
    { id: 'low_income_mult', label: 'Extra response for riders near the cutoff', value: 2, low: 1, high: 3, step: 0.1, unit: '×', kind: 'ai_assumption', status: 'proposed', neutral: 1,
      note: 'Riders with little budget room react about twice as strongly to the same fare change. Plausible from the literature, but there is no Toronto estimate.', source_ids: [] },
    { id: 'plaza_share', label: 'Drivers who shop at the plaza', value: 0.6, low: 0, high: 1, step: 0.05, unit: 'share', kind: 'ai_assumption', status: 'proposed', neutral: 0,
      note: 'Someone who drives to run an errand often picks the big-box plaza over the corner shop.', source_ids: [] },
    { id: 'spend_local', label: 'Spend per corner-shop visit', value: 16, low: 8, high: 30, step: 1, unit: 'CAD', kind: 'ai_assumption', status: 'proposed', neutral: 16,
      note: 'Typical basket at the corner grocery or café.', source_ids: [] },
    { id: 'shop_threshold', label: 'Sales drop before a shop cuts hours', value: 0.12, low: 0.05, high: 0.3, step: 0.01, unit: 'share', kind: 'ai_assumption', status: 'proposed', neutral: 1,
      note: 'The grocery owner trims evening hours if weekly sales fall this far below week 1.', source_ids: [] },
    { id: 'scale', label: 'Residents each agent represents', value: 18, low: 10, high: 40, step: 1, unit: 'people', kind: 'ai_assumption', status: 'accepted', neutral: 18,
      note: 'Scales simulated trips and dollars up to a district of about 1,000 people.', source_ids: [] },
  ];

  const SOURCES = [
    { id: 's_fare', kind: 'observed', label: 'TTC adult PRESTO fare: $3.30', url: 'https://www.ttc.ca/en/Fares-and-passes' },
    { id: 's_fair', kind: 'observed', label: 'TTC Fair Pass PRESTO fare: $2.10', url: 'https://www.ttc.ca/en/Fares-and-passes' },
    { id: 's_gtfs', kind: 'observed', label: 'TTC merged GTFS routes and stops (district layout is simplified)', url: 'https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/' },
    { id: 's_profiles', kind: 'observed', label: 'Toronto 2021 neighbourhood profiles: income and commute mode margins', url: 'https://open.toronto.ca/dataset/neighbourhood-profiles/' },
    { id: 's_elast', kind: 'transferred', label: 'UK DfT bus fare elasticities and diversion factors', url: 'https://www.gov.uk/government/publications/bus-elasticities-and-diversion-factors' },
    { id: 's_holmgren', kind: 'transferred', label: 'Holmgren (2007), meta-analysis of public transport demand', url: 'https://www.sciencedirect.com/science/article/pii/S096585640700047X' },
  ];

  // ---------- deterministic randomness (common random numbers across runs) ----------
  function hashUnit(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
  const rnd = (seed, ...k) => hashUnit(seed + '|' + k.join('|'));
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  // ---------- world ----------
  const BUILDINGS = [
    { id: 'home_1', type: 'home', style: 'apartment', label: 'Maple Court', x: 4, z: 4, w: 4.5, d: 4.5, h: 8 },
    { id: 'home_2', type: 'home', style: 'house', label: 'Bellwoods row houses', x: 8.6, z: 8.4, w: 3, d: 3, h: 2.6 },
    { id: 'shop_1', type: 'shop', style: 'grocery', label: 'Corner grocery', x: 14.6, z: 3.4, w: 4, d: 3, h: 3.2 },
    { id: 'shop_2', type: 'shop', style: 'cafe', label: 'Café on Dundas', x: 20.6, z: 3.4, w: 3.2, d: 3, h: 3 },
    { id: 'home_3', type: 'home', style: 'apartment', label: 'Above-shop flats', x: 17.6, z: 8.6, w: 7, d: 2.6, h: 5 },
    { id: 'work_1', type: 'workplace', style: 'tower', label: 'Harbour office tower', x: 30, z: 6, w: 6, d: 6, h: 17 },
    { id: 'home_4', type: 'home', style: 'apartment', label: 'Lakeview towers', x: 4.2, z: 17.6, w: 4.6, d: 5, h: 12 },
    { id: 'home_5', type: 'home', style: 'house', label: 'Crescent semis', x: 9, z: 21, w: 2.8, d: 3, h: 2.6 },
    { id: 'park', type: 'park', style: 'park', label: 'Trinity park', x: 18, z: 18, w: 9, d: 9, h: 0 },
    { id: 'work_2', type: 'workplace', style: 'warehouse', label: 'Distribution centre', x: 30, z: 18, w: 7.2, d: 6, h: 5 },
    { id: 'home_6', type: 'home', style: 'house', label: 'Euclid houses', x: 3.6, z: 27.6, w: 3, d: 3, h: 2.6 },
    { id: 'home_7', type: 'home', style: 'house', label: 'Palmerston houses', x: 8.6, z: 27.6, w: 3, d: 3, h: 2.8 },
    { id: 'home_8', type: 'home', style: 'apartment', label: 'Clinton co-op', x: 6, z: 33, w: 7, d: 2.8, h: 6 },
    { id: 'home_9', type: 'home', style: 'apartment', label: 'Ossington towers', x: 15, z: 30, w: 4.5, d: 5, h: 14 },
    { id: 'home_10', type: 'home', style: 'house', label: 'Shaw St houses', x: 21, z: 32, w: 3, d: 3, h: 2.6 },
    { id: 'plaza', type: 'shop', style: 'plaza', label: 'Big-box plaza', x: 30.5, z: 30.5, w: 8, d: 4.6, h: 4.2 },
  ];
  const STOPS = [
    { id: 'stop_n', label: 'Dundas & Market', x: 18, z: 0 },
    { id: 'stop_e1', label: 'Harbour St', x: 36, z: 6 },
    { id: 'stop_e2', label: 'Depot Rd', x: 36, z: 20 },
    { id: 'stop_e3', label: 'Plaza Loop', x: 36, z: 31 },
    { id: 'stop_s', label: 'Shaw & College', x: 18, z: 36 },
    { id: 'stop_w2', label: 'Euclid Ave', x: 0, z: 28 },
    { id: 'stop_w1', label: 'Maple Ave', x: 0, z: 8 },
  ];

  function doorOf(b) {
    const bx = Math.floor(b.x / 12) * 12, bz = Math.floor(b.z / 12) * 12;
    const c = [
      { d: b.z - bz, p: [b.x, bz] }, { d: bz + 12 - b.z, p: [b.x, bz + 12] },
      { d: b.x - bx, p: [bx, b.z] }, { d: bx + 12 - b.x, p: [bx + 12, b.z] },
    ].sort((a, c2) => a.d - c2.d);
    return c[0].p;
  }
  BUILDINGS.forEach(b => { b.door = doorOf(b); });
  const BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
  STOPS.forEach(s => { s.s = loopS(s.x, s.z); });

  function loopS(x, z) {
    if (z === 0) return x;
    if (x === 36) return 36 + z;
    if (z === 36) return 72 + (36 - x);
    return 108 + (36 - z);
  }
  function loopPos(s) {
    s = mod(s, LOOP_LEN);
    if (s < 36) return [s, 0];
    if (s < 72) return [36, s - 36];
    if (s < 108) return [36 - (s - 72), 36];
    return [0, 36 - (s - 108)];
  }

  const onH = p => ROADS.includes(p[1]);
  const onV = p => ROADS.includes(p[0]);
  function dedupe(pts) {
    return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  }
  function roadPath(a, b) {
    if (a[0] === b[0] && a[1] === b[1]) return [a, b];
    if (onH(a) && onH(b)) {
      if (a[1] === b[1]) return [a, b];
      let best = 0, bc = 1e9;
      for (const x of ROADS) { const c = Math.abs(a[0] - x) + Math.abs(b[0] - x); if (c < bc) { bc = c; best = x; } }
      return dedupe([a, [best, a[1]], [best, b[1]], b]);
    }
    if (onV(a) && onV(b)) {
      if (a[0] === b[0]) return [a, b];
      let best = 0, bc = 1e9;
      for (const z of ROADS) { const c = Math.abs(a[1] - z) + Math.abs(b[1] - z); if (c < bc) { bc = c; best = z; } }
      return dedupe([a, [a[0], best], [b[0], best], b]);
    }
    if (onH(a)) return dedupe([a, [b[0], a[1]], b]);
    return dedupe([a, [a[0], b[1]], b]);
  }
  const pathLen = pts => pts.reduce((s, p, i) => i ? s + Math.abs(p[0] - pts[i - 1][0]) + Math.abs(p[1] - pts[i - 1][1]) : 0, 0);

  function nearestStop(p) {
    let best = null, bd = 1e9;
    for (const s of STOPS) { const d = pathLen(roadPath(p, [s.x, s.z])); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  function planTrip(from, to, mode, t0) {
    const legs = [];
    if (mode === 'bus') {
      const a = nearestStop(from), b = nearestStop(to);
      if (a.id === b.id) return null;
      const w1 = roadPath(from, [a.x, a.z]);
      const tStop = t0 + pathLen(w1) / SPEED.walk;
      legs.push({ mode: 'walk', path: w1, t0: round(t0, 4), t1: round(tStop, 4) });
      let best = null;
      for (const bus of BUSES) {
        const phase = mod(bus.dir * (a.s - bus.off) - SPEED.bus * tStop, LOOP_LEN) ;
        // bus s(t) = off + dir * v * t  =>  arrival when dir*(a.s - off) ≡ v*t (mod L)
        const tb = tStop + phase / SPEED.bus;
        const ride = mod(bus.dir * (b.s - a.s), LOOP_LEN);
        const ta = tb + ride / SPEED.bus;
        if (!best || ta < best.ta) best = { bus, tb, ta };
      }
      legs.push({ mode: 'wait', at: a.id, pos: [a.x, a.z], t0: round(tStop, 4), t1: round(best.tb, 4) });
      legs.push({ mode: 'bus', bus: best.bus.id, from_stop: a.id, to_stop: b.id, t0: round(best.tb, 4), t1: round(best.ta, 4) });
      const w2 = roadPath([b.x, b.z], to);
      const tEnd = best.ta + pathLen(w2) / SPEED.walk;
      legs.push({ mode: 'walk', path: w2, t0: round(best.ta, 4), t1: round(tEnd, 4) });
      return { legs, tEnd, board: a, alight: b };
    }
    const path = roadPath(from, to);
    const tEnd = t0 + pathLen(path) / SPEED[mode];
    legs.push({ mode, path, t0: round(t0, 4), t1: round(tEnd, 4) });
    return { legs, tEnd };
  }

  // ---------- population ----------
  const ROLES = {
    fair_pass: { label: 'Fair Pass rider', why: 'Income is under the Fair Pass cutoff, so the fare stays at $2.10. This group acts as a built-in comparison.', income: [380, 520], pbus: { commute: 0.9, errand: 0.78 }, errand_p: 0.55, car: 0 },
    near_poor: { label: 'Rider just above the cutoff', why: 'Earns slightly too much for Fair Pass, so pays the full increase with the least room in the budget.', income: [560, 760], pbus: { commute: 0.9, errand: 0.78 }, errand_p: 0.6, car: 0 },
    commuter: { label: 'Daily transit commuter', why: 'Rides to work every day. The fare is a small share of income, but trips are frequent.', income: [950, 1450], pbus: { commute: 0.86, errand: 0.55 }, errand_p: 0.45, car: 0 },
    car_owner: { label: 'Car-owning worker', why: 'Can switch to driving if transit gets pricier, which adds traffic and shifts where they shop.', income: [1150, 1900], pbus: { commute: 0.42, errand: 0.25 }, errand_p: 0.5, car: 1 },
  };
  const NAMES = {
    fair_pass: ['Aisha', 'Rosa', 'Mehmet', 'Lan', 'Yusuf', 'Gloria', 'Tenzin', 'Ama', 'Bilal', 'Teresa', 'Wen', 'Precious'],
    near_poor: ['Maria', 'Kwame', 'Sofia', 'Ravi', 'Hana', 'Diego', 'Fatima', 'Luis', 'Nadia', 'Emeka', 'Joy', 'Tariq', 'Marisol', 'Sanjay', 'Leila', 'Andre'],
    commuter: ['Jun', 'Olivia', 'Samir', 'Chloe', 'Mateo', 'Ines', 'Arjun', 'Zoe', 'Noah', 'Mei', 'Karan', 'Grace L.', 'Felix', 'Amara', 'Ivan', 'Ruth'],
    car_owner: ['Tom', 'Elena', 'Marcus', 'Priyanka', 'Owen', 'Bea', 'Viktor', 'Sunita', 'Paolo', 'Kim'],
  };
  const DEEP = new Set(['Aisha', 'Maria', 'Jun', 'Tom']);
  const HOMES = {
    fair_pass: ['home_1', 'home_4', 'home_8', 'home_9', 'home_3'],
    near_poor: ['home_4', 'home_9', 'home_1', 'home_8', 'home_3'],
    commuter: ['home_3', 'home_9', 'home_4', 'home_1', 'home_10'],
    car_owner: ['home_2', 'home_5', 'home_6', 'home_7', 'home_10'],
  };

  function buildPersonas(seed) {
    const out = [];
    for (const role of Object.keys(ROLES)) {
      const R = ROLES[role];
      NAMES[role].forEach((name, i) => {
        const u = k => rnd(seed, 'persona', role, i, k);
        const noWork = role === 'fair_pass' && i % 4 === 3; // caregivers / retirees run midday errands
        const work = noWork ? null : (role === 'commuter' || role === 'car_owner') ? (u('w') < 0.75 ? 'work_1' : 'work_2') : (u('w') < 0.7 ? 'work_2' : 'work_1');
        out.push({
          id: 'p_' + name.toLowerCase().replace(/[^a-z]/g, ''), name, role, role_label: R.label, group: role,
          home: HOMES[role][i % HOMES[role].length], work,
          traits: {
            income_weekly: Math.round(R.income[0] + u('inc') * (R.income[1] - R.income[0])),
            fare_category: role === 'fair_pass' ? 'fair_pass' : 'adult',
            has_car: !!R.car,
          },
          pbus: R.pbus, errand_p: R.errand_p,
          pref_shop: u('shop') < 0.62 ? 'shop_1' : 'shop_2',
          deep_agent: DEEP.has(name),
          why_included: R.why,
          source_ids: role === 'fair_pass' || role === 'near_poor' ? ['s_fair', 's_profiles'] : ['s_profiles'],
          assumption_ids: role === 'near_poor' ? ['e_commute', 'e_errand', 'low_income_mult'] : ['e_commute', 'e_errand'],
        });
      });
    }
    return out;
  }

  const INSTITUTIONS = [
    { id: 'o_dev', name: 'Dev', role: 'local_retailer', role_label: 'Corner grocery owner', site: 'shop_1', deep_agent: true,
      why_included: 'Many customers arrive by bus or on foot, so foot traffic depends on transit trips.' },
    { id: 'o_lina', name: 'Lina', role: 'local_retailer', role_label: 'Café owner', site: 'shop_2', deep_agent: false,
      why_included: 'Small-ticket, walk-in business that is sensitive to errand trips.' },
    { id: 'o_priya', name: 'Priya', role: 'transit_budget', role_label: 'TTC budget planner', site: null, deep_agent: true,
      why_included: 'Owns the fiscal question: does a higher fare raise revenue once riders respond?' },
    { id: 'o_grace', name: 'Grace', role: 'employer', role_label: 'Distribution centre manager', site: 'work_2', deep_agent: false,
      why_included: 'Employs many lower-income riders; notices late arrivals if staff switch to walking.' },
  ];

  // ---------- simulation ----------
  const DEST_WORDS = { work_1: 'to the office', work_2: 'to the warehouse', shop_1: 'to the grocery', shop_2: 'to the café', plaza: 'to the plaza' };

  function reasonFor(p, purpose, mode, fare, baseFare, policy, extra) {
    const dest = DEST_WORDS[extra.to] || 'home';
    const f = '$' + fare.toFixed(2);
    if (p.traits.fare_category === 'fair_pass' && policy && mode === 'bus') return `My Fair Pass fare stays at ${f}, so I keep taking the bus ${dest}.`;
    if (mode === 'bus') return policy && fare > baseFare
      ? `The fare is now ${f}, but the bus is still my best way ${dest === 'home' ? 'home' : dest}.`
      : `The bus is my usual way ${dest} at ${f} a ride.`;
    if (mode === 'drive') return policy && fare > baseFare && p.traits.has_car
      ? `At ${f} a ride, driving ${dest} costs about the same and is faster.`
      : `I drive ${dest}; the car is right here.`;
    if (mode === 'walk') return policy && fare > baseFare
      ? `At ${f} a ride I walk ${dest} instead. It takes longer but saves money.`
      : `It is close enough to walk ${dest}.`;
    return extra.why || `I skipped the trip ${dest}. Another ${f} fare does not fit this week.`;
  }

  function simulate(params, seed, runKey, personas) {
    const P = Object.assign({}, DEFAULT_PARAMS, params);
    const events = [];
    let n = 0;
    const eid = () => `${runKey[0]}${String(++n).padStart(4, '0')}`;
    const policyEventId = runKey === 'intervention' ? 'i_policy' : null;
    if (runKey === 'intervention') {
      events.push({ id: 'i_policy', tick: P.policy_tick, t: P.policy_tick - 1, actor: 'city', action: 'policy_change', visual_cue: 'other',
        state_delta: { 'fare.adult': [FARE_ADULT, round(FARE_ADULT + P.fare_delta)], 'fare.fair_pass': [FARE_FAIR, FARE_FAIR] },
        reason: `Adult fare rises from $${FARE_ADULT.toFixed(2)} to $${(FARE_ADULT + P.fare_delta).toFixed(2)}. Fair Pass stays at $${FARE_FAIR.toFixed(2)}.`,
        evidence: 'scenario', source_ids: ['s_fare', 's_fair'] });
    }
    const shopWeek1 = {};
    let devCut = false;

    for (let tick = 1; tick <= P.horizon; tick++) {
      const T = tick - 1;
      const policy = runKey === 'intervention' && tick >= P.policy_tick;
      const shopSales = { shop_1: 0, shop_2: 0, plaza: 0 };
      const shopVisits = { shop_1: 0, shop_2: 0, plaza: 0 };
      let fares = 0, boardings = 0, late = 0, staff = 0;

      for (const p of personas) {
        const baseFare = p.traits.fare_category === 'fair_pass' ? FARE_FAIR : FARE_ADULT;
        const fare = policy && p.traits.fare_category === 'adult' ? FARE_ADULT + P.fare_delta : baseFare;
        const home = BY_ID[p.home].door;
        let loc = home, locId = p.home, carAt = p.traits.has_car ? p.home : null;
        let t = T + 0.02 + rnd(seed, p.id, tick, 'dep') * 0.06;
        let lastMode = null;

        const choose = (purpose, from, to) => {
          const e = (purpose === 'commute' ? P.e_commute : P.e_errand) * (p.group === 'near_poor' ? P.low_income_mult : 1);
          const pb = clamp(p.pbus[purpose] * (1 + e * (fare - baseFare) / baseFare), 0, 1);
          const u = rnd(seed, p.id, tick, purpose, 'mode');
          if (u < pb) return 'bus';
          if (carAt === locId) return 'drive';
          const walkD = pathLen(roadPath(from, to));
          if (purpose === 'commute' || walkD <= P.walk_max) return 'walk';
          return 'skip';
        };
        const travel = (purpose, toId, mode, why) => {
          const to = BY_ID[toId].door;
          let plan = planTrip(loc, to, mode, t);
          if (!plan) { mode = 'walk'; plan = planTrip(loc, to, 'walk', t); }
          const paid = mode === 'bus' ? fare : 0;
          if (mode === 'bus') { fares += paid; boardings++; }
          const ev = { id: eid(), tick, t: round(t, 4), actor: p.id, action: 'travel', purpose, mode,
            visual_cue: mode === 'bus' ? 'ride_bus' : mode, from: locId, to: toId, legs: plan.legs,
            duration: round(plan.tEnd - t, 4), fare_paid: round(paid),
            state_delta: { [`${p.id}.cash`]: -round(paid) },
            reason: why || reasonFor(p, purpose, mode, fare, baseFare, policy, { to: toId }),
            rule_id: 'mode_choice_v1', assumption_ids: [purpose === 'commute' ? 'e_commute' : 'e_errand'],
            evidence: 'simulated' };
          if (policyEventId && fare !== baseFare) ev.caused_by = [policyEventId];
          events.push(ev);
          if (mode === 'drive') carAt = toId;
          loc = to; locId = toId; t = plan.tEnd; lastMode = mode;
          return ev;
        };

        // commute
        if (p.work) {
          const mode = choose('commute', loc, BY_ID[p.work].door);
          travel('commute', p.work, mode);
          const isLate = t > T + P.late_after;
          if (p.work === 'work_2') { staff++; if (isLate) late++; }
          events.push({ id: eid(), tick, t: round(t, 4), actor: p.id, action: 'arrive_work', visual_cue: 'work', to: p.work, late: isLate,
            state_delta: isLate ? { [`${p.id}.late`]: 1 } : {}, reason: isLate ? 'Arrived after the shift started.' : 'Arrived on time.',
            evidence: 'simulated' });
          t = Math.max(t + 0.05, T + 0.5 + rnd(seed, p.id, tick, 'leave') * 0.05);
        } else {
          t = T + 0.24 + rnd(seed, p.id, tick, 'mid') * 0.12;
        }

        // errand
        if (rnd(seed, p.id, tick, 'errand') < p.errand_p) {
          let mode = choose('errand', loc, BY_ID[p.pref_shop].door);
          let shop = p.pref_shop;
          if (mode === 'drive' && rnd(seed, p.id, tick, 'plaza') < P.plaza_share) shop = 'plaza';
          if (mode === 'skip') {
            events.push({ id: eid(), tick, t: round(t, 4), actor: p.id, action: 'skip_trip', visual_cue: 'other', purpose: 'errand', from: locId, to: shop,
              state_delta: { [`${shop}.lost_visits`]: 1 }, reason: reasonFor(p, 'errand', 'skip', fare, baseFare, policy, { to: shop }),
              rule_id: 'mode_choice_v1', assumption_ids: ['e_errand'], evidence: 'simulated', caused_by: policyEventId && fare !== baseFare ? [policyEventId] : undefined });
          } else {
            const probe = planTrip(loc, BY_ID[shop].door, mode, t) || planTrip(loc, BY_ID[shop].door, 'walk', t);
            const homeBack = pathLen(roadPath(BY_ID[shop].door, home)) / SPEED[mode === 'bus' ? 'walk' : mode] * 0.6;
            if (probe.tEnd + 0.04 + homeBack > T + 0.96) {
              events.push({ id: eid(), tick, t: round(t, 4), actor: p.id, action: 'skip_trip', visual_cue: 'other', purpose: 'errand', from: locId, to: shop,
                state_delta: { [`${shop}.lost_visits`]: 1 }, reason: 'Ran out of time after a long trip, so the errand waits.',
                rule_id: 'time_budget_v1', assumption_ids: [], evidence: 'simulated' });
            } else {
              travel('errand', shop, mode);
              const spend = shop === 'plaza' ? P.spend_plaza : P.spend_local * (shop === 'shop_2' ? 0.55 : 1);
              shopSales[shop] += spend; shopVisits[shop]++;
              events.push({ id: eid(), tick, t: round(t, 4), actor: p.id, action: 'enter_shop', visual_cue: 'enter_shop', to: shop, spend: round(spend),
                state_delta: { [`${shop}.sales`]: round(spend), [`${p.id}.cash`]: -round(spend) },
                reason: `Bought groceries and essentials at ${BY_ID[shop].label}.`, rule_id: 'shop_visit_v1',
                assumption_ids: [shop === 'plaza' ? 'plaza_share' : 'spend_local'], evidence: 'simulated' });
              t += 0.035 + rnd(seed, p.id, tick, 'browse') * 0.03;
            }
          }
        }

        // return home: a car left somewhere must come back
        let mode = carAt && carAt === locId && carAt !== p.home ? 'drive' : (lastMode === 'drive' ? 'walk' : (lastMode || 'walk'));
        if (mode === 'bus' && planTrip(loc, home, 'bus', t) === null) mode = 'walk';
        travel('return', p.home, mode, mode === 'bus' || mode === 'drive' || mode === 'walk' ? undefined : undefined);
        events.push({ id: eid(), tick, t: round(t, 4), actor: p.id, action: 'enter_home', visual_cue: 'enter_home', to: p.home, state_delta: {}, reason: 'Home for the night.', evidence: 'simulated' });
      }

      // institutions at end of day
      const endT = T + 0.985;
      const W = P.scale * 5; // agents x residents x weekdays
      for (const sid of ['shop_1', 'shop_2']) {
        const weekly = shopSales[sid] * W;
        if (tick === 1) shopWeek1[sid] = weekly;
        events.push({ id: eid(), tick, t: round(endT, 4), actor: sid === 'shop_1' ? 'o_dev' : 'o_lina', action: 'sales_report', visual_cue: 'exchange', to: sid,
          state_delta: { [`${sid}.weekly_sales`]: round(weekly, 0), [`${sid}.visits_per_day`]: shopVisits[sid] * P.scale },
          reason: `${shopVisits[sid] * P.scale} customer visits a day, about $${Math.round(weekly).toLocaleString('en-CA')} this week.`, rule_id: 'accounting_v1',
          assumption_ids: ['spend_local', 'scale'], evidence: 'simulated' });
      }
      if (!devCut && tick > 1 && shopWeek1.shop_1 > 0 && shopSales.shop_1 * W < shopWeek1.shop_1 * (1 - P.shop_threshold)) {
        devCut = true;
        events.push({ id: eid(), tick, t: round(endT + 0.005, 4), actor: 'o_dev', action: 'reduce_hours', visual_cue: 'other', to: 'shop_1',
          state_delta: { 'shop_1.closes_at': ['22:00', '20:00'] },
          reason: `Sales are ${Math.round((1 - shopSales.shop_1 * W / shopWeek1.shop_1) * 100)}% below week 1, so I close at 8 pm instead of 10 pm.`,
          rule_id: 'shop_response_v1', assumption_ids: ['shop_threshold'], evidence: 'assumption' });
      }
      events.push({ id: eid(), tick, t: round(endT + 0.008, 4), actor: 'o_priya', action: 'revenue_report', visual_cue: 'exchange',
        state_delta: { 'ttc.weekly_fare_revenue': round(fares * W, 0), 'ttc.weekly_boardings': boardings * W },
        reason: `${(boardings * W).toLocaleString('en-CA')} boardings this week, $${Math.round(fares * W).toLocaleString('en-CA')} in fares from this district.`,
        rule_id: 'accounting_v1', assumption_ids: ['scale'], evidence: 'simulated' });
      events.push({ id: eid(), tick, t: round(endT + 0.01, 4), actor: 'o_grace', action: 'staff_report', visual_cue: 'exchange', to: 'work_2',
        state_delta: { 'work_2.late_arrivals': late * P.scale }, reason: `${late * P.scale} of ${staff * P.scale} staff arrived late on a typical day.`,
        rule_id: 'accounting_v1', assumption_ids: ['scale'], evidence: 'simulated' });
    }
    events.sort((a, b) => a.t - b.t);
    return { events, metrics: computeMetrics(events, personas, P) };
  }

  function computeMetrics(events, personas, P) {
    const W = P.scale * 5;
    const byTick = [];
    const pIndex = Object.fromEntries(personas.map(p => [p.id, p]));
    const groups = {};
    for (let tick = 1; tick <= P.horizon; tick++) {
      const m = { tick, bus_trips: 0, car_trips: 0, walk_trips: 0, skipped_trips: 0, fare_revenue: 0, shop_sales: 0, plaza_sales: 0, late_arrivals: 0, car_km: 0 };
      for (const e of events) {
        if (e.tick !== tick) continue;
        if (e.action === 'travel') {
          m[e.mode === 'bus' ? 'bus_trips' : e.mode === 'drive' ? 'car_trips' : 'walk_trips'] += W;
          m.fare_revenue += e.fare_paid * W;
          if (e.mode === 'drive') m.car_km += e.legs.reduce((s, l) => s + pathLen(l.path), 0) * 0.05 * W; // 1 world unit ≈ 50 m
          const g = pIndex[e.actor].group;
          groups[g] = groups[g] || {};
          const G = groups[g][tick] = groups[g][tick] || { trips: 0, fares: 0, skipped: 0, people: 0 };
          G.trips++; G.fares += e.fare_paid; if (e.mode === 'bus') G.bus = (G.bus || 0) + 1;
        }
        if (e.action === 'skip_trip') {
          m.skipped_trips += W;
          const g = pIndex[e.actor].group;
          groups[g] = groups[g] || {};
          const G = groups[g][tick] = groups[g][tick] || { trips: 0, fares: 0, skipped: 0, people: 0 };
          G.skipped++;
        }
        if (e.action === 'enter_shop') { if (e.to === 'plaza') m.plaza_sales += e.spend * W; else m.shop_sales += e.spend * W; }
        if (e.action === 'arrive_work' && e.late) m.late_arrivals += P.scale;
      }
      for (const k of Object.keys(m)) if (k !== 'tick') m[k] = Math.round(m[k]);
      byTick.push(m);
    }
    const by_group = {};
    for (const role of Object.keys(ROLES)) {
      const ps = personas.filter(p => p.group === role);
      const income = ps.reduce((s, p) => s + p.traits.income_weekly, 0);
      by_group[role] = byTick.map(({ tick }) => {
        const G = (groups[role] || {})[tick] || { trips: 0, fares: 0, skipped: 0 };
        return { tick, trips_per_week: round(G.trips * 5 / ps.length, 1), bus_per_week: round((G.bus || 0) * 5 / ps.length, 1), skipped_per_week: round(G.skipped * 5 / ps.length, 1),
          fare_burden_pct: round(G.fares * 5 / income * 100, 2) };
      });
    }
    return { by_tick: byTick, by_group };
  }

  function markDivergence(baseline, intervention) {
    const key = e => `${e.actor}|${e.tick}|${e.purpose}`;
    const base = new Map();
    for (const e of baseline.events) if (e.action === 'travel' || e.action === 'skip_trip') base.set(key(e), e);
    let count = 0;
    for (const e of intervention.events) {
      if (e.action !== 'travel' && e.action !== 'skip_trip') continue;
      const b = base.get(key(e));
      const bm = b ? (b.action === 'skip_trip' ? 'skip' : b.mode) : null;
      const im = e.action === 'skip_trip' ? 'skip' : e.mode;
      if (bm !== im || (b && b.to !== e.to)) {
        e.diverged = true; e.baseline_mode = bm; e.baseline_to = b ? b.to : null; count++;
        e.caused_by = ['i_policy'];
      }
    }
    return count;
  }

  function sum(metrics, k, fromTick) { return metrics.by_tick.filter(m => m.tick >= fromTick).reduce((s, m) => s + m[k], 0); }
  function weeks(P) { return P.horizon - P.policy_tick + 1; }

  function findings(base, int, variants, P, personas) {
    const w = weeks(P);
    const pct = (a, b) => b ? (a - b) / b * 100 : 0;
    const fmt$ = v => (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en-CA');
    const fmtP = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '%';
    const busB = sum(base.metrics, 'bus_trips', P.policy_tick), busI = sum(int.metrics, 'bus_trips', P.policy_tick);
    const revB = sum(base.metrics, 'fare_revenue', P.policy_tick) / w, revI = sum(int.metrics, 'fare_revenue', P.policy_tick) / w;
    const revLow = sum(variants.low.metrics, 'fare_revenue', P.policy_tick) / w, revHigh = sum(variants.high.metrics, 'fare_revenue', P.policy_tick) / w;
    const shopB = sum(base.metrics, 'shop_sales', P.policy_tick), shopI = sum(int.metrics, 'shop_sales', P.policy_tick);
    const carB = sum(base.metrics, 'car_trips', P.policy_tick), carI = sum(int.metrics, 'car_trips', P.policy_tick);
    const g = (run, role, k) => run.metrics.by_group[role].filter(x => x.tick >= P.policy_tick).reduce((s, x) => s + x[k], 0) / w;
        const npSkipB = g(base, 'near_poor', 'skipped_per_week'), npSkipI = g(int, 'near_poor', 'skipped_per_week');
    const npBurdenB = g(base, 'near_poor', 'fare_burden_pct'), npBurdenI = g(int, 'near_poor', 'fare_burden_pct');
    const fpB = g(base, 'fair_pass', 'fare_burden_pct'), fpI = g(int, 'fair_pass', 'fare_burden_pct');
    const lateB = sum(base.metrics, 'late_arrivals', P.policy_tick) / w, lateI = sum(int.metrics, 'late_arrivals', P.policy_tick) / w;
    const devCut = int.events.find(e => e.action === 'reduce_hours');
    const changed = int.events.filter(e => e.diverged);
    const ex = id => changed.filter(e => id(e)).slice(0, 4).map(e => e.id);
    const npBusB = g(base, 'near_poor', 'bus_per_week'), npBusI = g(int, 'near_poor', 'bus_per_week');
    const fpBusB = g(base, 'fair_pass', 'bus_per_week'), fpBusI = g(int, 'fair_pass', 'bus_per_week');
    const word = (v, up, down, same) => Math.abs(v) < 0.05 ? same : v > 0 ? up : down;
    return [
      { id: 'f_bus', kind: 'simulated', metric: 'bus_trips', headline: `Bus trips ${fmtP(pct(busI, busB))}`,
        text: `In this simulated district, weekly bus trips went from ${Math.round(busB / w).toLocaleString('en-CA')} to ${Math.round(busI / w).toLocaleString('en-CA')} after the fare rose.`,
        event_ids: ex(e => e.baseline_mode === 'bus'), assumption_ids: ['e_commute', 'e_errand'] },
      { id: 'f_rev', kind: 'simulated', metric: 'fare_revenue', headline: `Fare revenue ${fmt$(revI - revB)}/week`,
        text: `${revI >= revB ? 'The higher fare outweighs lost riders in this run' : 'Lost riders outweigh the higher fare in this run'}. Across the elasticity range the change runs from ${fmt$(Math.min(revHigh, revLow) - revB)} to ${fmt$(Math.max(revHigh, revLow) - revB)} a week.`,
        range: [Math.round(Math.min(revHigh, revLow) - revB), Math.round(Math.max(revHigh, revLow) - revB)], event_ids: [], assumption_ids: ['e_commute', 'e_errand', 'scale'] },
      { id: 'f_dist', kind: 'simulated', metric: 'fare_burden_pct', group: 'near_poor', headline: `Near-cutoff riders ${fmtP(pct(npBusI, npBusB))} bus trips`,
        text: `Riders just above the Fair Pass cutoff take ${Math.abs(npBusI - npBusB).toFixed(1)} ${word(npBusI - npBusB, 'more', 'fewer', 'the same number of')} bus trips a week and skip ${Math.max(0, npSkipI - npSkipB).toFixed(1)} more errands. Fares go from ${npBurdenB.toFixed(1)}% to ${npBurdenI.toFixed(1)}% of their income. Fair Pass riders stay at ${fpI.toFixed(1)}% and their bus use changes ${fmtP(pct(fpBusI, fpBusB))}.`,
        event_ids: ex(e => personas.find(p => p.id === e.actor).group === 'near_poor'), assumption_ids: ['e_errand', 'low_income_mult'] },
      { id: 'f_cars', kind: 'simulated', metric: 'car_trips', headline: `Car trips ${fmtP(pct(carI, carB))}`,
        text: carI > carB ? `Car owners who leave the bus drive instead, adding about ${Math.round((carI - carB) / w).toLocaleString('en-CA')} car trips a week.` : 'Car use barely moves; car owners mostly drove already.',
        event_ids: ex(e => e.mode === 'drive'), assumption_ids: ['e_commute'] },
      { id: 'f_shop', kind: 'assumption', metric: 'shop_sales', headline: `Local shop sales ${fmtP(pct(shopI, shopB))}`,
        text: `${shopI < shopB ? 'Skipped errands and drivers choosing the plaza pull sales away from the corner grocery and café.' : 'Local shops hold steady because most errands still happen on foot.'} This rests on the spending and plaza assumptions.`,
        event_ids: ex(e => e.purpose === 'errand'), assumption_ids: ['plaza_share', 'spend_local'] },
      { id: 'f_late', kind: 'simulated', metric: 'late_arrivals', headline: `Late arrivals ${lateI - lateB >= 0 ? '+' : '−'}${Math.abs(Math.round(lateI - lateB))}/day`,
        text: lateI > lateB ? 'Some warehouse staff walk instead of riding and reach work later. The employer notices before anyone measures ridership.' : 'Lateness at the warehouse does not rise in this run.',
        event_ids: ex(e => e.purpose === 'commute' && e.mode === 'walk'), assumption_ids: ['e_commute'] },
      devCut
        ? { id: 'f_hours', kind: 'assumption', headline: 'Grocery cuts evening hours', text: devCut.reason + ' This follows an assumed owner rule, not observed behaviour.', event_ids: [devCut.id], assumption_ids: ['shop_threshold'] }
        : { id: 'f_hours', kind: 'assumption', headline: 'Grocery keeps its hours', text: 'Sales never fell past the assumed threshold, so the owner kept regular hours.', event_ids: [], assumption_ids: ['shop_threshold'] },
      { id: 'f_spec', kind: 'speculation', headline: 'Could the grocery close?', text: 'Sustained losses might threaten a small shop, but closures are not modelled here. Treat this as a question to research, not a result.', event_ids: [], assumption_ids: [] },
    ];
  }

  function paramsFromAssumptions(list) {
    const P = {};
    for (const a of list) P[a.id] = a.status === 'rejected' ? a.neutral : a.value;
    return P;
  }

  function buildTrace(opts) {
    opts = opts || {};
    const seed = opts.seed ?? 42;
    const version = opts.version ?? 1;
    const assumptions = (opts.assumptions || ASSUMPTIONS).map(a => Object.assign({}, a));
    const P = Object.assign({}, DEFAULT_PARAMS, paramsFromAssumptions(assumptions));
    const personas = buildPersonas(seed);
    const baseline = simulate(P, seed, 'baseline', personas);
    const intervention = simulate(P, seed, 'intervention', personas);
    const diverged = markDivergence(baseline, intervention);
    const lowP = Object.assign({}, P, { e_commute: assumptions.find(a => a.id === 'e_commute').high, e_errand: assumptions.find(a => a.id === 'e_errand').high });
    const highP = Object.assign({}, P, { e_commute: assumptions.find(a => a.id === 'e_commute').low, e_errand: assumptions.find(a => a.id === 'e_errand').low });
    const variants = {
      low: simulate(lowP, seed, 'intervention', personas),   // weaker rider response
      high: simulate(highP, seed, 'intervention', personas), // stronger rider response
    };
    const sources = SOURCES.concat(opts.extra_sources || []);
    return {
      study_id: 'ttc-fare-050', version, seed, generated_by: 'demo rule engine (sim.js)',
      evidence_tier: 'assumption_driven',
      scenario: {
        question: 'What if the adult TTC fare rises by $0.50 next year, with Fair Pass unchanged?',
        geography: 'Toronto, sample west-end district', horizon_ticks: P.horizon, tick_unit: 'week (animated as a typical weekday)',
        intervention: [{ operator: 'change_cost', target: 'adult_transit_ride', delta: P.fare_delta, unit: 'CAD', starts_tick: P.policy_tick }],
        protected_groups: ['fair_pass'],
        outcomes: ['bus_trips', 'car_trips', 'skipped_trips', 'fare_revenue', 'shop_sales', 'fare_burden_pct', 'late_arrivals'],
        mechanisms: [
          { id: 'm1', from: 'fare', to: 'mode_choice', parameter_id: 'e_commute' },
          { id: 'm2', from: 'fare', to: 'errand_trips', parameter_id: 'e_errand' },
          { id: 'm3', from: 'mode_choice', to: 'shop_choice', parameter_id: 'plaza_share' },
          { id: 'm4', from: 'shop_sales', to: 'opening_hours', parameter_id: 'shop_threshold' },
          { id: 'm5', from: 'mode_choice', to: 'late_arrivals', parameter_id: null },
        ],
        missing_info: ['Fare elasticity measured in Toronto, by income band', 'How many riders sit just above the Fair Pass cutoff', 'Where car owners shop when they drive'],
      },
      stages: [
        { id: 'compile', label: 'Reading the hypothesis', ms: 1100 },
        { id: 'personas', label: 'Choosing who is affected', ms: 1300 },
        { id: 'world', label: 'Building the district', ms: 900 },
        { id: 'simulate', label: 'Running baseline and policy', ms: 1200 },
        { id: 'compare', label: 'Comparing outcomes', ms: 700 },
      ],
      sources, assumptions, human_inputs: opts.human_inputs || [],
      world: {
        size: 36, roads: ROADS, buildings: BUILDINGS, stops: STOPS,
        routes: [{ id: 'route_loop', type: 'bus', label: 'Route 29 loop', loop: [[0, 0], [36, 0], [36, 36], [0, 36]], length: LOOP_LEN, speed: SPEED.bus, buses: BUSES }],
        speeds: SPEED,
      },
      personas, institutions: INSTITUTIONS,
      runs: { baseline, intervention },
      variants: {
        elasticity_low: { label: 'Weaker rider response', params: { e_commute: lowP.e_commute, e_errand: lowP.e_errand }, intervention: { metrics: variants.low.metrics } },
        elasticity_high: { label: 'Stronger rider response', params: { e_commute: highP.e_commute, e_errand: highP.e_errand }, intervention: { metrics: variants.high.metrics } },
      },
      diverged_events: diverged,
      findings: findings(baseline, intervention, variants, P, personas),
      next_evidence: ['Toronto fare elasticity by income band (PRESTO tap data before and after past fare changes)', 'Count of residents just above the Fair Pass cutoff in this district', 'Point-of-sale data from local shops near stops'],
    };
  }

  const api = { buildTrace, ASSUMPTIONS, SOURCES, DEFAULT_PARAMS, loopPos, LOOP_LEN, FARE_ADULT, FARE_FAIR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CFSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
