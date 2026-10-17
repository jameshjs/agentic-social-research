/* Bloor St W section sandbox: a rule-enforcing street graph built from
 * data/world/bloor_spadina_bathurst.json. Background traffic comes from observed
 * counts; only foreground agents move through validated actions. The Game
 * Master (`step`) rejects any move that breaks a rule and logs every event. */
(function (root) {
  'use strict';

  const Y = { car: 3, track: 7, sidewalk: 12, portal: 150 };   // schematic cross-section, metres north (+) / south (-)
  const SPEED = { walk: 1.2, crossing: 1.0, bike: 4.5, car: 11.1 };
  const CORNER = 8;
  const LANE_CAPACITY_VPH = 900;                                 // assumption: urban arterial lane, before green share
  const MODES = ['walk', 'bike', 'car', 'transit'];

  function random(seed, ...parts) {
    const value = `${seed}|${parts.join('|')}`;
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

  const DEFAULT_POLICY = {
    bloor_cycle_track: 'protected', bloor_car_lanes_per_direction: 1, on_street_parking: true,
    signal_cycle_s: 90, bloor_green_share: 0.56, adult_fare_cad: 3.30, line2_headway_multiplier: 1.0,
  };

  /* ---------- signals ---------- */
  function signalPlan(world, policy) {
    const base = world.signal_timing;
    const cycle = policy.signal_cycle_s;
    const usable = cycle - 12;                                  // two 6 s clearances
    const bloorGreen = Math.round(usable * policy.bloor_green_share);
    const offsets = base.offset_s_by_px;
    const walkAlong = Math.min(bloorGreen - 6, 20), walkAcross = Math.min(usable - bloorGreen - 6, 12);
    return {
      cycle, bloorGreen, crossStart: bloorGreen + 6, crossGreen: usable - bloorGreen,
      offset: (px) => offsets[String(px)] || 0, walkAlong, walkAcross,
    };
  }

  function phaseAt(plan, px, t) {
    const c = ((t + plan.offset(px)) % plan.cycle + plan.cycle) % plan.cycle;
    if (c < plan.bloorGreen) return { phase: 'bloor_green', c, walk: c < plan.walkAlong ? 'along_bloor' : null };
    if (c < plan.crossStart) return { phase: 'bloor_clearance', c, walk: null };
    if (c < plan.crossStart + plan.crossGreen) {
      const k = c - plan.crossStart;
      return { phase: 'cross_green', c, walk: k < plan.walkAcross ? 'across_bloor' : null };
    }
    return { phase: 'cross_clearance', c, walk: null };
  }

  /* Seconds from t until the gate opens (0 if open now). */
  function gateWait(plan, gate, t) {
    if (!gate) return 0;
    for (let k = 0; k < plan.cycle; k++) {
      const p = phaseAt(plan, gate.px, t + k);
      const open = gate.kind === 'walk' ? p.walk === gate.movement : p.phase === gate.movement;
      if (open) return k;
    }
    return plan.cycle;
  }

  /* ---------- graph ---------- */
  function buildGraph(world, policy) {
    const L = world.frame.section_length_m;
    const nodes = new Map(), edges = new Map(), out = new Map();
    const addNode = (id, x, y, kind, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, x: round(x), y: round(y), kind, ...extra }); out.has(id) || out.set(id, []); return id; };
    const addEdge = (id, from, to, modes, extra = {}) => {
      const a = nodes.get(from), b = nodes.get(to);
      const e = { id, from, to, modes, length: round(extra.length ?? Math.hypot(b.x - a.x, b.y - a.y)), ...extra };
      edges.set(id, e); out.get(from).push(id); return e;
    };
    const both = (id, a, b, modes, extra = {}) => { addEdge(`${id}>`, a, b, modes, extra); addEdge(`${id}<`, b, a, modes, extra); };

    const xs = world.bloor.intersections;
    const crossings = world.crosswalks.items.filter((c) => c.crosses_bloor);
    const track = policy.bloor_cycle_track;
    const bikeOnCarLanes = track === 'none';

    // Sidewalk stops (corners, doors, station entrances) per side, sorted by x.
    const stops = { north: [], south: [] };
    xs.forEach((n, i) => {
      for (const side of ['north', 'south']) {
        const sy = side === 'north' ? Y.sidewalk : -Y.sidewalk;
        stops[side].push(addNode(`sw_${side}_${i}_w`, n.x - CORNER, sy, 'corner', { intersection: i }));
        stops[side].push(addNode(`sw_${side}_${i}_e`, n.x + CORNER, sy, 'corner', { intersection: i }));
        // Crossing the side street while walking along Bloor.
        const gate = n.signal_px ? { px: n.signal_px, kind: 'walk', movement: 'along_bloor' } : null;
        const hasLeg = n.legs.some((l) => l.endsWith(`|${side}`));
        if (hasLeg) both(`xw_side_${side}_${i}`, `sw_${side}_${i}_w`, `sw_${side}_${i}_e`, ['walk'], { crosswalk: 'side_street', gate, speed: SPEED.crossing });
        else both(`sw_corner_${side}_${i}`, `sw_${side}_${i}_w`, `sw_${side}_${i}_e`, ['walk']);
      }
    });
    // Doors for Bloor-facing businesses (one door per building).
    const doors = new Map();
    for (const b of world.businesses.items) {
      if (!b.on_bloor || b.category === 'vacant' || b.x < 0 || b.x > L) continue;
      const key = b.building_id || b.id;
      if (!doors.has(key)) {
        const id = addNode(`door_${key}`, b.x, b.side === 'north' ? Y.sidewalk : -Y.sidewalk, 'door', { building_id: b.building_id, side: b.side, business_ids: [] });
        doors.set(key, id); stops[b.side].push(id);
      }
      nodes.get(doors.get(key)).business_ids.push(b.id);
    }
    // Subway stations: entrances sit on the sidewalk on their side of Bloor.
    for (const st of world.transit.stations) {
      addNode(`stn_${st.id}`, st.entrances.reduce((s, e) => s + e.x, 0) / st.entrances.length, 0, 'station', { station: st.id });
      for (const [k, e] of st.entrances.entries()) {
        const side = e.y > 0 ? 'north' : 'south';
        const x = Math.max(-CORNER, Math.min(L + CORNER, e.x));
        const id = addNode(`ent_${st.id}_${k}`, x, side === 'north' ? Y.sidewalk : -Y.sidewalk, 'entrance', { station: st.id, name: e.name, side });
        stops[side].push(id);
        both(`stairs_${st.id}_${k}`, id, `stn_${st.id}`, ['walk', 'transit'], { length: 40 + Math.abs(e.y), note: 'entrance to platform, assumed 40 m plus setback' });
      }
    }
    for (const side of ['north', 'south']) {
      const list = [...new Set(stops[side])].sort((a, b) => nodes.get(a).x - nodes.get(b).x);
      for (let k = 0; k + 1 < list.length; k++) {
        const a = nodes.get(list[k]), b = nodes.get(list[k + 1]);
        if (a.intersection !== undefined && a.intersection === b.intersection) continue;   // corner pair handled above
        both(`sw_${side}_${list[k]}_${list[k + 1]}`, list[k], list[k + 1], ['walk', 'transit']);
      }
    }
    // Crosswalks across Bloor: only where the City pedestrian network has one.
    for (const c of crossings) {
      const i = xs.findIndex((n) => n.signal_px === c.px);
      if (i < 0) continue;
      const leg = (c.a[0] + c.b[0]) / 2 < xs[i].x ? 'w' : 'e';
      both(`xw_bloor_${i}_${leg}`, `sw_north_${i}_${leg}`, `sw_south_${i}_${leg}`, ['walk', 'transit'],
        { crosswalk: 'across_bloor', length: c.length_m, gate: { px: c.px, kind: 'walk', movement: 'across_bloor' }, speed: SPEED.crossing });
    }
    // Car lanes and cycle tracks along Bloor; vehicles stop at the stop line of a signalized intersection.
    const lanes = policy.bloor_car_lanes_per_direction;
    xs.forEach((n, i) => {
      addNode(`car_eb_${i}`, n.x, -Y.car, 'lane'); addNode(`car_wb_${i}`, n.x, Y.car, 'lane');
      if (!bikeOnCarLanes) { addNode(`trk_eb_${i}`, n.x, -Y.track, 'track'); addNode(`trk_wb_${i}`, n.x, Y.track, 'track'); }
    });
    for (let i = 0; i + 1 < xs.length; i++) {
      const gEb = xs[i + 1].signal_px ? { px: xs[i + 1].signal_px, kind: 'vehicle', movement: 'bloor_green', at: 'end' } : null;
      const gWb = xs[i].signal_px ? { px: xs[i].signal_px, kind: 'vehicle', movement: 'bloor_green', at: 'end' } : null;
      addEdge(`car_eb_${i}`, `car_eb_${i}`, `car_eb_${i + 1}`, bikeOnCarLanes ? ['car', 'bike'] : ['car'], { gate: gEb, lanes, direction: 'eb', parking: policy.on_street_parking });
      addEdge(`car_wb_${i}`, `car_wb_${i + 1}`, `car_wb_${i}`, bikeOnCarLanes ? ['car', 'bike'] : ['car'], { gate: gWb, lanes, direction: 'wb', parking: policy.on_street_parking });
      if (!bikeOnCarLanes) {
        addEdge(`trk_eb_${i}`, `trk_eb_${i}`, `trk_eb_${i + 1}`, ['bike'], { gate: gEb, protected: track === 'protected', direction: 'eb' });
        addEdge(`trk_wb_${i}`, `trk_wb_${i + 1}`, `trk_wb_${i}`, ['bike'], { gate: gWb, protected: track === 'protected', direction: 'wb' });
      }
    }
    // Side-street portals: where people, bikes and cars enter or leave the section.
    xs.forEach((n, i) => {
      for (const leg of n.legs) {
        const [street, , side] = leg.split('|');
        const sy = side === 'north' ? Y.portal : -Y.portal;
        const p = addNode(`portal_${side}_${i}`, n.x, sy, 'portal', { street, side, intersection: i });
        both(`walk_${p}`, p, `sw_${side}_${i}_${side === 'north' ? 'w' : 'e'}`, ['walk', 'transit']);
        const gate = n.signal_px ? { px: n.signal_px, kind: 'vehicle', movement: 'cross_green', at: 'end' } : null;
        for (const dir of ['eb', 'wb']) {
          addEdge(`in_car_${p}_${dir}`, p, `car_${dir}_${i}`, ['car', 'bike'], { gate, side_street: street });
          addEdge(`out_car_${p}_${dir}`, `car_${dir}_${i}`, p, ['car', 'bike'], { side_street: street });
          if (!bikeOnCarLanes) {
            addEdge(`in_trk_${p}_${dir}`, p, `trk_${dir}_${i}`, ['bike'], { gate, side_street: street });
            addEdge(`out_trk_${p}_${dir}`, `trk_${dir}_${i}`, p, ['bike'], { side_street: street });
          }
        }
      }
    });
    // Line 2 between the two stations.
    const run = world.transit.line2_run_seconds;
    addEdge('line2_eb', 'stn_bathurst', 'stn_spadina', ['transit'], { transit: { route: '2', platform_dir: 'Eastbound' }, fixed_seconds: run.eastbound_bathurst_to_spadina_median });
    addEdge('line2_wb', 'stn_spadina', 'stn_bathurst', ['transit'], { transit: { route: '2', platform_dir: 'Westbound' }, fixed_seconds: run.westbound_spadina_to_bathurst_median });
    return { nodes, edges, out, doors };
  }

  /* ---------- background flow (observed counts, not agents) ---------- */
  function flowAt(world, t) {
    const iv = world.section_flows.intervals;
    const start = (s) => { const [h, m] = s.split(':').map(Number); return h * 3600 + m * 60; };
    let cur = null;
    for (const x of iv) if (start(x.start) <= t) cur = x;
    return cur;
  }

  function carEdgeSeconds(world, policy, plan, edge, t) {
    if (!edge.lanes) return edge.length / SPEED.car;          // side-street links: no observed volume, free flow
    const f = flowAt(world, t);
    const vph = f ? 4 * (edge.direction === 'eb' ? f.eb_vehicles_in : f.wb_vehicles_in) : 0;
    const cap = LANE_CAPACITY_VPH * edge.lanes * (plan.bloorGreen / plan.cycle) * (edge.parking ? 0.95 : 1);
    const free = edge.length / SPEED.car;
    return free * (1 + 0.15 * (vph / cap) ** 4);           // BPR volume-delay function
  }

  /* ---------- transit ---------- */
  function nextDeparture(world, policy, edge, t) {
    const st = world.transit.stations.find((s) => `stn_${s.id}` === edge.from);
    const plat = st.platforms.find((p) => p.route === edge.transit.route && p.name.includes(edge.transit.platform_dir));
    for (let h = Math.floor(t / 3600); h < 28; h++) {
      const n = plat.trips_by_hour[String(h)];
      if (!n) continue;
      const headway = (3600 / n) * policy.line2_headway_multiplier;
      const first = h * 3600;
      const k = Math.max(0, Math.ceil((t - first) / headway));
      const dep = first + k * headway;
      if (dep < first + 3600) return { at: dep, headway: round(headway) };
    }
    return null;
  }

  /* ---------- routing ---------- */
  function edgeSeconds(world, policy, plan, g, edge, mode, t) {
    if (edge.transit) { const d = nextDeparture(world, policy, edge, t); return d ? d.at - t + edge.fixed_seconds : Infinity; }
    let s;
    if (mode === 'car') s = carEdgeSeconds(world, policy, plan, edge, t);
    else if (mode === 'bike') s = edge.modes.includes('car') ? Math.max(edge.length / SPEED.bike, carEdgeSeconds(world, policy, plan, edge, t)) : edge.length / SPEED.bike;
    else s = edge.length / (edge.speed || SPEED.walk);
    const g8 = edge.gate;
    if (g8 && g8.at === 'end') return s + gateWait(plan, g8, t + s);
    return gateWait(plan, g8, t) + s;
  }

  function allowed(edge, mode) {
    return mode === 'transit' ? edge.modes.includes('transit') || edge.modes.includes('walk') : edge.modes.includes(mode);
  }

  function route(world, policy, plan, g, from, to, mode, t0) {
    const best = new Map([[from, t0]]), prev = new Map(), done = new Set();
    const queue = [[t0, from]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [t, n] = queue.shift();
      if (done.has(n)) continue;
      done.add(n);
      if (n === to) break;
      for (const eid of g.out.get(n) || []) {
        const e = g.edges.get(eid);
        if (!allowed(e, mode)) continue;
        const nt = t + edgeSeconds(world, policy, plan, g, e, mode, t);
        if (nt < (best.get(e.to) ?? Infinity)) { best.set(e.to, nt); prev.set(e.to, eid); queue.push([nt, e.to]); }
      }
    }
    if (!best.has(to)) return null;
    const path = [];
    for (let n = to; n !== from; n = g.edges.get(prev.get(n)).from) path.unshift(prev.get(n));
    return { path, arrive: best.get(to) };
  }

  /* ---------- the Game Master ---------- */
  function createSandbox(world, options = {}) {
    const policy = { ...DEFAULT_POLICY, ...(options.policy || {}) };
    for (const k of Object.keys(options.policy || {})) if (!(k in DEFAULT_POLICY)) throw new Error(`Unknown policy lever ${k}`);
    if (!['protected', 'painted', 'none'].includes(policy.bloor_cycle_track)) throw new Error('bloor_cycle_track must be protected, painted or none');
    const plan = signalPlan(world, policy);
    const g = buildGraph(world, policy);
    const seed = options.seed ?? 1;
    const events = [];
    const agents = new Map();
    const log = (e) => { events.push(e); return e; };

    function addAgent(a) {
      if (!g.nodes.has(a.at)) throw new Error(`Unknown start node ${a.at}`);
      if (!MODES.includes(a.mode)) throw new Error(`Unknown mode ${a.mode}`);
      agents.set(a.id, { cash_cad: 0, fares_paid: 0, ...a, t: a.t ?? options.start_s ?? 8 * 3600, log: [] });
      log({ t: agents.get(a.id).t, type: 'agent_spawned', actor: a.id, node: a.at, mode: a.mode });
    }

    /* Validate and apply one move along an edge. Returns the committed event or a rejection. */
    function move(agentId, edgeId) {
      const a = agents.get(agentId), e = g.edges.get(edgeId);
      const reject = (reason) => log({ t: a.t, type: 'action_rejected', actor: agentId, edge: edgeId, reason });
      if (!e) return reject('no_such_edge');
      if (e.from !== a.at) return reject('not_adjacent');                       // no teleporting
      if (!allowed(e, a.mode)) return reject(`mode_not_permitted:${a.mode}`);      // sidewalks for walkers, tracks for bikes...
      if (e.transit && a.mode !== 'transit') return reject('transit_requires_transit_mode');
      const t0 = a.t;
      let wait = 0, fare = 0, travel;
      if (e.transit) {
        const d = nextDeparture(world, policy, e, t0);
        if (!d) return reject('no_scheduled_departure');
        wait = d.at - t0; travel = e.fixed_seconds;
        if (!a.paid_this_trip) { fare = a.fare_cad ?? policy.adult_fare_cad; a.paid_this_trip = true; a.fares_paid += fare; a.cash_cad -= fare; }
      } else {
        const g8 = e.gate;
        const base = a.mode === 'car' ? carEdgeSeconds(world, policy, plan, e, t0)
          : a.mode === 'bike' ? (e.modes.includes('car') ? Math.max(e.length / SPEED.bike, carEdgeSeconds(world, policy, plan, e, t0)) : e.length / SPEED.bike)
          : e.length / (e.speed || SPEED.walk);
        if (g8 && g8.at !== 'end') wait = gateWait(plan, g8, t0);                 // pedestrians start crossing only on walk
        travel = base;
        if (g8 && g8.at === 'end') wait = gateWait(plan, g8, t0 + base);          // vehicles wait at the stop line
      }
      a.t = t0 + wait + travel; a.at = e.to;
      const ev = log({ t: round(t0), type: 'moved', actor: agentId, edge: edgeId, mode: a.mode, from: e.from, to: e.to, length_m: e.length,
        wait_s: round(wait), travel_s: round(travel), arrive_t: round(a.t),
        shared_with_cars: a.mode === 'bike' && e.modes.includes('car') && !e.side_street ? true : undefined,
        crosswalk: e.crosswalk, fare_cad: fare || undefined });
      a.log.push(ev);
      return ev;
    }

    function enter(agentId, businessId) {
      const a = agents.get(agentId), n = g.nodes.get(a.at);
      if (n.kind !== 'door' || !n.business_ids.includes(businessId)) return log({ t: a.t, type: 'action_rejected', actor: agentId, reason: 'not_at_business_door', business: businessId });
      return log({ t: round(a.t), type: 'entered_business', actor: agentId, business: businessId, node: a.at });
    }

    /* Default rule-following policy: shortest-time legal path. A persona's decide() may replace the mode or destination. */
    function travel(agentId, to) {
      const a = agents.get(agentId);
      const r = route(world, policy, plan, g, a.at, to, a.mode, a.t);
      if (!r) return log({ t: a.t, type: 'trip_infeasible', actor: agentId, to, mode: a.mode });
      a.paid_this_trip = false;
      const start = a.t, from = a.at;
      for (const eid of r.path) { const ev = move(agentId, eid); if (ev.type !== 'moved') return ev; }
      const legs = a.log.filter((ev) => ev.t >= start);
      return log({ t: round(start), type: 'trip_completed', actor: agentId, from, to, mode: a.mode, duration_s: round(a.t - start),
        wait_s: round(legs.reduce((s, e) => s + e.wait_s, 0)), distance_m: round(legs.reduce((s, e) => s + (e.edge.startsWith('line2') ? 0 : e.length_m), 0)),
        shared_with_cars_m: round(legs.filter((e) => e.shared_with_cars).reduce((s, e) => s + e.length_m, 0)), fare_cad: round(legs.reduce((s, e) => s + (e.fare_cad || 0), 0), 2) });
    }

    return {
      policy, plan, graph: g, events, agents, addAgent, move, enter, travel,
      signalAt: (px, t) => phaseAt(plan, px, t),
      flowAt: (t) => flowAt(world, t),
      rand: (...parts) => random(seed, ...parts),
    };
  }

  /* Baseline sanity check: does flow entering one end reach the other end in the observed amounts? */
  function calibrationReport(world) {
    const rows = world.section_flows.intervals;
    const hourly = {};
    for (const r of rows) {
      const h = r.start.slice(0, 2);
      hourly[h] = hourly[h] || { eb_in: 0, eb_out: 0, wb_in: 0, wb_out: 0, bike_eb_in: 0, bike_eb_out: 0, bike_wb_in: 0, bike_wb_out: 0 };
      const x = hourly[h];
      x.eb_in += r.eb_vehicles_in; x.eb_out += r.eb_vehicles_arrive_spadina; x.wb_in += r.wb_vehicles_in; x.wb_out += r.wb_vehicles_arrive_bathurst;
      x.bike_eb_in += r.eb_bikes_approach_bathurst; x.bike_eb_out += r.eb_bikes_arrive_spadina; x.bike_wb_in += r.wb_bikes_approach_spadina; x.bike_wb_out += r.wb_bikes_arrive_bathurst;
    }
    const total = (k) => Object.values(hourly).reduce((s, x) => s + x[k], 0);
    const gap = (a, b) => round(100 * (total(b) - total(a)) / total(a));
    return {
      date: world.section_flows.count_date, hourly,
      net_side_street_gain_pct: { eb_vehicles: gap('eb_in', 'eb_out'), wb_vehicles: gap('wb_in', 'wb_out'), eb_bikes: gap('bike_eb_in', 'bike_eb_out'), wb_bikes: gap('bike_wb_in', 'bike_wb_out') },
      note: 'Difference between what enters one end and what reaches the other is the net exchange with the six minor cross streets. A routed background model should reproduce it before policy runs are compared.',
    };
  }

  const api = { createSandbox, calibrationReport, signalPlan, phaseAt, DEFAULT_POLICY, SPEED, hms };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BloorSandbox = api;
})(typeof window !== 'undefined' ? window : null);
