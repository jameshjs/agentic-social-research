/* Canonical paired runner on the mapped Bathurst–Spadina section.
 * James's sandbox (world/sandbox.js) is the Game Master: every move, wait,
 * crosswalk, subway boarding, fare and shop entry is validated there. This file
 * only chooses among legal options, commits WorldEvents, and reduces metrics
 * from those events. Both prepared policies use the same people and seed. */
(function (root) {
  'use strict';

  const Sandbox = typeof module !== 'undefined' && module.exports ? require('../world/sandbox.js') : root.BloorSandbox;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const r1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
  const hms = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  const parseHM = (v) => { const [h, m] = String(v).split(':').map(Number); if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error(`Bad time ${v}`); return h * 3600 + m * 60; };
  const CUE = { walk: 'walk', bike: 'ride_bike', car: 'drive', transit: 'ride_subway' };
  const BLOOR_EDGE = /^(car|trk)_(eb|wb)_\d+$/;
  const CHOICE_NOISE = .8;   // width of the fixed, seeded per-choice variation (synthetic)

  function random(seed, ...parts) {
    const value = `${seed}|${parts.join('|')}`;
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  const METRIC_DEFINITIONS = [
    ['completed_trips', 'Completed sample trips', 'trips', 'sum'],
    ['transit_trips', 'Sample TTC trips', 'trips', 'sum'],
    ['bike_trips', 'Sample cycling trips', 'trips', 'sum'],
    ['bloor_bike_trips', 'Sample cycling trips on Bloor', 'trips', 'sum'],
    ['car_trips', 'Sample car trips', 'trips', 'sum'],
    ['walk_trips', 'Sample walking trips', 'trips', 'sum'],
    ['deferred_trips', 'Deferred sample trips', 'trips', 'sum'],
    ['line2_rides', 'Line 2 rides inside the section', 'rides', 'sum'],
    ['bloor_shared_cycling_m', 'Cycling distance shared with cars on Bloor (exposure, not injuries)', 'metres', 'sum'],
    ['local_shop_visits', 'Visits to focal Bloor shops', 'visits', 'sum'],
    ['shop_sales_cad', 'Focal shop receipts', 'CAD', 'sum'],
    ['errands_elsewhere', 'Errands moved outside the section', 'trips', 'sum'],
    ['fare_revenue_cad', 'Sample TTC fare receipts', 'CAD', 'sum'],
    ['household_fare_spend_cad', 'Household fare spending', 'CAD', 'sum'],
    ['household_transport_spend_cad', 'Household recorded transport spending', 'CAD', 'sum'],
    ['household_shopping_spend_cad', 'Household spending at focal Bloor shops', 'CAD', 'sum'],
    ['cyclist_mapped_minutes', 'Mean in-section minutes per Bloor cycling leg', 'minutes', 'mean'],
    ['driver_mapped_minutes', 'Mean in-section minutes per car leg', 'minutes', 'mean'],
    ['shops_reduced_hours', 'Focal shops on reduced hours next period', 'shops', 'sum'],
  ].map(([id, label, unit, aggregation]) => ({ id, label, unit, aggregation, status: 'assumption_driven', time_grain: 'modelled weekday' }));

  const NOT_ESTIMABLE = [
    ['citywide_ttc_revenue_cad', 'Nineteen synthetic people have no representative weights; section results cannot be scaled to the TTC.'],
    ['business_closures', 'OSM supplies presence only; there is no sales, cost or survival model.'],
    ['injuries', 'Shared-with-cars distance is exposure; no conflict or injury model is attached.'],
    ['emissions_kg', 'No fleet, trip-length or substitution emissions model.'],
    ['gdp_cad', 'No economy-wide accounting model.'],
    ['driver_time_beyond_section', 'Car time is simulated only inside the 619 m section from observed entry flows.'],
    ['removal_construction_cost_cad', 'No Bathurst–Spadina construction plan or cost; the City multi-corridor estimate does not apply to this segment.'],
  ].map(([id, reason]) => ({ id, status: 'not_estimable', value: null, reason }));

  const SENSITIVITY_IDS = ['cost_weight', 'unprotected_cycling_discomfort_per_km', 'shop_staffing_response'];

  /* ---------- spec and world checks ---------- */
  function baselineSandbox(world) { return Sandbox.createSandbox(world, { seed: 1 }); }

  function resolveRef(graph, ref, mode) {
    if (typeof ref !== 'string') return null;
    if (ref.startsWith('door:')) {
      const id = ref.slice(5);
      for (const n of graph.nodes.values()) if (n.kind === 'door' && n.business_ids.includes(id)) return n.id;
      return null;
    }
    if (ref.startsWith('lane:')) {
      const [, dir, i] = ref.split(':');
      if (mode === 'bike' && graph.nodes.has(`trk_${dir}_${i}`)) return `trk_${dir}_${i}`;
      return graph.nodes.has(`car_${dir}_${i}`) ? `car_${dir}_${i}` : null;
    }
    return graph.nodes.has(ref) ? ref : null;
  }

  function validateWorldSpec(spec, world) {
    if (!world || world.id !== spec?.world_id) throw new Error(`World ${world?.id || 'missing'} does not match spec world_id ${spec?.world_id}`);
    if (!spec.id || !Number.isInteger(spec.ticks) || spec.ticks < 1 || spec.ticks > 12) throw new Error('Scenario needs an id and 1–12 ticks');
    if (!Number.isInteger(spec.policy_start) || spec.policy_start < 1 || spec.policy_start > spec.ticks) throw new Error('Invalid policy_start');
    const env = spec.environment || {};
    for (const k of ['adult_fare_cad', 'fair_pass_fare_cad']) if (!Number.isFinite(env[k]) || env[k] < 0) throw new Error(`${k} must be a non-negative CAD amount`);
    if (!Array.isArray(spec.intervention)) throw new Error('Scenario needs an intervention list');
    const levers = Sandbox.DEFAULT_POLICY;
    let fare = env.adult_fare_cad;
    for (const change of spec.intervention) {
      if (change.operator === 'change_cost' && change.lever === 'adult_fare_cad' && Number.isFinite(change.delta_cad)) {
        fare += change.delta_cad;
        if (fare < 0) throw new Error('Intervention would create a negative adult fare');
        continue;
      }
      if (change.operator === 'set_lever' && Object.prototype.hasOwnProperty.call(levers, change.lever)) {
        if (change.lever === 'adult_fare_cad' && (!Number.isFinite(change.value) || change.value < 0)) throw new Error('adult_fare_cad must be non-negative');
        continue;
      }
      throw new Error(`Unsupported intervention ${change.operator || 'missing operator'}${change.lever ? ` on ${change.lever}` : ''}`);
    }
    // The sandbox refuses invalid lever values (e.g. an unknown track type).
    Sandbox.createSandbox(world, { policy: leversFor(spec, 'intervention', spec.ticks) });
    const people = spec.population?.personas;
    if (!Array.isArray(people) || !people.length) throw new Error('A scenario needs a synthetic population');
    const graph = baselineSandbox(world).graph;
    const shops = new Map();
    for (const shop of spec.shops || []) {
      if (!resolveRef(graph, `door:${shop.business_id}`)) throw new Error(`Shop ${shop.business_id} has no mapped door`);
      shops.set(shop.business_id, shop);
    }
    const ids = new Set();
    for (const p of people) {
      if (!p.id || ids.has(p.id)) throw new Error(`Invalid or duplicate persona ${p.id}`);
      ids.add(p.id);
      if (!p.home || !['mapped', 'offmap'].includes(p.home.kind)) throw new Error(`Persona ${p.id} needs a home`);
      if (p.home.kind === 'mapped' && !graph.nodes.has(p.home.node)) throw new Error(`Persona ${p.id} home node ${p.home.node} is not mapped`);
      if (!Number.isFinite(p.daily_budget_cad) || p.daily_budget_cad < 0) throw new Error(`Persona ${p.id} needs a budget`);
      const tripIds = new Set();
      for (const trip of p.routine || []) {
        if (!trip.id || tripIds.has(trip.id) || !['commute', 'errand'].includes(trip.purpose)) throw new Error(`Invalid trip for ${p.id}`);
        tripIds.add(trip.id);
        parseHM(trip.depart);
        if (trip.purpose === 'errand' && !shops.has(trip.shop)) throw new Error(`Trip ${p.id}/${trip.id} targets an unknown focal shop`);
        for (const option of trip.options || []) {
          if (!option.action || option.action === 'defer') throw new Error(`Invalid option on ${p.id}/${trip.id}`);
          let at = option.start || (p.home.kind === 'mapped' ? p.home.node : null);
          if (option.legs.length && !at) throw new Error(`Option ${p.id}/${trip.id}/${option.action} needs a start node`);
          for (const leg of option.legs) {
            if (!['walk', 'bike', 'car', 'transit'].includes(leg.mode)) throw new Error(`Unknown leg mode ${leg.mode}`);
            const from = resolveRef(graph, at, leg.mode);
            if (!from) throw new Error(`Unknown node ${at} in ${p.id}/${trip.id}/${option.action}`);
            if (leg.ride) {
              const edge = graph.edges.get(leg.ride);
              if (!edge?.transit || edge.from !== from) throw new Error(`Ride ${leg.ride} must start at its station in ${p.id}/${trip.id}`);
              at = edge.to;
            } else {
              if (!resolveRef(graph, leg.to, leg.mode)) throw new Error(`Unknown node ${leg.to} in ${p.id}/${trip.id}/${option.action}`);
              at = leg.to;
            }
          }
          if (trip.purpose === 'errand' && !option.destination_offmap && option.legs.length && at !== `door:${trip.shop}` && !String(at).startsWith('door:')) throw new Error(`Errand option ${p.id}/${trip.id}/${option.action} must end at a shop door`);
        }
      }
    }
  }

  function leversFor(spec, arm, tick) {
    const levers = { adult_fare_cad: spec.environment.adult_fare_cad };
    if (arm !== 'intervention' || tick < spec.policy_start) return levers;
    for (const change of spec.intervention) {
      if (change.operator === 'change_cost') levers.adult_fare_cad = r2(levers.adult_fare_cad + change.delta_cad);
      if (change.operator === 'set_lever') levers[change.lever] = change.value;
    }
    return levers;
  }

  function assumptionValues(spec, overrides) {
    const values = {};
    for (const a of spec.assumptions || []) if (SENSITIVITY_IDS.includes(a.id)) values[a.id] = a.value;
    for (const [k, v] of Object.entries(overrides || {})) {
      if (!SENSITIVITY_IDS.includes(k)) throw new Error(`Unknown assumption override ${k}`);
      if (k === 'shop_staffing_response' ? typeof v !== 'boolean' : !Number.isFinite(v) || v < 0) throw new Error(`Invalid value for ${k}`);
      values[k] = v;
    }
    for (const k of SENSITIVITY_IDS) if (values[k] === undefined) throw new Error(`Missing assumption value ${k}`);
    return values;
  }

  /* ---------- executing legs inside the Game Master ---------- */
  function permits(edge, mode) {
    return mode === 'transit' ? edge.modes.includes('transit') || edge.modes.includes('walk') : edge.modes.includes(mode);
  }

  function pathOf(graph, moves) {
    const points = [];
    const push = (x, y, t) => {
      const last = points[points.length - 1];
      const p = [r1(x), r1(y), r1(t)];
      if (!last || last[0] !== p[0] || last[1] !== p[1] || last[2] !== p[2]) points.push(p);
    };
    for (const m of moves) {
      const e = graph.edges.get(m.edge), a = graph.nodes.get(e.from), b = graph.nodes.get(e.to);
      // The sandbox rounds t, wait_s, travel_s and arrive_t separately, so their
      // sum can overshoot arrive_t by 0.1 s; clamp so the path never runs backwards.
      push(a.x, a.y, m.t);
      if (e.gate && e.gate.at === 'end' && !e.transit) {
        push(b.x, b.y, Math.min(m.t + m.travel_s, m.arrive_t));
        push(b.x, b.y, m.arrive_t);
      } else {
        push(a.x, a.y, Math.min(m.t + m.wait_s, m.arrive_t));
        push(b.x, b.y, m.arrive_t);
      }
    }
    return points;
  }

  /* Run an option's legs. Returns a plan with sandbox-validated legs, or a failure. */
  function executeOption(sb, person, trip, tick, option, t0, env, prefix) {
    const graph = sb.graph;
    const legs = [];
    let at = option.start || (person.home.kind === 'mapped' ? person.home.node : null);
    let t = t0;
    for (let k = 0; k < option.legs.length; k++) {
      const leg = option.legs[k];
      const from = resolveRef(graph, at, leg.mode);
      if (!from) return { ok: false, reason: `unresolved_node:${at}` };
      if (!(graph.out.get(from) || []).some((eid) => permits(graph.edges.get(eid), leg.mode))) return { ok: false, reason: `mode_switch_not_allowed:${leg.mode}@${from}` };
      const id = `${prefix}${person.id}:${trip.id}:${tick}:${k}`;
      sb.addAgent({ id, at: from, mode: leg.mode, t, fare_cad: leg.ride && person.fare_category === 'fair_pass' ? env.fair_pass_fare_cad : undefined });
      let to;
      if (leg.ride) {
        const ev = sb.move(id, leg.ride);
        if (ev.type !== 'moved') return { ok: false, reason: ev.reason || ev.type };
        to = graph.edges.get(leg.ride).to;
      } else {
        to = resolveRef(graph, leg.to, leg.mode);
        if (!to) return { ok: false, reason: `unresolved_node:${leg.to}` };
        if (to !== from) {
          const ev = sb.travel(id, to);
          if (ev.type !== 'trip_completed') return { ok: false, reason: ev.reason || ev.type };
        }
      }
      const moves = sb.events.filter((e) => e.actor === id && e.type === 'moved');
      const agent = sb.agents.get(id);
      legs.push({
        k, mode: leg.mode, from_node: from, to_node: to, depart_t: r1(t), arrive_t: r1(agent.t), moves,
        fare_cad: r2(moves.reduce((s, m) => s + (m.fare_cad || 0), 0)),
        wait_s: r1(moves.reduce((s, m) => s + m.wait_s, 0)),
        distance_m: r1(moves.reduce((s, m) => s + (m.edge.startsWith('line2') ? 0 : m.length_m), 0)),
        shared_with_cars_m: r1(moves.filter((m) => m.shared_with_cars).reduce((s, m) => s + m.length_m, 0)),
        uses_bloor: (leg.mode === 'bike' || leg.mode === 'car') && moves.some((m) => BLOOR_EDGE.test(m.edge)),
      });
      at = to; t = agent.t;
    }
    const mappedSeconds = legs.length ? t - t0 : 0;
    return {
      ok: true, legs, end_node: at, arrive_t: t,
      mapped_minutes: r1(mappedSeconds / 60),
      fare_cad: r2(legs.reduce((s, l) => s + l.fare_cad, 0)),
      shared_with_cars_m: r1(legs.reduce((s, l) => s + l.shared_with_cars_m, 0)),
    };
  }

  /* ---------- decisions ---------- */
  function fixtureRule(person, trip, options, values, seed, tick) {
    const score = (o) => {
      const noise = (random(seed, person.id, tick, trip.id, o.action) - .5) * CHOICE_NOISE;
      if (o.action === 'defer') return trip.purpose === 'commute' ? -8 : -2.5 + Number(person.defer_bias || 0) + noise;
      const pref = Number(person.mode_preference?.[o.action] ?? 0);
      const cost = o.cost_cad * Number(person.cost_sensitivity || 1) * values.cost_weight;
      const time = o.minutes / 30 * Number(person.time_sensitivity || 1);
      const exposure = o.mode === 'bike' ? o.shared_with_cars_m / 1000 * Number(person.bike_safety_sensitivity || 1) * values.unprotected_cycling_discomfort_per_km : 0;
      return pref - cost - time - exposure + noise;
    };
    return options.reduce((best, o) => (score(o) > score(best) ? o : best));
  }

  function publicPerson(p) {
    return { id: p.id, name: p.name, role: p.role, fare_category: p.fare_category, has_bike: p.has_bike, has_car: p.has_car,
      cost_sensitivity: p.cost_sensitivity, time_sensitivity: p.time_sensitivity, bike_safety_sensitivity: p.bike_safety_sensitivity,
      mode_preference: p.mode_preference, home: p.home.kind === 'mapped' ? p.home.street : p.home.label };
  }

  /* ---------- one arm ---------- */
  async function runArm(ctx, arm) {
    const { spec, world, seed, version, people, values, decide, decisionCache, probeCache, shopIndex } = ctx;
    const runId = `${spec.id}:v${version}:${arm}:${seed}`;
    const events = [], decisions = [], warnings = [];
    let serial = 0, accepted = 0, rejected = 0;
    const emit = (tick, t, actor, action, details = {}) => {
      const e = { id: `${arm}:e${String(++serial).padStart(4, '0')}`, run_id: runId, tick, t: r1(t), actor, action, visual_cue: 'other', caused_by: [], evidence: 'simulated', ...details };
      events.push(e); return e;
    };
    const cash = Object.fromEntries(people.map((p) => [p.id, 0]));
    const closes = Object.fromEntries(spec.shops.map((s) => [s.business_id, parseHM(s.closes_at)]));
    const hoursEvent = {};
    let policyEventId = null;

    for (let tick = 1; tick <= spec.ticks; tick++) {
      const levers = leversFor(spec, arm, tick);
      const leverKey = JSON.stringify(levers);
      const sb = Sandbox.createSandbox(world, { policy: levers, seed });
      let scratch = null;   // one probing sandbox per arm-tick; probes never touch the committed world
      const env = { ...spec.environment, adult_fare_cad: sb.policy.adult_fare_cad };
      const receipts = Object.fromEntries(spec.shops.map((s) => [s.business_id, 0]));
      const purchaseIds = Object.fromEntries(spec.shops.map((s) => [s.business_id, []]));
      for (const p of people) {
        cash[p.id] = r2(cash[p.id] + p.daily_budget_cad);
        emit(tick, 6 * 3600, p.id, 'receive_budget', { amount_cad: p.daily_budget_cad, state_delta: { [`${p.id}.cash_cad`]: p.daily_budget_cad }, assumption_ids: ['synthetic_population'] });
      }
      if (arm === 'intervention' && tick === spec.policy_start && spec.intervention.length) {
        policyEventId = emit(tick, 5 * 3600, 'city', 'policy_change', { levers: clone(levers), intervention: clone(spec.intervention), source_ids: clone(spec.policy_source_ids || []), state_delta: clone(levers) }).id;
      }
      const policyActive = arm === 'intervention' && tick >= spec.policy_start && policyEventId;
      const trips = [];
      for (const p of people) for (const trip of p.routine || []) {
        trips.push({ p, trip, t: parseHM(trip.depart) + Math.floor(random(seed, p.id, tick, trip.id, 'depart') * 240) });
      }
      trips.sort((a, b) => a.t - b.t || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0) || (a.trip.id < b.trip.id ? -1 : 1));

      for (const { p, trip, t } of trips) {
        const key = `${tick}:${p.id}:${trip.id}`;
        const options = [];
        const closedCauses = new Set();
        for (const o of trip.options) {
          if (o.mode === 'bike' && !p.has_bike) continue;
          if (o.mode === 'car' && !p.has_car) continue;
          const probeKey = `${leverKey}|${p.id}|${trip.id}|${o.action}|${t}`;
          let probe = probeCache.get(probeKey);
          if (!probe) {
            scratch ||= Sandbox.createSandbox(world, { policy: levers, seed });
            const run = executeOption(scratch, p, trip, tick, o, t, env, `probe:${o.action}:`);
            probe = run.ok ? { ok: true, mapped_minutes: run.mapped_minutes, fare_cad: run.fare_cad, shared_with_cars_m: run.shared_with_cars_m, arrive_t: run.arrive_t } : { ok: false, reason: run.reason };
            probeCache.set(probeKey, probe);
          }
          if (!probe.ok) { warnings.push({ key, code: 'option_infeasible', action: o.action, reason: probe.reason }); continue; }
          const destination = o.destination_offmap ? 'offmap' : trip.purpose === 'errand' ? trip.shop : o.offmap_label || 'offmap';
          if (trip.purpose === 'errand' && !o.destination_offmap && probe.arrive_t >= closes[trip.shop]) {
            if (hoursEvent[trip.shop]) closedCauses.add(hoursEvent[trip.shop]);
            continue;
          }
          const cost = r2(probe.fare_cad + Number(o.cost_cad || 0));
          if (cost > cash[p.id]) continue;
          options.push({ action: o.action, mode: o.mode, route: o.route || o.action, destination,
            mapped_minutes: probe.mapped_minutes, offmap_minutes: o.offmap_minutes || 0,
            minutes: r1(probe.mapped_minutes + (o.offmap_minutes || 0)), fare_cad: probe.fare_cad, travel_cost_cad: Number(o.cost_cad || 0),
            cost_cad: cost, shared_with_cars_m: probe.shared_with_cars_m, spec: o });
        }
        options.push({ action: 'defer', mode: 'none', route: null, destination: null, mapped_minutes: 0, offmap_minutes: 0, minutes: 0, fare_cad: 0, travel_cost_cad: 0, cost_cad: 0, shared_with_cars_m: 0, spec: null });

        const fallback = fixtureRule(p, trip, options, values, seed, tick);
        let selection = fallback, provider = 'fixture_rule', reason = 'Synthetic profile-conditioned score over sandbox-probed legal options.';
        if (decide || decisionCache.size) {
          const request = {
            scenario: spec.id, tick, seed, person: publicPerson(p),
            trip: { id: trip.id, purpose: trip.purpose, depart: hms(t), planned_shop: trip.shop || null },
            options: options.map(({ action, mode, minutes, mapped_minutes, offmap_minutes, cost_cad, shared_with_cars_m, destination, route }) => ({ action, mode, minutes, mapped_minutes, offmap_minutes, cost_cad, shared_with_cars_m, destination, route })),
            cash_cad: cash[p.id],
            world: { adult_fare_cad: sb.policy.adult_fare_cad, fair_pass_fare_cad: env.fair_pass_fare_cad, bloor_cycle_track: sb.policy.bloor_cycle_track, line2_headway_multiplier: sb.policy.line2_headway_multiplier },
          };
          const cacheKey = JSON.stringify(request);
          try {
            let answer;
            if (decisionCache.has(cacheKey)) answer = decisionCache.get(cacheKey);
            else if (decide) { answer = clone(await decide(request)); decisionCache.set(cacheKey, answer); }
            if (answer) {
              const proposed = options.find((o) => o.action === answer.action);
              if (proposed) { selection = proposed; provider = answer.provider || 'external_agent'; reason = answer.reason || 'External bounded action.'; }
              else warnings.push({ key, code: 'invalid_agent_action', proposed: answer.action ?? null, fallback: fallback.action });
            } else if (decide) warnings.push({ key, code: 'invalid_agent_action', proposed: null, fallback: fallback.action });
          } catch (error) { warnings.push({ key, code: 'agent_error', message: String(error && error.message || error), fallback: fallback.action }); }
        }

        const causes = [policyActive ? policyEventId : null, ...closedCauses].filter(Boolean);
        const choice = emit(tick, t, p.id, 'choose_trip', {
          trip_id: trip.id, purpose: trip.purpose, chosen: selection.action, route: selection.route, destination: selection.destination,
          options: options.map((o) => ({ action: o.action, minutes: o.minutes, cost_cad: o.cost_cad, shared_with_cars_m: o.shared_with_cars_m })),
          provider, reason, caused_by: causes, assumption_ids: provider === 'fixture_rule' ? ['synthetic_choice_rule', 'offmap_minutes'] : ['external_agent_choice'],
        });
        decisions.push({ key, actor: p.id, tick, trip_id: trip.id, action: selection.action, route: selection.route, destination: selection.destination, provider, event_id: choice.id });

        if (selection.action === 'defer') {
          emit(tick, t, p.id, 'defer_trip', { trip_id: trip.id, caused_by: [choice.id], state_delta: { [`${p.id}.deferred_trips`]: 1 }, assumption_ids: ['synthetic_choice_rule'] });
          continue;
        }
        let cause = choice.id;
        if (trip.purpose === 'errand' && selection.destination !== trip.shop) {
          cause = emit(tick, t, p.id, 'change_destination', { trip_id: trip.id, from: trip.shop, to: selection.destination,
            reason: closedCauses.size ? 'The planned shop had shortened its hours.' : 'Chose a shop outside the mapped section.',
            caused_by: [choice.id, ...closedCauses], assumption_ids: closedCauses.size ? ['shop_hours_response'] : ['synthetic_choice_rule'] }).id;
        }
        if (selection.travel_cost_cad > 0) {
          cash[p.id] = r2(cash[p.id] - selection.travel_cost_cad);
          emit(tick, t, p.id, 'pay_travel_cost', { amount_cad: selection.travel_cost_cad, recipient: 'parking_and_vehicle', visual_cue: 'exchange', caused_by: [choice.id], state_delta: { [`${p.id}.cash_cad`]: -selection.travel_cost_cad }, assumption_ids: ['mode_costs'] });
        }
        const run = executeOption(sb, p, trip, tick, selection.spec, t, env, '');
        if (!run.ok) throw new Error(`Committed option became infeasible for ${key}: ${run.reason}`);
        let lastTravel = null;
        for (const leg of run.legs) {
          const steps = leg.moves.map((m) => {
            const step = { edge: m.edge, t: m.t, wait_s: m.wait_s, travel_s: m.travel_s };
            if (m.crosswalk) step.crosswalk = m.crosswalk;
            if (m.shared_with_cars) step.shared_with_cars = true;
            if (m.fare_cad) step.fare_cad = m.fare_cad;
            return step;
          });
          const rules = ['mode_edges', 'no_teleport'];
          if (leg.moves.some((m) => m.crosswalk)) rules.push('cross_at_crosswalks');
          if (leg.mode !== 'walk' && leg.mode !== 'transit' && leg.moves.some((m) => m.wait_s > 0)) rules.push('signals_for_vehicles');
          if (leg.mode === 'transit') rules.push('board_scheduled_only');
          const isLast = leg === run.legs[run.legs.length - 1];
          accepted += leg.moves.length;
          const travel = emit(tick, leg.depart_t, p.id, 'travel', {
            trip_id: trip.id, leg: leg.k, mode: leg.mode, visual_cue: CUE[leg.mode], from_node: leg.from_node, to_node: leg.to_node,
            depart_t: leg.depart_t, arrive_t: leg.arrive_t, wait_s: leg.wait_s, distance_m: leg.distance_m,
            shared_with_cars_m: leg.shared_with_cars_m, uses_bloor: leg.uses_bloor, steps, path: pathOf(sb.graph, leg.moves),
            ...(isLast && selection.spec.offmap_label ? { exits_to: selection.spec.offmap_label } : {}),
            rule_ids: rules, caused_by: [lastTravel ? lastTravel.id : cause], source_ids: ['bloor_world'],
            state_delta: { [`${p.id}.location`]: leg.to_node }, assumption_ids: leg.mode === 'bike' && leg.uses_bloor ? ['unprotected_cycling_discomfort_per_km'] : [],
          });
          if (leg.fare_cad > 0) {
            cash[p.id] = r2(cash[p.id] - leg.fare_cad);
            emit(tick, leg.depart_t, p.id, 'pay_fare', { amount_cad: leg.fare_cad, recipient: 'ttc', fare_product: p.fare_category === 'fair_pass' ? 'fair_pass' : 'adult', edge: leg.moves.find((m) => m.fare_cad)?.edge,
              visual_cue: 'exchange', caused_by: [travel.id], state_delta: { [`${p.id}.cash_cad`]: -leg.fare_cad, 'ttc.receipts_cad': leg.fare_cad }, source_ids: ['ttc_fares'] });
          }
          lastTravel = travel;
        }
        let tail = lastTravel ? lastTravel.id : cause;
        if (trip.purpose === 'errand' && selection.destination === trip.shop) {
          const agentId = `${p.id}:${trip.id}:${tick}:${run.legs.length - 1}`;
          const entered = sb.enter(agentId, trip.shop);
          if (entered.type !== 'entered_business') throw new Error(`Shop entry refused for ${key}: ${entered.reason}`);
          const door = sb.graph.nodes.get(entered.node);
          const shop = shopIndex.get(trip.shop);
          const entry = emit(tick, entered.t, p.id, 'enter_business', { trip_id: trip.id, business_id: trip.shop, name: shop.name, node: entered.node, x: door.x, y: door.y,
            visual_cue: 'enter_shop', caused_by: [tail], rule_ids: ['enter_open_buildings'], source_ids: ['osm'], state_delta: { [`${trip.shop}.visits`]: 1 } });
          tail = entry.id;
          const basket = Number(trip.basket_cad || 0);
          if (basket > 0 && basket <= cash[p.id]) {
            cash[p.id] = r2(cash[p.id] - basket);
            receipts[trip.shop] = r2(receipts[trip.shop] + basket);
            const buy = emit(tick, entered.t, p.id, 'purchase', { trip_id: trip.id, amount_cad: basket, recipient: trip.shop, x: door.x, y: door.y, visual_cue: 'exchange', caused_by: [entry.id],
              state_delta: { [`${p.id}.cash_cad`]: -basket, [`${trip.shop}.receipts_cad`]: basket }, assumption_ids: ['basket_value'] });
            purchaseIds[trip.shop].push(buy.id);
            tail = buy.id;
          }
        } else if (trip.purpose === 'errand' && selection.destination === 'offmap') {
          const basket = Number(trip.basket_cad || 0);
          if (basket > 0 && basket <= cash[p.id]) {
            cash[p.id] = r2(cash[p.id] - basket);
            tail = emit(tick, t, p.id, 'spend_elsewhere', { trip_id: trip.id, amount_cad: basket, recipient: 'outside_section', visual_cue: 'exchange', caused_by: [tail],
              state_delta: { [`${p.id}.cash_cad`]: -basket }, assumption_ids: ['basket_value'] }).id;
          }
        }
        const endT = run.legs.length ? run.arrive_t : t;
        emit(tick, endT, p.id, 'trip_completed', { trip_id: trip.id, purpose: trip.purpose, chosen: selection.action, mode: selection.mode, route: selection.route, destination: selection.destination,
          mapped_minutes: run.mapped_minutes, offmap_minutes: selection.offmap_minutes, total_minutes: r1(run.mapped_minutes + selection.offmap_minutes), in_map: run.legs.length > 0, caused_by: [tail] });
      }
      rejected += sb.events.filter((e) => e.type === 'action_rejected').length;
      for (const shop of spec.shops) {
        const reduced = values.shop_staffing_response && receipts[shop.business_id] < Number(shop.receipt_floor_cad || 0);
        closes[shop.business_id] = parseHM(reduced ? shop.reduced_closes_at : shop.closes_at);
        hoursEvent[shop.business_id] = emit(tick, 22 * 3600, `owner:${shop.business_id}`, 'set_shop_hours', {
          business_id: shop.business_id, name: shopIndex.get(shop.business_id).name, receipts_cad: receipts[shop.business_id], receipt_floor_cad: shop.receipt_floor_cad,
          closes_at: closes[shop.business_id], reduced, reason: 'Synthetic staffing rule based on this period’s sample receipts.', visual_cue: 'work',
          caused_by: purchaseIds[shop.business_id], state_delta: { [`${shop.business_id}.next_period_closes_at`]: hms(closes[shop.business_id]) }, assumption_ids: ['shop_hours_response'],
        }).id;
      }
    }
    const metrics = reduceWorldMetrics(events, spec.ticks, people);
    return { run_id: runId, events, decisions, metrics, metric_points: metricPoints(events, spec.ticks, runId, arm), warnings, game_master: { accepted_moves: accepted, rejected_actions: rejected } };
  }

  /* ---------- metrics from committed events ---------- */
  function contributions(events, tick) {
    const out = Object.fromEntries(METRIC_DEFINITIONS.map((d) => [d.id, []]));
    const tripMode = new Map();
    const bikeOnBloor = new Set();
    for (const e of events) {
      if (e.tick !== tick) continue;
      const trip = `${e.actor}:${e.trip_id}`;
      if (e.action === 'travel') {
        if (e.mode === 'transit') out.line2_rides.push(e);
        if (e.mode === 'bike' && e.uses_bloor) { bikeOnBloor.add(trip); out.cyclist_mapped_minutes.push(e); if (e.shared_with_cars_m > 0) out.bloor_shared_cycling_m.push(e); }
        if (e.mode === 'car') out.driver_mapped_minutes.push(e);
      }
      if (e.action === 'trip_completed') {
        tripMode.set(trip, e);
        out.completed_trips.push(e);
        if (e.mode === 'transit') out.transit_trips.push(e);
        if (e.mode === 'bike') out.bike_trips.push(e);
        if (e.mode === 'car') out.car_trips.push(e);
        if (e.mode === 'walk') out.walk_trips.push(e);
        if (e.purpose === 'errand' && e.destination === 'offmap') out.errands_elsewhere.push(e);
      }
      if (e.action === 'defer_trip') out.deferred_trips.push(e);
      if (e.action === 'enter_business') out.local_shop_visits.push(e);
      if (e.action === 'purchase') { out.shop_sales_cad.push(e); out.household_shopping_spend_cad.push(e); }
      if (e.action === 'pay_fare') { out.fare_revenue_cad.push(e); out.household_fare_spend_cad.push(e); out.household_transport_spend_cad.push(e); }
      if (e.action === 'pay_travel_cost') out.household_transport_spend_cad.push(e);
      if (e.action === 'set_shop_hours' && e.reduced) out.shops_reduced_hours.push(e);
    }
    for (const [trip, e] of tripMode) if (e.mode === 'bike' && bikeOnBloor.has(trip)) out.bloor_bike_trips.push(e);
    return out;
  }

  function valueOf(id, list) {
    if (['shop_sales_cad', 'household_shopping_spend_cad', 'fare_revenue_cad', 'household_fare_spend_cad', 'household_transport_spend_cad'].includes(id)) return r2(list.reduce((s, e) => s + e.amount_cad, 0));
    if (id === 'bloor_shared_cycling_m') return r1(list.reduce((s, e) => s + e.shared_with_cars_m, 0));
    if (id === 'cyclist_mapped_minutes' || id === 'driver_mapped_minutes') return list.length ? r2(list.reduce((s, e) => s + (e.arrive_t - e.depart_t) / 60, 0) / list.length) : 0;
    return list.length;
  }

  function reduceWorldMetrics(events, ticks, personas) {
    const by_tick = [];
    for (let tick = 1; tick <= ticks; tick++) {
      const c = contributions(events, tick);
      by_tick.push({ tick, ...Object.fromEntries(METRIC_DEFINITIONS.map((d) => [d.id, valueOf(d.id, c[d.id])])) });
    }
    const totals = Object.fromEntries(METRIC_DEFINITIONS.map((d) => {
      const vals = by_tick.map((p) => p[d.id]);
      return [d.id, d.aggregation === 'mean' ? r2(vals.reduce((s, v) => s + v, 0) / vals.length) : (d.unit === 'CAD' ? r2 : r1)(vals.reduce((s, v) => s + v, 0))];
    }));
    const groupOf = new Map((personas || []).map((p) => [p.id, p.fare_category]));
    const by_group = {};
    for (const group of ['adult', 'fair_pass']) {
      by_group[group] = { household_fare_spend_cad: [], transit_trips: [], deferred_trips: [] };
      for (let tick = 1; tick <= ticks; tick++) {
        const mine = events.filter((e) => e.tick === tick && groupOf.get(e.actor) === group);
        by_group[group].household_fare_spend_cad.push(r2(mine.filter((e) => e.action === 'pay_fare').reduce((s, e) => s + e.amount_cad, 0)));
        by_group[group].transit_trips.push(mine.filter((e) => e.action === 'trip_completed' && e.mode === 'transit').length);
        by_group[group].deferred_trips.push(mine.filter((e) => e.action === 'defer_trip').length);
      }
    }
    return { by_tick, totals, by_group };
  }

  function metricPoints(events, ticks, runId, arm) {
    const points = [];
    for (let tick = 1; tick <= ticks; tick++) {
      const c = contributions(events, tick);
      for (const d of METRIC_DEFINITIONS) points.push({ metric_id: d.id, run_id: runId, arm, tick, value: valueOf(d.id, c[d.id]), unit: d.unit, event_ids: c[d.id].map((e) => e.id) });
    }
    return points;
  }

  /* ---------- the paired experiment ---------- */
  async function runWorldExperiment(spec, { world, seed = 42, version = 1, personas, decide, replay_decisions, overrides = {} } = {}) {
    if (!Sandbox) throw new Error('world/sandbox.js must be loaded first');
    const people = clone(personas || spec.population?.personas || []);
    const checked = personas ? { ...spec, population: { ...spec.population, personas: people } } : spec;
    validateWorldSpec(checked, world);
    const values = assumptionValues(spec, overrides);
    const shopIndex = new Map(spec.shops.map((s) => {
      const b = world.businesses.items.find((x) => x.id === s.business_id);
      return [s.business_id, { ...s, name: b?.name || s.label, category: b?.category || null, side: b?.side || null }];
    }));
    const ctx = { spec, world, seed, version, people, values, decide, decisionCache: new Map(replay_decisions || []), probeCache: new Map(), shopIndex };
    const baseline = await runArm(ctx, 'baseline');
    const intervention = await runArm(ctx, 'intervention');
    const before = new Map(baseline.decisions.map((d) => [d.key, d]));
    const changed_decisions = intervention.decisions.filter((d) => {
      const b = before.get(d.key);
      return b?.action !== d.action || b?.route !== d.route || b?.destination !== d.destination;
    }).map((d) => {
      const b = before.get(d.key);
      return { key: d.key, actor: d.actor, tick: d.tick, trip_id: d.trip_id,
        baseline: { action: b?.action, route: b?.route, destination: b?.destination },
        intervention: { action: d.action, route: d.route, destination: d.destination },
        baseline_event_id: b?.event_id, intervention_event_id: d.event_id };
    });
    const graph = baselineSandbox(world).graph;
    const buildings = new Map(world.buildings.items.map((b) => [b.id, b]));
    const personasOut = people.map((p) => {
      const out = clone(p);
      if (p.home.kind === 'mapped') {
        const b = buildings.get(p.home.building_id), n = graph.nodes.get(p.home.node);
        out.home = { ...p.home, x: b ? b.centroid[0] : n.x, y: b ? b.centroid[1] : n.y, node_x: n.x, node_y: n.y };
      }
      return out;
    });
    const residents = people.filter((p) => p.home.kind === 'mapped').length;
    return {
      schema_version: 'experiment.v2', study_id: spec.id, scenario_id: spec.scenario_id || spec.id, version, seed,
      evidence_tier: spec.evidence_tier || 'speculative',
      scenario: { id: spec.id, question: spec.question, geography: spec.geography, ticks: spec.ticks, policy_start: spec.policy_start, period_unit: spec.period_unit || 'period',
        intervention: clone(spec.intervention), levers: { baseline: leversFor(spec, 'baseline', spec.ticks), intervention: leversFor(spec, 'intervention', spec.ticks) } },
      world: { id: world.id, schema_version: world.schema_version, title: world.title, section_length_m: world.frame.section_length_m, source_ids: Object.keys(world.sources || {}) },
      population: { id: spec.population.id, count: people.length, residents, visitors: people.length - residents, source: spec.population.source, representative: false, shared_across_scenarios: true },
      personas: personasOut,
      places: {
        shops: spec.shops.map((s) => {
          const node = graph.nodes.get(resolveRef(graph, `door:${s.business_id}`));
          const info = shopIndex.get(s.business_id);
          return { business_id: s.business_id, name: info.name, category: info.category, door_node: node.id, x: node.x, y: node.y, side: node.side, closes_at: parseHM(s.closes_at), reduced_closes_at: parseHM(s.reduced_closes_at), receipt_floor_cad: s.receipt_floor_cad };
        }),
        stations: world.transit.stations.map((st) => { const n = graph.nodes.get(`stn_${st.id}`); return { id: st.id, name: st.name, node: n.id, x: n.x, y: n.y }; }),
      },
      sources: clone(spec.sources || []), assumptions: clone(spec.assumptions || []),
      assumption_values: values, assumption_overrides: clone(overrides),
      metric_definitions: clone(METRIC_DEFINITIONS), not_estimable: clone(NOT_ESTIMABLE),
      runs: { baseline, intervention }, changed_decisions,
      decision_replay: [...ctx.decisionCache.entries()],
      limitations: [
        'Nineteen synthetic people with invented routines and preferences; not a sample of Bathurst–Spadina residents or visitors.',
        'Movement, signals, crosswalks, Line 2 departures and fares are enforced by the mapped sandbox; signal timings are assumed and background traffic follows one observed weekday.',
        'Shop presence comes from OpenStreetMap; baskets, receipts and staffing thresholds are synthetic.',
        'Outputs describe this 619 m section only and must not be scaled to the corridor, TTC or City.',
      ],
    };
  }

  const api = { runWorldExperiment, reduceWorldMetrics, leversFor, validateWorldSpec, resolveRef, METRIC_DEFINITIONS, NOT_ESTIMABLE, SENSITIVITY_IDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualWorldExperiment = api;
})(typeof window !== 'undefined' ? window : null);
