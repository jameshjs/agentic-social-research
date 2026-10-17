/* Routed background traffic for the Bloor section. Cars and bikes enter at the
 * observed ends and at side streets, move link by link, queue at the stop lines
 * of the Bloor signals and discharge on green. Side-street exchange is fitted
 * once, under the observed street layout, so that far-end arrivals reproduce the
 * 2025-06-25 counts; Walmer/Robert turning shares (a different day) are used as
 * ratios, not totals. Policy runs reuse that fixed demand: background traffic
 * never changes its behaviour, only its queues and travel times. */
(function (root) {
  'use strict';

  const T0 = 6 * 3600, IV = 900, TAIL = 1800;
  const CRUISE_M_S = 8.3;            // assumption: 30 km/h average midblock speed (posted 40 km/h)
  const BIKE_M_S = 4.5;
  const SAT_HEADWAY_S = 2.0;         // assumption: 1,800 vehicles per hour of green per lane
  const BIKE_DISCHARGE_PER_S = 1.0;  // assumption: cycle-track stop line
  const BIKE_PCE = 0.5;              // assumption: a bike in a car lane uses half a car's discharge slot
  const FIT_ITERATIONS = 12;
  const DAMPING = 0.6;
  const WALMER_PX = 2083;
  const KINDS = ['car', 'bike'];

  function random(seed, ...parts) {
    const value = `${seed}|${parts.join('|')}`;
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  const secs = (s) => { const [h, m] = s.split(':').map(Number); return h * 3600 + m * 60; };
  const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  const hour = (t) => String(Math.floor(t / 3600)).padStart(2, '0');
  /* GEH statistic on hourly volumes; below 5 is the usual acceptance threshold for a calibrated model. */
  const geh = (m, c) => (m + c === 0 ? 0 : Math.sqrt((2 * (m - c) ** 2) / (m + c)));

  function demand(world) {
    return world.section_flows.intervals.map((f) => ({
      t: secs(f.start),
      eb: { car_in: f.eb_vehicles_in, car_out: f.eb_vehicles_arrive_spadina, bike_in: f.eb_bikes_approach_bathurst, bike_out: f.eb_bikes_arrive_spadina },
      wb: { car_in: f.wb_vehicles_in, car_out: f.wb_vehicles_arrive_bathurst, bike_in: f.wb_bikes_approach_spadina, bike_out: f.wb_bikes_arrive_bathurst },
    }));
  }

  /* Hourly Walmer/Robert turning shares relative to the Bloor approach volume (cars and trucks). */
  function walmerShares(world) {
    const c = world.counts.intersections.find((x) => x.px === WALMER_PX);
    if (!c) return null;
    const veh = (iv, a, t) => (iv[`${a}_cars_${t}`] || 0) + (iv[`${a}_truck_${t}`] || 0);
    const by = {};
    for (const iv of c.intervals) {
      const x = by[iv.start.slice(0, 2)] || (by[iv.start.slice(0, 2)] = { eb_app: 0, eb_in: 0, eb_out: 0, wb_app: 0, wb_in: 0, wb_out: 0 });
      x.eb_app += veh(iv, 'w', 'l') + veh(iv, 'w', 't') + veh(iv, 'w', 'r');
      x.eb_out += veh(iv, 'w', 'l') + veh(iv, 'w', 'r');
      x.eb_in += veh(iv, 'n', 'l') + veh(iv, 's', 'r');
      x.wb_app += veh(iv, 'e', 'l') + veh(iv, 'e', 't') + veh(iv, 'e', 'r');
      x.wb_out += veh(iv, 'e', 'l') + veh(iv, 'e', 'r');
      x.wb_in += veh(iv, 'n', 'r') + veh(iv, 's', 'l');
    }
    const hourly = {};
    for (const [h, x] of Object.entries(by)) hourly[h] = {
      eb: { in: x.eb_app ? x.eb_in / x.eb_app : 0, out: x.eb_app ? x.eb_out / x.eb_app : 0 },
      wb: { in: x.wb_app ? x.wb_in / x.wb_app : 0, out: x.wb_app ? x.wb_out / x.wb_app : 0 },
    };
    return { count_date: c.count_date, hourly };
  }

  function orderFor(world, dir) {
    const xs = world.bloor.intersections;
    return dir === 'eb' ? xs.map((_, i) => i) : xs.map((_, i) => xs.length - 1 - i);
  }

  /* Turn a net side-street gain per interval into entries and exit probabilities per leg. */
  function buildExchange(world, dir, kind, plan15, net, shares) {
    const xs = world.bloor.intersections;
    const order = orderFor(world, dir);
    const last = order.length - 1;
    const legsAtK = order.map((i, k) => (k === 0 || k === last ? 0 : xs[i].legs.length));
    const walmerK = order.findIndex((i) => xs[i].signal_px === WALMER_PX);
    const otherLegs = legsAtK.reduce((s, x, k) => s + (k === walmerK ? 0 : x), 0);
    return plan15.map((iv, q) => {
      const base = iv[dir][`${kind}_in`];
      const w = kind === 'car' && shares && shares.hourly[hour(iv.t)] ? shares.hourly[hour(iv.t)][dir] : { in: 0, out: 0 };
      const wIn = base * w.in, wOut = base * w.out;
      const residual = net[q] - (wIn - wOut);
      const entries = new Array(order.length).fill(0), exits = new Array(order.length).fill(0);
      if (walmerK > 0) { entries[walmerK] = wIn; exits[walmerK] = wOut; }
      legsAtK.forEach((legs, k) => {
        if (!legs || k === walmerK) return;
        if (residual > 0) entries[k] += residual * legs / otherLegs; else exits[k] += -residual * legs / otherLegs;
      });
      let flow = base;
      const exitProb = order.map((_, k) => {
        if (k === 0 || k === last) return 0;
        const p = flow > 0 ? Math.min(0.9, exits[k] / flow) : 0;
        flow = Math.max(0, flow - exits[k]) + entries[k];
        return p;
      });
      return { entries: entries.map((c, k) => ({ k, count: Math.round(c) })).filter((e) => e.count > 0), exitProb };
    });
  }

  /* One direction for one day: cars and bikes together, so that bikes in car lanes share car queues. */
  function simulateDirection({ world, plan, phaseAt, policy, seed, dir, plan15, exchange }) {
    const xs = world.bloor.intersections;
    const order = orderFor(world, dir);
    const last = order.length - 1;
    const pos = order.map((i) => xs[i].x);
    const mixed = policy.bloor_cycle_track === 'none';
    const lanes = policy.bloor_car_lanes_per_direction;
    const linkLen = pos.slice(0, -1).map((x, k) => Math.abs(pos[k + 1] - x));
    const signalAtK = order.map((i, k) => (k > 0 && xs[i].signal_px ? xs[i].signal_px : null));
    const n = plan15.length * IV + TAIL;
    const buckets = new Map();
    const push = (t, v) => { const s = Math.round(t); (buckets.get(s) || buckets.set(s, []).get(s)).push(v); };
    let id = 0;
    for (const kind of KINDS) {
      plan15.forEach((iv, q) => {
        const ends = Math.round(iv[dir][`${kind}_in`]);
        for (let j = 0; j < ends; j++) push(iv.t + (j + random(seed, dir, kind, 'end', q, j)) * IV / ends, { id: id++, kind, k: 0, fresh: true });
        for (const e of exchange[kind][q].entries) for (let j = 0; j < e.count; j++) push(iv.t + (j + random(seed, dir, kind, 'side', q, e.k, j)) * IV / e.count, { id: id++, kind, k: e.k, fresh: true });
      });
    }
    const group = (v) => (v.kind === 'bike' && !mixed ? 'track' : 'lane');
    const queues = order.map(() => ({ lane: [], track: [] }));
    const acc = order.map(() => ({ lane: 0, track: 0 }));
    const qLen = { car: signalAtK.map((px) => (px ? new Int16Array(n) : null)), bike: signalAtK.map((px) => (px ? new Int16Array(n) : null)) };
    const arrivals = { car: new Array(plan15.length).fill(0), bike: new Array(plan15.length).fill(0) };
    const delay = { car: 0, bike: 0 }, served = { car: 0, bike: 0 }, exited = { car: 0, bike: 0 }, entered = { car: 0, bike: 0 };
    const ivOf = (t) => Math.min(plan15.length - 1, Math.max(0, Math.floor((t - T0) / IV)));
    const advance = (v, k, t) => {
      if (k === last) { const q = Math.floor((t - T0) / IV); if (q >= 0 && q < plan15.length) arrivals[v.kind][q]++; return; }
      const speed = v.kind === 'car' ? CRUISE_M_S : BIKE_M_S;
      push(t + linkLen[k] / speed, { id: v.id, kind: v.kind, k: k + 1 });
    };
    for (let t = T0; t < T0 + n; t++) {
      const due = buckets.get(t);
      if (due) {
        buckets.delete(t);
        for (const v of due) {
          if (v.fresh) { if (v.k > 0) entered[v.kind]++; advance(v, v.k, t); continue; }                              // entered after this node's stop line
          if (v.k < last && random(seed, dir, v.kind, 'exit', v.id, v.k) < exchange[v.kind][ivOf(t)].exitProb[v.k]) { exited[v.kind]++; continue; }
          if (signalAtK[v.k]) { v.qt = t; queues[v.k][group(v)].push(v); } else advance(v, v.k, t);
        }
      }
      for (let k = 1; k <= last; k++) {
        const px = signalAtK[k];
        if (!px) continue;
        const green = phaseAt(plan, px, t).phase === 'bloor_green';
        for (const gName of ['lane', 'track']) {
          const Q = queues[k][gName];
          if (green) {
            acc[k][gName] += gName === 'track' ? BIKE_DISCHARGE_PER_S : lanes / SAT_HEADWAY_S;
            while (Q.length) {
              const cost = Q[0].kind === 'bike' ? (gName === 'track' ? 1 : BIKE_PCE) : 1;
              if (acc[k][gName] < cost) break;
              acc[k][gName] -= cost;
              const v = Q.shift(); delay[v.kind] += t - v.qt; served[v.kind]++;
              advance(v, k, t);
            }
            if (!Q.length) acc[k][gName] = Math.min(acc[k][gName], 1);
          } else acc[k][gName] = 0;
        }
        const idx = t - T0;
        if (idx < n) {
          let c = 0, b = 0;
          for (const v of queues[k].lane) v.kind === 'car' ? c++ : b++;
          qLen.car[k][idx] = c; qLen.bike[k][idx] = b + queues[k].track.length;
        }
      }
    }
    return { order, signalAtK, arrivals, qLen, exited, entered, mean_stop_line_delay_s: { car: round(served.car ? delay.car / served.car : 0), bike: round(served.bike ? delay.bike / served.bike : 0) } };
  }

  /* Fit side-street exchange under the observed layout (protected track, one lane, assumed signals). */
  function fitExchange(world, plan, phaseAt, seed) {
    const plan15 = demand(world);
    const shares = walmerShares(world);
    const observedPolicy = { bloor_cycle_track: 'protected', bloor_car_lanes_per_direction: 1 };
    const fitted = {};
    for (const dir of ['eb', 'wb']) {
      const net = Object.fromEntries(KINDS.map((kind) => [kind, plan15.map((iv) => iv[dir][`${kind}_out`] - iv[dir][`${kind}_in`])]));
      let exchange, sim;
      for (let it = 0; it < FIT_ITERATIONS; it++) {
        exchange = Object.fromEntries(KINDS.map((kind) => [kind, buildExchange(world, dir, kind, plan15, net[kind], shares)]));
        sim = simulateDirection({ world, plan, phaseAt, policy: observedPolicy, seed, dir, plan15, exchange });
        // Damped, smoothed correction: arrivals lag entries by a few minutes, so a raw per-interval
        // update makes the fitted exchange zigzag between neighbouring intervals.
        let worst = 0;
        for (const kind of KINDS) {
          const d = plan15.map((iv, q) => iv[dir][`${kind}_out`] - sim.arrivals[kind][q]);
          worst = Math.max(worst, ...d.map(Math.abs));
          const smooth = d.map((_, q) => (d[Math.max(0, q - 1)] + 2 * d[q] + d[Math.min(d.length - 1, q + 1)]) / 4);
          net[kind] = net[kind].map((x, q) => x + DAMPING * smooth[q]);
        }
        if (worst <= 2) break;
      }
      fitted[dir] = { exchange, net };
    }
    return { plan15, shares, fitted };
  }

  function calibrationTable(plan15, sims) {
    const out = {};
    for (const dir of ['eb', 'wb']) for (const kind of KINDS) {
      const obs = plan15.map((iv) => iv[dir][`${kind}_out`]);
      const sim = sims[dir].arrivals[kind];
      const hours = {};
      plan15.forEach((iv, q) => { const h = hour(iv.t); hours[h] = hours[h] || { observed: 0, simulated: 0 }; hours[h].observed += obs[q]; hours[h].simulated += sim[q]; });
      const g = Object.values(hours).map((x) => geh(x.simulated, x.observed));
      const totO = obs.reduce((a, b) => a + b, 0), totS = sim.reduce((a, b) => a + b, 0);
      out[`${dir}_${kind}`] = {
        target: `${kind}s reaching ${dir === 'eb' ? 'Spadina (west approach)' : 'Bathurst (east approach)'}`,
        observed_total: totO, simulated_total: totS, total_error_pct: round((100 * (totS - totO)) / totO, 2),
        share_hours_geh_below_5: round(g.filter((x) => x < 5).length / g.length, 3), max_hourly_geh: round(Math.max(...g), 2),
        max_15min_abs_error: Math.max(...obs.map((o, q) => Math.abs(o - sim[q]))),
        hourly: Object.fromEntries(Object.entries(hours).map(([h, x]) => [h, { ...x, geh: round(geh(x.simulated, x.observed), 2) }])),
      };
    }
    return out;
  }

  /* Walmer/Robert Bloor approach volumes on their own day: a cross-check, not a fit target. */
  function walmerCrossCheck(world) {
    const c = world.counts.intersections.find((x) => x.px === WALMER_PX);
    if (!c) return null;
    const f = world.section_flows.intervals;
    const app = (a) => c.intervals.reduce((s, iv) => s + ['l', 't', 'r'].reduce((u, t) => u + (iv[`${a}_cars_${t}`] || 0) + (iv[`${a}_truck_${t}`] || 0), 0), 0);
    return {
      walmer_count_date: c.count_date, section_count_date: world.section_flows.count_date,
      eb_at_walmer: app('w'), eb_section_ends_mean: Math.round(f.reduce((s, x) => s + (x.eb_vehicles_in + x.eb_vehicles_arrive_spadina) / 2, 0)),
      wb_at_walmer: app('e'), wb_section_ends_mean: Math.round(f.reduce((s, x) => s + (x.wb_vehicles_in + x.wb_vehicles_arrive_bathurst) / 2, 0)),
      note: 'October and June counts differ by more than the side-street exchange, so Walmer turning shares are used as ratios only and its volumes are not a fit target.',
    };
  }

  /* fit: the result of fitExchange (reuse it across policy runs so demand stays fixed). */
  function simulateBackground(world, policy, plan, phaseAt, { seed = 1, fit } = {}) {
    const f = fit || fitExchange(world, plan, phaseAt, seed);
    const sims = {};
    for (const dir of ['eb', 'wb']) sims[dir] = simulateDirection({ world, plan, phaseAt, policy, seed, dir, plan15: f.plan15, exchange: f.fitted[dir].exchange });
    return {
      status: 'calibrated_background',
      count_date: world.section_flows.count_date,
      window: ['06:00', '20:00'],
      fit: f,
      assumptions: {
        cruise_speed_m_s: CRUISE_M_S, bike_speed_m_s: BIKE_M_S, saturation_headway_s: SAT_HEADWAY_S,
        bike_discharge_per_s: BIKE_DISCHARGE_PER_S, bike_pce_in_car_lane: BIKE_PCE,
        side_streets: 'Walmer/Robert uses its observed hourly turning shares. The rest of the net exchange per 15 minutes is split equally across the other side-street legs, as entries only or exits only (minimum exchange), and fitted so far-end arrivals match the counts.',
        policy_response: 'Background demand is identical in every policy run; only capacity, queues and travel time change. Behavioural responses belong to agents.',
      },
      calibration: calibrationTable(f.plan15, sims),
      walmer_cross_check: walmerCrossCheck(world),
      mean_stop_line_delay_s: { eb: sims.eb.mean_stop_line_delay_s, wb: sims.wb.mean_stop_line_delay_s },
      sims,
      /* Vehicles (or bikes) queued at the Bloor stop line of an intersection at time t. */
      queueAt(dir, kind, intersection, t) {
        const s = sims[dir];
        const k = s.order.indexOf(intersection);
        const q = k >= 0 ? s.qLen[kind][k] : null;
        const i = Math.floor(t - T0);
        return q && i >= 0 && i < q.length ? q[i] : 0;
      },
    };
  }

  const api = { simulateBackground, fitExchange, geh, CRUISE_M_S, SAT_HEADWAY_S, BIKE_PCE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BloorBackground = api;
})(typeof window !== 'undefined' ? window : null);
