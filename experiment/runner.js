/* A small, replayable world controller. Persona generation and model calls sit
 * outside this file; a decision provider may choose only from the options the
 * world offers. Every displayed metric is reducible from committed events. */
(function (root) {
  'use strict';

  const MODE = { bus: 'bus', walk: 'walk', drive: 'car', bike_bloor: 'bicycle', bike_detour: 'bicycle', defer: 'none' };
  const CUE = { bus: 'ride_bus', walk: 'walk', drive: 'drive', bike_bloor: 'ride_bike', bike_detour: 'ride_bike', defer: 'other' };
  const METRIC_DEFINITIONS = [
    ['completed_trips', 'Completed sample trips', 'trips'],
    ['bus_trips', 'Sample TTC trips', 'trips'],
    ['bike_trips', 'Sample cycling trips', 'trips'],
    ['bloor_route_trips', 'Sample Bloor main-route cycling trips', 'trips'],
    ['car_trips', 'Sample car trips', 'trips'],
    ['walk_trips', 'Sample walking trips', 'trips'],
    ['deferred_trips', 'Deferred sample trips', 'trips'],
    ['local_shop_visits', 'Local shop visits', 'visits'],
    ['plaza_arrivals', 'Alternate plaza arrivals', 'arrivals'],
    ['shop_sales_cad', 'Local shop receipts', 'CAD'],
    ['fare_revenue_cad', 'Sample TTC receipts', 'CAD'],
    ['household_fare_spend_cad', 'Household fare spending', 'CAD'],
    ['household_transport_spend_cad', 'Household recorded transport spending', 'CAD'],
    ['household_shopping_spend_cad', 'Household local shopping', 'CAD'],
    ['shop_open_hours', 'Local shop hours for the next period', 'hours'],
  ].map(([id, label, unit]) => ({ id, label, unit, status: 'assumption_driven' }));
  const NOT_ESTIMABLE = [
    ['citywide_budget_cad', 'The synthetic population has no representative city weights.'],
    ['business_closures', 'No business-survival model or validated closure data.'],
    ['injuries', 'No exposure-to-injury model for the intervention.'],
    ['emissions_kg', 'No route-distance, fleet, or substitution emissions model.'],
    ['gdp_cad', 'No economy-wide accounting model.'],
  ].map(([id, reason]) => ({ id, status: 'not_estimable', value: null, reason }));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const round = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  function random(seed, ...parts) {
    const value = `${seed}|${parts.join('|')}`;
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function validate(spec, people) {
    if (!spec || typeof spec.id !== 'string' || !spec.id || !Number.isInteger(spec.ticks) || spec.ticks < 1 || spec.ticks > 12) throw new Error('Scenario needs an id and 1–12 ticks');
    if (!Number.isInteger(spec.policy_start) || spec.policy_start < 1 || spec.policy_start > spec.ticks) throw new Error('Invalid policy_start');
    if (!spec.environment || !spec.routes || !Array.isArray(spec.intervention)) throw new Error('Scenario needs environment, routes and intervention');
    if (!Number.isFinite(spec.environment.adult_fare_cad) || spec.environment.adult_fare_cad < 0 || !Number.isFinite(spec.environment.fair_pass_fare_cad) || spec.environment.fair_pass_fare_cad < 0) throw new Error('Fares must be non-negative CAD amounts');
    let adultFare = spec.environment.adult_fare_cad;
    for (const change of spec.intervention) {
      if (change.operator === 'change_cost' && change.target === 'adult_transit_ride' && Number.isFinite(change.delta_cad)) {
        adultFare += change.delta_cad;
        if (adultFare < 0) throw new Error('Intervention would create a negative adult fare');
        continue;
      }
      if (change.operator === 'set_lane_protection' && change.target === 'bloor_west_cycle_track' && typeof change.value === 'boolean') continue;
      throw new Error(`Unsupported intervention ${change.operator || 'missing operator'}`);
    }
    if (!Object.keys(spec.routes).length) throw new Error('Scenario needs at least one route');
    for (const [action, route] of Object.entries(spec.routes)) {
      if (!(action in MODE) || action === 'defer' || !route || !Number.isFinite(route.minutes) || route.minutes < 0 || (route.cost_cad !== undefined && (!Number.isFinite(route.cost_cad) || route.cost_cad < 0))) throw new Error(`Invalid route ${action}`);
    }
    if (!Array.isArray(people) || !people.length) throw new Error('A scenario needs synthetic personas');
    const ids = new Set();
    for (const p of people) {
      if (!p.id || ids.has(p.id) || !p.home || !Array.isArray(p.routine) || !Number.isFinite(p.disposable_cash_weekly_cad) || p.disposable_cash_weekly_cad < 0) throw new Error(`Invalid or duplicate persona ${p.id}`);
      ids.add(p.id);
      const tripIds = new Set();
      for (const trip of p.routine) {
        if (!trip.id || tripIds.has(trip.id) || !['commute', 'errand'].includes(trip.purpose) || !trip.destination || !Number.isFinite(trip.distance_km) || trip.distance_km < 0) throw new Error(`Invalid trip for ${p.id}`);
        tripIds.add(trip.id);
      }
    }
  }

  function environmentFor(spec, arm, tick) {
    const env = clone(spec.environment);
    if (arm === 'intervention' && tick >= spec.policy_start) {
      for (const change of spec.intervention) {
        if (change.operator === 'change_cost') env.adult_fare_cad = round(env.adult_fare_cad + change.delta_cad);
        if (change.operator === 'set_lane_protection') env.bike_lane_protected = change.value;
      }
    }
    return env;
  }

  function worldFor(spec, people, seed) {
    const world = clone(spec.world || { coordinate_system: 'schematic', locations: [] });
    world.locations ||= [];
    const ids = new Set(world.locations.map((place) => place.id));
    for (const person of people) if (!ids.has(person.home)) {
      world.locations.push({ id: person.home, type: 'home', label: `${person.name}'s synthetic home`, x: round(8 + random(seed, person.id, 'home-x') * 34), y: round(58 + random(seed, person.id, 'home-y') * 30) });
      ids.add(person.home);
    }
    return world;
  }

  function optionsFor(person, trip, env, routes, cash) {
    const options = [];
    for (const action of Object.keys(routes)) {
      if (!(action in MODE) || action === 'defer') continue;
      if (action === 'drive' && !person.has_car) continue;
      if (action.startsWith('bike') && !person.has_bike) continue;
      if (action === 'walk' && trip.distance_km > (person.max_walk_km || 3)) continue;
      const route = routes[action];
      const cost = action === 'bus' ? (person.fare_category === 'fair_pass' ? env.fair_pass_fare_cad : env.adult_fare_cad) : Number(route.cost_cad || 0);
      if (cost > cash) continue;
      options.push({ action, mode: MODE[action], visual_cue: CUE[action], cost_cad: round(cost), minutes: route.minutes, destination: action === 'bike_detour' && trip.detour_destination ? trip.detour_destination : trip.destination, route_id: route.id || action });
    }
    options.push({ action: 'defer', mode: 'none', visual_cue: 'other', cost_cad: 0, minutes: 0, destination: null, route_id: null });
    return options;
  }

  function fixtureRule(person, trip, env, options, seed, tick) {
    const score = (option) => {
      if (option.action === 'defer') return trip.purpose === 'commute' ? -6 : -2.5 + (trip.defer_bias ?? person.defer_bias ?? 0) + (random(seed, person.id, tick, trip.id, 'defer') - .5) * 1.1;
      const preference = Number(trip.mode_preference?.[option.action] ?? person.mode_preference?.[option.action] ?? 0);
      const cost = option.cost_cad * Number(person.cost_sensitivity || 1);
      const time = option.minutes / 30 * Number(person.time_sensitivity || 1);
      const bikeRisk = option.action === 'bike_bloor' && !env.bike_lane_protected ? Number(person.bike_safety_sensitivity || 1) * Number(env.unprotected_bike_penalty || 0) : 0;
      const noise = (random(seed, person.id, tick, trip.id, option.action) - .5) * 1.5;
      return preference - cost - time - bikeRisk + noise;
    };
    return options.reduce((best, option) => score(option) > score(best) ? option : best);
  }

  function reduceMetrics(events, ticks) {
    const byTick = [];
    for (let tick = 1; tick <= ticks; tick++) {
      const point = { tick, completed_trips: 0, bus_trips: 0, bike_trips: 0, bloor_route_trips: 0, car_trips: 0, walk_trips: 0, deferred_trips: 0, local_shop_visits: 0, plaza_arrivals: 0, shop_sales_cad: 0, fare_revenue_cad: 0, household_fare_spend_cad: 0, household_transport_spend_cad: 0, household_shopping_spend_cad: 0, shop_open_hours: 0 };
      for (const event of events) {
        if (event.tick !== tick) continue;
        if (event.action === 'defer_trip') point.deferred_trips++;
        if (event.action === 'travel') {
          point.completed_trips++;
          if (event.mode === 'bus') point.bus_trips++;
          if (event.mode === 'bicycle') point.bike_trips++;
          if (event.mode === 'bicycle' && event.route_id === 'bloor_main') point.bloor_route_trips++;
          if (event.mode === 'car') point.car_trips++;
          if (event.mode === 'walk') point.walk_trips++;
          if (event.to === 'plaza') point.plaza_arrivals++;
        }
        if (event.action === 'enter_shop') point.local_shop_visits++;
        if (event.action === 'pay_fare') { point.fare_revenue_cad += event.amount_cad; point.household_fare_spend_cad += event.amount_cad; point.household_transport_spend_cad += event.amount_cad; }
        if (event.action === 'pay_travel_cost') point.household_transport_spend_cad += event.amount_cad;
        if (event.action === 'purchase') { point.shop_sales_cad += event.amount_cad; point.household_shopping_spend_cad += event.amount_cad; }
        if (event.action === 'set_shop_hours') point.shop_open_hours = event.hours;
      }
      for (const field of ['shop_sales_cad', 'fare_revenue_cad', 'household_fare_spend_cad', 'household_transport_spend_cad', 'household_shopping_spend_cad']) point[field] = round(point[field]);
      byTick.push(point);
    }
    const totals = Object.fromEntries(Object.keys(byTick[0]).filter((key) => key !== 'tick' && key !== 'shop_open_hours').map((key) => [key, round(byTick.reduce((sum, point) => sum + point[key], 0))]));
    return { by_tick: byTick, totals, not_estimable: clone(NOT_ESTIMABLE) };
  }

  async function runArm(spec, people, seed, arm, decide, decisionCache) {
    const events = [];
    const decisions = [];
    const warnings = [];
    const state = { cash: Object.fromEntries(people.map((p) => [p.id, 0])), shop_hours: Number(spec.environment.shop_hours || 9), shop_receipts: 0, shop_hours_event_id: null, policy_event_id: null };
    let serial = 0;
    const emit = (tick, actor, action, details = {}) => {
      const event = { id: `${arm}:e${String(++serial).padStart(4, '0')}`, run_id: `${spec.id}:${arm}:${seed}`, tick, actor, action, evidence: 'simulated', ...details };
      events.push(event);
      return event;
    };
    for (let tick = 1; tick <= spec.ticks; tick++) {
      const env = environmentFor(spec, arm, tick);
      state.shop_receipts = 0;
      const shopPurchases = [];
      for (const person of people) {
        state.cash[person.id] = round(state.cash[person.id] + person.disposable_cash_weekly_cad);
        emit(tick, person.id, 'receive_budget', { amount_cad: person.disposable_cash_weekly_cad, state_delta: { [`${person.id}.cash_cad`]: person.disposable_cash_weekly_cad }, assumption_ids: ['synthetic_weekly_budget'] });
      }
      if (arm === 'intervention' && tick === spec.policy_start && spec.intervention.length) state.policy_event_id = emit(tick, 'city', 'policy_change', { intervention: clone(spec.intervention), visual_cue: 'other', source_ids: spec.policy_source_ids || [], assumption_ids: spec.policy_assumption_ids || [] }).id;
      for (const person of people) {
        for (const trip of person.routine) {
          const key = `${tick}:${person.id}:${trip.id}`;
          let destination = trip.destination;
          if (trip.purpose === 'errand' && trip.shop === 'local' && trip.time_window === 'late' && state.shop_hours < 8) {
            destination = 'plaza';
          }
          const intent = { ...trip, destination };
          const options = optionsFor(person, intent, env, spec.routes, state.cash[person.id]);
          const fallback = fixtureRule(person, intent, env, options, seed, tick);
          let selection = fallback;
          let provider = 'fixture_rule';
          let reason = 'Synthetic profile-conditioned utility with fixed common random numbers.';
          if (decide || decisionCache.size) {
            try {
              // A model sees the decision state, never the arm name. Identical
              // baseline/policy states reuse one answer within a paired run.
              const request = { scenario: spec.id, tick, seed, person: clone(person), trip: clone(intent), environment: clone(env), options: clone(options), shop_hours: state.shop_hours, cash_cad: state.cash[person.id] };
              const cacheKey = JSON.stringify(request);
              let answer;
              if (decisionCache.has(cacheKey)) answer = decisionCache.get(cacheKey);
              else if (decide) {
                answer = clone(await decide(request));
                decisionCache.set(cacheKey, answer);
              }
              if (answer) {
                const proposed = options.find((option) => option.action === answer.action);
                if (proposed) { selection = proposed; provider = answer.provider || 'external_agent'; reason = answer.reason || 'External bounded action.'; }
                else warnings.push({ key, code: 'invalid_agent_action', proposed: answer.action ?? null, fallback: fallback.action });
              } else if (decide) warnings.push({ key, code: 'invalid_agent_action', proposed: null, fallback: fallback.action });
            } catch (error) { warnings.push({ key, code: 'agent_error', message: String(error), fallback: fallback.action }); }
          }
          const causes = [state.policy_event_id, destination !== trip.destination ? state.shop_hours_event_id : null].filter(Boolean);
          const choice = emit(tick, person.id, 'choose_trip', { trip_id: trip.id, purpose: trip.purpose, chosen: selection.action, options: options.map((o) => o.action), provider, reason, caused_by: causes, assumption_ids: provider === 'fixture_rule' ? ['synthetic_choice_rule'] : ['external_agent_choice'] });
          decisions.push({ key, actor: person.id, tick, trip_id: trip.id, action: selection.action, route_id: selection.route_id, destination: selection.destination, provider, event_id: choice.id });
          if (selection.action === 'defer') {
            emit(tick, person.id, 'defer_trip', { trip_id: trip.id, caused_by: [choice.id], visual_cue: 'other', state_delta: { [`${person.id}.deferred_trips`]: 1 }, assumption_ids: ['synthetic_choice_rule'] });
            continue;
          }
          let cause = choice.id;
          if (selection.destination !== trip.destination) {
            const redirect = emit(tick, person.id, 'change_destination', { from: trip.destination, to: selection.destination, reason: destination !== trip.destination ? 'The synthetic local shop shortened its hours in a prior period.' : 'This synthetic detour bypasses the planned local stop.', caused_by: [choice.id], visual_cue: 'other', state_delta: { [`${person.id}.planned_destination`]: selection.destination }, assumption_ids: [destination !== trip.destination ? 'shop_hours_response' : 'bike_route_response'] });
            cause = redirect.id;
          }
          if (selection.cost_cad > state.cash[person.id]) throw new Error('Decision exceeded available cash');
          if (selection.action === 'bus') {
            state.cash[person.id] = round(state.cash[person.id] - selection.cost_cad);
            emit(tick, person.id, 'pay_fare', { amount_cad: selection.cost_cad, recipient: 'ttc', caused_by: [choice.id], visual_cue: 'exchange', state_delta: { [`${person.id}.cash_cad`]: -selection.cost_cad, 'ttc.receipts_cad': selection.cost_cad }, source_ids: ['ttc_fares'] });
          } else if (selection.cost_cad) {
            state.cash[person.id] = round(state.cash[person.id] - selection.cost_cad);
            emit(tick, person.id, 'pay_travel_cost', { amount_cad: selection.cost_cad, caused_by: [choice.id], visual_cue: 'exchange', state_delta: { [`${person.id}.cash_cad`]: -selection.cost_cad }, assumption_ids: ['mode_costs'] });
          }
          const travel = emit(tick, person.id, 'travel', { trip_id: trip.id, purpose: trip.purpose, from: person.home, to: selection.destination, route_id: selection.route_id, mode: selection.mode, visual_cue: selection.visual_cue, caused_by: [cause], state_delta: { [`${person.id}.location`]: selection.destination }, assumption_ids: selection.action.startsWith('bike') ? ['bike_route_response'] : ['synthetic_choice_rule'] });
          if (trip.purpose === 'errand' && selection.destination === 'local_shop') {
            const entry = emit(tick, person.id, 'enter_shop', { to: 'local_shop', caused_by: [travel.id], visual_cue: 'enter_shop', state_delta: { 'local_shop.visits': 1 } });
            const basket = Number(trip.basket_cad || 0);
            if (basket > 0 && basket <= state.cash[person.id] && random(seed, person.id, tick, trip.id, 'buy') < Number(person.purchase_chance ?? 1)) {
              state.cash[person.id] = round(state.cash[person.id] - basket);
              state.shop_receipts = round(state.shop_receipts + basket);
              const purchase = emit(tick, person.id, 'purchase', { amount_cad: basket, recipient: 'local_shop', caused_by: [entry.id], visual_cue: 'exchange', state_delta: { [`${person.id}.cash_cad`]: -basket, 'local_shop.receipts_cad': basket }, assumption_ids: ['basket_value', 'purchase_propensity'] });
              shopPurchases.push(purchase.id);
            }
          }
        }
      }
      state.shop_hours = state.shop_receipts < Number(spec.environment.shop_receipt_floor_cad || 0) ? Number(spec.environment.reduced_shop_hours || 6) : Number(spec.environment.shop_hours || 9);
      state.shop_hours_event_id = emit(tick, 'local_shop_owner', 'set_shop_hours', { hours: state.shop_hours, receipts_cad: state.shop_receipts, caused_by: shopPurchases, reason: 'Synthetic staffing rule based on this period’s local purchases.', visual_cue: 'work', state_delta: { 'local_shop.next_period_open_hours': state.shop_hours }, assumption_ids: ['shop_hours_response'] }).id;
    }
    return { events, decisions, metrics: reduceMetrics(events, spec.ticks), warnings };
  }

  async function runExperiment(spec, { seed = 42, personas = spec.personas, decide, replay_decisions } = {}) {
    validate(spec, personas);
    const people = clone(personas);
    const decisionCache = new Map(replay_decisions || []);
    const baseline = await runArm(spec, people, seed, 'baseline', decide, decisionCache);
    const intervention = await runArm(spec, people, seed, 'intervention', decide, decisionCache);
    const before = new Map(baseline.decisions.map((d) => [d.key, d]));
    const changed_decisions = intervention.decisions.filter((d) => {
      const prior = before.get(d.key);
      return prior?.action !== d.action || prior?.destination !== d.destination || prior?.route_id !== d.route_id;
    }).map((d) => ({ key: d.key, actor: d.actor, tick: d.tick, trip_id: d.trip_id,
      baseline: { action: before.get(d.key)?.action, route_id: before.get(d.key)?.route_id, destination: before.get(d.key)?.destination },
      intervention: { action: d.action, route_id: d.route_id, destination: d.destination },
      baseline_event_id: before.get(d.key)?.event_id, intervention_event_id: d.event_id }));
    return {
      schema_version: 'experiment.v1', study_id: spec.id, version: 1, seed,
      evidence_tier: spec.evidence_tier || 'speculative',
      scenario: { id: spec.id, question: spec.question, geography: spec.geography, ticks: spec.ticks, policy_start: spec.policy_start, intervention: clone(spec.intervention) },
      population: { count: people.length, source: spec.population_source || 'synthetic_fixture', representative: false },
      world: worldFor(spec, people, seed), personas: people,
      sources: clone(spec.sources || []), assumptions: clone(spec.assumptions || []),
      metric_definitions: clone(METRIC_DEFINITIONS), runs: { baseline, intervention }, changed_decisions,
      decision_replay: [...decisionCache.entries()],
      limitations: ['Synthetic sample and assumed behavior; no calibrated Toronto policy forecast.', 'Twin survey likeness does not validate mobility choices.', 'No citywide expansion weights or individual Toronto joint data.'],
    };
  }

  const api = { runExperiment, validate, reduceMetrics, metricDefinitions: METRIC_DEFINITIONS, notEstimable: NOT_ESTIMABLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualExperiment = api;
})(typeof window !== 'undefined' ? window : null);
