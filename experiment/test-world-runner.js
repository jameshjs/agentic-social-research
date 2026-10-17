const assert = require('node:assert/strict');
const test = require('node:test');
const { runWorldExperiment, reduceWorldMetrics, leversFor, validateWorldSpec, METRIC_DEFINITIONS, NOT_ESTIMABLE } = require('./world-runner');
const { createSandbox } = require('../world/sandbox.js');
const { fare, bike } = require('./world-fixtures');
const world = require('../data/world/bloor_spadina_bathurst.json');
const savedFare = require('./sample-world-fare.json');
const savedBike = require('./sample-world-bike.json');

const run = (spec, options = {}) => runWorldExperiment(spec, { world, ...options });
let pair;
const prepared = () => (pair ||= Promise.all([run(fare), run(bike)]));
const ARMS = ['baseline', 'intervention'];
const SPECS = { fare, bike };
const eventsOf = (result, arm, action) => result.runs[arm].events.filter((e) => e.action === action);
const choice = (d) => ({ action: d.action, route: d.route, destination: d.destination });
const legKey = (e) => `${e.tick}|${e.actor}|${e.trip_id}|${e.leg}`;
const minutes = (e) => (e.arrive_t - e.depart_t) / 60;
const persona = (result, id) => result.personas.find((p) => p.id === id);
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// The Game Master graph each arm-tick actually ran on (the bike removal drops the track nodes).
const graphs = new Map();
const graphFor = (spec, arm, tick) => {
  const policy = leversFor(spec, arm, tick);
  const key = JSON.stringify(policy);
  if (!graphs.has(key)) graphs.set(key, createSandbox(world, { policy }).graph);
  return graphs.get(key);
};

test('fare and bike share one population, map and places', async () => {
  const [f, b] = await prepared();
  assert.equal(f.schema_version, 'experiment.v2');
  assert.deepEqual(f.personas, b.personas);
  assert.deepEqual(f.population, b.population);
  assert.deepEqual(f.places, b.places);
  assert.deepEqual(f.world, b.world);
  assert.equal(f.population.shared_across_scenarios, true);
  assert.equal(f.population.representative, false);
  assert.equal(f.population.residents + f.population.visitors, f.population.count);
  assert.equal(f.population.count, fare.population.personas.length);
  for (const p of f.personas) {
    if (p.home.kind === 'mapped') { assert.ok(Number.isFinite(p.home.x) && Number.isFinite(p.home.y), p.id); assert.ok(p.home.street); }
    else assert.ok(p.home.label);
  }
  // Both baselines run the same levers on the same people, so they are the same world.
  assert.deepEqual(f.runs.baseline.metrics, b.runs.baseline.metrics);
  assert.deepEqual(f.runs.baseline.decisions.map(choice), b.runs.baseline.decisions.map(choice));
  assert.equal(f.scenario_id, 'fare');
  assert.equal(b.scenario_id, 'bike');
});

test('same seed replays exactly and pre-policy ticks match across arms', async () => {
  for (const spec of [fare, bike]) {
    const first = await run(spec);
    assert.deepEqual(first, await run(spec));
    const pre = (arm) => first.runs[arm].decisions.filter((d) => d.tick < spec.policy_start).map(choice);
    assert.deepEqual(pre('intervention'), pre('baseline'));
    for (let tick = 1; tick < spec.policy_start; tick++) assert.deepEqual(first.runs.intervention.metrics.by_tick[tick - 1], first.runs.baseline.metrics.by_tick[tick - 1]);
    const policy = eventsOf(first, 'intervention', 'policy_change');
    assert.equal(policy.length, 1);
    assert.equal(policy[0].tick, spec.policy_start);
    assert.deepEqual(policy[0].source_ids, spec.policy_source_ids);
    assert.equal(eventsOf(first, 'baseline', 'policy_change').length, 0);
    for (const e of eventsOf(first, 'intervention', 'choose_trip')) assert.equal(e.caused_by.includes(policy[0].id), e.tick >= spec.policy_start);
    for (const change of first.changed_decisions) assert.ok(change.tick >= spec.policy_start);
    for (const arm of ARMS) assert.deepEqual(first.runs[arm].metrics, reduceWorldMetrics(first.runs[arm].events, spec.ticks, first.personas));
  }
});

test('an empty intervention yields identical arms', async () => {
  const result = await run({ ...fare, intervention: [] });
  assert.deepEqual(result.changed_decisions, []);
  assert.deepEqual(result.runs.baseline.metrics, result.runs.intervention.metrics);
  assert.deepEqual(result.runs.baseline.decisions.map(choice), result.runs.intervention.decisions.map(choice));
  assert.equal(eventsOf(result, 'intervention', 'policy_change').length, 0);
});

test('every leg is a Game Master move that starts where the last one ended', async () => {
  const ruleIds = new Set(world.rules.map((r) => r.id));
  const cue = { walk: 'walk', bike: 'ride_bike', car: 'drive', transit: 'ride_subway' };
  for (const result of await prepared()) {
    const spec = SPECS[result.scenario_id];
    for (const arm of ARMS) {
      const r = result.runs[arm];
      assert.equal(r.game_master.rejected_actions, 0);
      assert.ok(r.game_master.accepted_moves > 0);
      assert.equal(r.warnings.length, 0);
      const byId = new Map();
      for (const e of r.events) {
        for (const parent of e.caused_by) assert.ok(byId.has(parent), `${e.id} cites ${parent} before it exists`);
        byId.set(e.id, e);
        assert.equal(e.run_id, r.run_id);
        assert.equal(e.evidence, 'simulated');
        assert.ok(e.visual_cue);
      }
      const legs = new Map();
      for (const e of eventsOf(result, arm, 'travel')) {
        const graph = graphFor(spec, arm, e.tick);
        assert.equal(e.visual_cue, cue[e.mode]);
        const from = graph.nodes.get(e.from_node), to = graph.nodes.get(e.to_node);
        assert.ok(from && to, `${e.id} uses nodes outside its arm-tick graph`);
        // `+ 0` folds the sandbox's -0 coordinates; results are plain JSON.
        assert.deepEqual(e.path[0], [from.x + 0, from.y + 0, e.depart_t]);
        assert.deepEqual(e.path.at(-1), [to.x + 0, to.y + 0, e.arrive_t]);
        for (let i = 1; i < e.path.length; i++) {
          assert.ok(e.path[i][2] >= e.path[i - 1][2], `${e.id} path runs backwards in time`);
          assert.notDeepEqual(e.path[i], e.path[i - 1]);
        }
        assert.ok(e.steps.length > 0);
        assert.equal(e.steps[0].t, e.depart_t);
        assert.equal(graph.edges.get(e.steps[0].edge).from, e.from_node);
        assert.equal(graph.edges.get(e.steps.at(-1).edge).to, e.to_node);
        for (let i = 1; i < e.steps.length; i++) assert.equal(graph.edges.get(e.steps[i].edge).from, graph.edges.get(e.steps[i - 1].edge).to, `${e.id} jumps between edges`);
        for (const id of e.rule_ids) assert.ok(ruleIds.has(id));
        assert.ok(e.rule_ids.includes('mode_edges') && e.rule_ids.includes('no_teleport'));
        if (e.steps.some((s) => s.edge.startsWith('line2'))) assert.ok(e.rule_ids.includes('board_scheduled_only'));
        if (e.steps.some((s) => s.crosswalk)) assert.ok(e.rule_ids.includes('cross_at_crosswalks'));
        if (e.uses_bloor) assert.ok(['bike', 'car'].includes(e.mode));
        for (const s of e.steps) assert.ok(graph.edges.has(s.edge), s.edge);
        legs.set(legKey(e), e);
      }
      for (const e of legs.values()) {
        if (e.leg === 0) continue;
        const prev = legs.get(legKey({ ...e, leg: e.leg - 1 }));
        assert.ok(prev, `${e.id} has no previous leg`);
        assert.equal(e.from_node, prev.to_node, `${e.id} teleported`);
        assert.equal(e.depart_t, prev.arrive_t);
        assert.deepEqual(e.path[0], prev.path.at(-1));
      }
      // Shops are entered only at their door, straight after travelling there; purchases follow an entry.
      const visits = eventsOf(result, arm, 'enter_business');
      assert.ok(visits.length > 0);
      for (const visit of visits) {
        const door = graphFor(spec, arm, visit.tick).nodes.get(visit.node);
        assert.equal(door.kind, 'door');
        assert.ok(door.business_ids.includes(visit.business_id));
        const arrival = byId.get(visit.caused_by[0]);
        assert.equal(arrival.action, 'travel', `${visit.id} entered without travelling`);
        assert.equal(arrival.to_node, visit.node);
        assert.equal(arrival.actor, visit.actor);
        assert.equal(arrival.trip_id, visit.trip_id);
        assert.equal(arrival.tick, visit.tick);
        assert.equal(visit.t, arrival.arrive_t);
      }
      for (const buy of eventsOf(result, arm, 'purchase')) {
        assert.equal(buy.caused_by.length, 1);
        const entry = byId.get(buy.caused_by[0]);
        assert.equal(entry.action, 'enter_business', `${buy.id} bought without entering`);
        assert.equal(entry.business_id, buy.recipient);
        assert.equal(entry.actor, buy.actor);
      }
    }
  }
});

test('shop-hours cascade: a destination change cites only reduced shop hours', async () => {
  for (const result of await prepared()) {
    let cascades = 0;
    for (const arm of ARMS) {
      const byId = new Map(result.runs[arm].events.map((e) => [e.id, e]));
      for (const e of eventsOf(result, arm, 'change_destination')) {
        const hours = e.caused_by.map((id) => byId.get(id)).filter((x) => x.action === 'set_shop_hours');
        for (const h of hours) {
          assert.equal(h.reduced, true, `${e.id} cites unreduced hours ${h.id}`);
          assert.equal(h.business_id, e.from);
          assert.ok(h.tick < e.tick);
        }
        if (hours.length) cascades++;
      }
    }
    assert.ok(cascades > 0, `${result.scenario_id}: the staffing rule feeds back into some choice`);
  }
});

test('fare: adult fare rises 50 cents from policy_start while Fair Pass stays at $2.10', async () => {
  const [result] = await prepared();
  const fairPass = new Set(result.personas.filter((p) => p.fare_category === 'fair_pass').map((p) => p.id));
  assert.ok(fairPass.size > 0);
  let fairPolicy = 0, adultPolicy = 0;
  for (const arm of ARMS) {
    const r = result.runs[arm];
    const byId = new Map(r.events.map((e) => [e.id, e]));
    for (const pay of eventsOf(result, arm, 'pay_fare')) {
      const ride = byId.get(pay.caused_by[0]);
      assert.equal(ride.action, 'travel');
      assert.ok(ride.steps.some((s) => s.edge === pay.edge && s.fare_cad === pay.amount_cad));
      assert.equal(pay.recipient, 'ttc');
      if (fairPass.has(pay.actor)) {
        assert.equal(pay.amount_cad, 2.1);
        assert.equal(pay.fare_product, 'fair_pass');
        if (arm === 'intervention' && pay.tick >= fare.policy_start) fairPolicy++;
      } else {
        const policyTick = arm === 'intervention' && pay.tick >= fare.policy_start;
        assert.equal(pay.amount_cad, policyTick ? 3.8 : 3.3);
        assert.equal(pay.fare_product, 'adult');
        if (policyTick) adultPolicy++;
      }
    }
    for (const point of r.metrics.by_tick) {
      // One ledger: what households pay is what the TTC and the shops receive.
      assert.equal(point.fare_revenue_cad, point.household_fare_spend_cad);
      assert.equal(point.shop_sales_cad, point.household_shopping_spend_cad);
      assert.equal(r2(eventsOf(result, arm, 'pay_fare').filter((e) => e.tick === point.tick).reduce((s, e) => s + e.amount_cad, 0)), point.fare_revenue_cad);
      assert.equal(r2(eventsOf(result, arm, 'purchase').filter((e) => e.tick === point.tick).reduce((s, e) => s + e.amount_cad, 0)), point.shop_sales_cad);
      assert.ok(point.household_transport_spend_cad >= point.household_fare_spend_cad);
      const groups = Object.values(r.metrics.by_group);
      assert.equal(r2(groups.reduce((s, g) => s + g.household_fare_spend_cad[point.tick - 1], 0)), point.household_fare_spend_cad);
      assert.equal(groups.reduce((s, g) => s + g.transit_trips[point.tick - 1], 0), point.transit_trips);
    }
    assert.equal(r.metrics.totals.fare_revenue_cad, r.metrics.totals.household_fare_spend_cad);
    assert.equal(r.metrics.totals.shop_sales_cad, r.metrics.totals.household_shopping_spend_cad);
  }
  assert.ok(fairPolicy > 0 && adultPolicy > 0, 'both fare products are exercised after the change');
  assert.deepEqual(Object.keys(result.runs.baseline.metrics.by_group), ['adult', 'fair_pass']);
  assert.ok(result.changed_decisions.length > 0, 'the fare change alters at least one decision');
  for (const change of result.changed_decisions) assert.ok(!fairPass.has(change.actor), `Fair Pass rider ${change.actor} changed a decision`);
  assert.equal(result.scenario.levers.intervention.adult_fare_cad, 3.8);
  // The fare lever does not touch the road: any car leg made in both arms takes the same time,
  // and in ticks where the same car legs exist the driver metric is identical.
  const cars = (arm) => new Map(eventsOf(result, arm, 'travel').filter((e) => e.mode === 'car').map((e) => [legKey(e), e]));
  const base = cars('baseline'), policy = cars('intervention');
  let shared = 0;
  for (const [key, e] of base) if (policy.has(key)) {
    assert.equal(minutes(policy.get(key)), minutes(e));
    assert.deepEqual(policy.get(key).steps, e.steps);
    shared++;
  }
  assert.ok(shared > 0);
  for (let tick = 1; tick <= fare.ticks; tick++) {
    const keys = (m) => [...m.keys()].filter((k) => k.startsWith(`${tick}|`)).sort();
    if (JSON.stringify(keys(base)) === JSON.stringify(keys(policy))) {
      assert.equal(result.runs.intervention.metrics.by_tick[tick - 1].driver_mapped_minutes, result.runs.baseline.metrics.by_tick[tick - 1].driver_mapped_minutes);
    }
  }
});

test('bike: removal moves Bloor cyclists into car lanes without driver gains or injury estimates', async () => {
  const [, result] = await prepared();
  let shared = 0;
  for (const arm of ARMS) {
    for (const e of eventsOf(result, arm, 'travel').filter((x) => x.mode === 'bike')) {
      const removed = arm === 'intervention' && e.tick >= bike.policy_start;
      if (!removed) { assert.equal(e.shared_with_cars_m, 0); assert.ok(!e.steps.some((s) => s.shared_with_cars)); }
      else if (e.uses_bloor) { assert.ok(e.shared_with_cars_m > 0, e.id); assert.ok(!e.steps.some((s) => s.edge.startsWith('trk_'))); shared++; }
    }
  }
  assert.ok(shared > 0, 'some cyclist still rides Bloor after removal');
  for (const point of result.runs.baseline.metrics.by_tick) assert.equal(point.bloor_shared_cycling_m, 0);
  // Removing the track adds no car lane, so drivers gain no time. With James's calibrated background
  // queues (world/background.js), cyclists in the car lane count 0.5 PCE, so a driver may wait a little
  // longer after removal, never less. Same car legs (route), never faster.
  const cars = (arm) => new Map(eventsOf(result, arm, 'travel').filter((e) => e.mode === 'car').map((e) => [legKey(e), e]));
  const baseCars = cars('baseline'), policyCars = cars('intervention');
  assert.ok(baseCars.size > 0);
  assert.deepEqual([...policyCars.keys()], [...baseCars.keys()], 'the same car trips happen in both arms');
  for (const [key, e] of policyCars) {
    const b = baseCars.get(key);
    assert.deepEqual(e.steps.map((s) => s.edge), b.steps.map((s) => s.edge), key);
    assert.ok(minutes(e) >= minutes(b) - 1e-9, `${key}: removal must not speed up a driver`);
  }
  result.runs.intervention.metrics.by_tick.forEach((p, i) => assert.ok(p.driver_mapped_minutes >= result.runs.baseline.metrics.by_tick[i].driver_mapped_minutes, `P${i + 1} driver minutes`));
  for (const id of ['injuries', 'business_closures', 'driver_time_beyond_section', 'emissions_kg', 'gdp_cad', 'citywide_ttc_revenue_cad', 'removal_construction_cost_cad']) {
    const item = result.not_estimable.find((m) => m.id === id);
    assert.ok(item && item.value === null && item.status === 'not_estimable' && item.reason, id);
  }
  assert.ok(result.changed_decisions.length > 0, 'the removal alters at least one decision');
  // A removal never makes a safety-sensitive cyclist start riding Bloor.
  for (const change of result.changed_decisions) {
    if (change.intervention.action === 'bike_bloor') assert.ok(persona(result, change.actor).bike_safety_sensitivity < 1.4, change.key);
  }
  assert.equal(result.scenario.levers.intervention.bloor_cycle_track, 'none');
  assert.equal(result.scenario.levers.baseline.bloor_cycle_track, undefined, 'baseline keeps the sandbox default (protected)');
});

test('external decisions are bounded, cached for identical states, and replayable', async () => {
  let calls = 0;
  const decide = async (request) => {
    calls++;
    assert.equal('arm' in request, false);
    assert.ok(!JSON.stringify(request).includes('baseline') && !JSON.stringify(request).includes('intervention'));
    assert.ok(request.options.some((o) => o.action === 'defer'));
    return { action: request.person.id === 'nadia' ? 'teleport' : request.options[0].action, provider: 'test_agent', reason: 'first listed option' };
  };
  const result = await run(fare, { decide });
  for (const arm of ARMS) {
    assert.ok(result.runs[arm].warnings.some((w) => w.code === 'invalid_agent_action' && w.proposed === 'teleport'));
    assert.ok(result.runs[arm].decisions.some((d) => d.provider === 'test_agent'));
    assert.ok(result.runs[arm].decisions.filter((d) => d.actor === 'nadia').every((d) => d.provider === 'fixture_rule'));
    assert.equal(result.runs[arm].game_master.rejected_actions, 0);
  }
  assert.ok(calls < result.runs.baseline.decisions.length + result.runs.intervention.decisions.length, 'identical pre-policy states reuse one answer');
  assert.equal(calls, result.decision_replay.length);
  let replayCalls = 0;
  const replay = await run(fare, { replay_decisions: result.decision_replay, decide: async () => { replayCalls++; return { action: 'defer' }; } });
  assert.equal(replayCalls, 0, 'a full replay needs no model calls');
  for (const arm of ARMS) {
    assert.deepEqual(replay.runs[arm].decisions, result.runs[arm].decisions);
    assert.deepEqual(replay.runs[arm].metrics, result.runs[arm].metrics);
  }
  const failing = await run(fare, { decide: async () => { throw new Error('model offline'); } });
  assert.ok(failing.runs.baseline.warnings.length > 0);
  assert.ok(failing.runs.baseline.warnings.every((w) => w.code === 'agent_error'));
  assert.deepEqual(failing.runs.baseline.decisions.map(choice), (await prepared())[0].runs.baseline.decisions.map(choice));
});

test('sensitivity overrides are validated and recorded', async () => {
  const [result, bikeResult] = await prepared();
  assert.deepEqual(result.assumption_values, { cost_weight: 0.5, unprotected_cycling_discomfort_per_km: 4, shop_staffing_response: true });
  assert.deepEqual(result.assumption_overrides, {});
  const off = await run(fare, { overrides: { shop_staffing_response: false } });
  assert.equal(off.assumption_values.shop_staffing_response, false);
  assert.deepEqual(off.assumption_overrides, { shop_staffing_response: false });
  for (const arm of ARMS) {
    for (const point of off.runs[arm].metrics.by_tick) assert.equal(point.shops_reduced_hours, 0);
    for (const e of eventsOf(off, arm, 'set_shop_hours')) assert.equal(e.reduced, false);
  }
  // With no discomfort from riding with cars, nobody leaves the Bloor route because of the removal.
  assert.ok(bikeResult.changed_decisions.some((c) => c.baseline.action === 'bike_bloor'));
  const calm = await run(bike, { overrides: { unprotected_cycling_discomfort_per_km: 0 } });
  assert.equal(calm.assumption_values.unprotected_cycling_discomfort_per_km, 0);
  for (const change of calm.changed_decisions) assert.notEqual(change.baseline.action, 'bike_bloor', change.key);
  await assert.rejects(run(fare, { overrides: { retail_elasticity: -0.3 } }), /Unknown assumption override retail_elasticity/);
  await assert.rejects(run(fare, { overrides: { cost_weight: 'high' } }), /Invalid value for cost_weight/);
  await assert.rejects(run(fare, { overrides: { shop_staffing_response: 1 } }), /Invalid value for shop_staffing_response/);
});

test('unsupported interventions and broken specs are rejected before running', async () => {
  await assert.rejects(run({ ...fare, intervention: [{ operator: 'run_code', script: 'noop' }] }), /Unsupported intervention run_code/);
  await assert.rejects(run({ ...fare, intervention: [{ operator: 'set_lever', lever: 'free_parking', value: true }] }), /Unsupported intervention set_lever on free_parking/);
  await assert.rejects(run({ ...fare, intervention: [{ operator: 'set_lever', lever: 'bloor_cycle_track', value: 'hovering' }] }), /bloor_cycle_track must be protected, painted or none/);
  await assert.rejects(runWorldExperiment(fare, {}), /World missing does not match/);
  const v = (patch) => () => validateWorldSpec({ ...fare, ...patch }, world);
  assert.throws(v({ intervention: [{ operator: 'change_cost', lever: 'adult_fare_cad', delta_cad: -5 }] }), /negative adult fare/);
  assert.throws(v({ environment: { adult_fare_cad: -1, fair_pass_fare_cad: 2.1 } }), /non-negative/);
  assert.throws(v({ ticks: 0 }), /1–12 ticks/);
  assert.throws(v({ ticks: 13 }), /1–12 ticks/);
  assert.throws(v({ policy_start: 5 }), /policy_start/);
  assert.throws(v({ policy_start: 0 }), /policy_start/);
  assert.throws(v({ population: { personas: [] } }), /synthetic population/);
  assert.throws(() => validateWorldSpec(fare, { ...world, id: 'somewhere-else' }), /does not match/);
  const people = fare.population.personas;
  assert.throws(v({ population: { personas: [people[0], people[0]] } }), /duplicate persona/);
  assert.throws(v({ shops: [...fare.shops, { business_id: 'osm_missing', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 1 }] }), /osm_missing has no mapped door/);
  const lost = { ...people[0], routine: [{ ...people[0].routine[0], options: [{ ...people[0].routine[0].options[0], legs: [{ mode: 'walk', to: 'nowhere' }] }] }] };
  assert.throws(v({ population: { personas: [lost] } }), /Unknown node nowhere/);
  // Boarding Line 2 from a side-street home without walking to the station first.
  const jumper = { ...people[0], routine: [{ ...people[0].routine[0], options: [{ ...people[0].routine[0].options[0], legs: [{ mode: 'transit', ride: 'line2_eb' }] }] }] };
  assert.throws(v({ population: { personas: [jumper] } }), /Ride line2_eb must start at its station/);
  assert.doesNotThrow(() => validateWorldSpec(fare, world));
  assert.doesNotThrow(() => validateWorldSpec(bike, world));
});

test('levers: baseline keeps sandbox defaults, the intervention applies from policy_start', () => {
  assert.deepEqual(leversFor(fare, 'baseline', 3), { adult_fare_cad: 3.3 });
  assert.deepEqual(leversFor(fare, 'intervention', 1), { adult_fare_cad: 3.3 });
  assert.deepEqual(leversFor(fare, 'intervention', 2), { adult_fare_cad: 3.8 });
  assert.deepEqual(leversFor(bike, 'baseline', 4), { adult_fare_cad: 3.3 });
  assert.deepEqual(leversFor(bike, 'intervention', 1), { adult_fare_cad: 3.3 });
  assert.deepEqual(leversFor(bike, 'intervention', 4), { adult_fare_cad: 3.3, bloor_cycle_track: 'none' });
  assert.deepEqual(leversFor({ ...fare, intervention: [] }, 'intervention', 4), { adult_fare_cad: 3.3 });
});

test('a compiled set_lever spec runs: halving Line 2 frequency lengthens platform waits', async () => {
  const spec = { ...fare, id: 'bloor-section-line2-headway-x2', scenario_id: 'compiled', question: 'What if Line 2 ran half as often?', intervention: [{ operator: 'set_lever', lever: 'line2_headway_multiplier', value: 2 }] };
  const result = await run(spec);
  assert.equal(result.scenario_id, 'compiled');
  assert.equal(result.scenario.levers.intervention.line2_headway_multiplier, 2);
  const meanWait = (arm) => {
    const waits = eventsOf(result, arm, 'travel').filter((e) => e.tick >= spec.policy_start).flatMap((e) => e.steps.filter((s) => s.edge.startsWith('line2')).map((s) => s.wait_s));
    assert.ok(waits.length > 0);
    return waits.reduce((s, w) => s + w, 0) / waits.length;
  };
  assert.ok(meanWait('intervention') > meanWait('baseline'));
  for (const arm of ARMS) assert.equal(result.runs[arm].game_master.rejected_actions, 0);
});

test('metric definitions and points come from committed events', async () => {
  for (const def of METRIC_DEFINITIONS) {
    assert.ok(['sum', 'mean'].includes(def.aggregation), def.id);
    assert.equal(def.status, 'assumption_driven');
    assert.ok(def.label && def.unit && def.time_grain);
  }
  assert.ok(NOT_ESTIMABLE.every((m) => m.value === null && m.status === 'not_estimable' && m.reason));
  for (const result of await prepared()) {
    for (const arm of ARMS) {
      const r = result.runs[arm];
      const ids = new Set(r.events.map((e) => e.id));
      assert.equal(r.metric_points.length, METRIC_DEFINITIONS.length * result.scenario.ticks);
      for (const point of r.metric_points) {
        assert.equal(point.value, r.metrics.by_tick[point.tick - 1][point.metric_id]);
        assert.equal(point.run_id, r.run_id);
        assert.equal(point.arm, arm);
        for (const id of point.event_ids) assert.ok(ids.has(id));
        if (point.value === null) assert.equal(point.event_ids.length, 0);
      }
      const completed = eventsOf(result, arm, 'trip_completed').length;
      assert.equal(r.metrics.totals.completed_trips, completed);
      assert.equal(completed + eventsOf(result, arm, 'defer_trip').length, r.decisions.length);
      for (const d of r.decisions) {
        const e = r.events.find((x) => x.id === d.event_id);
        assert.equal(e.action, 'choose_trip');
        assert.deepEqual(choice({ ...e, action: e.chosen }), choice(d));
        assert.equal(d.key, `${d.tick}:${d.actor}:${d.trip_id}`);
      }
    }
    for (const change of result.changed_decisions) {
      const b = result.runs.baseline.decisions.find((d) => d.key === change.key);
      const i = result.runs.intervention.decisions.find((d) => d.key === change.key);
      assert.deepEqual(change.baseline, choice(b));
      assert.deepEqual(change.intervention, choice(i));
      assert.notDeepEqual(change.baseline, change.intervention);
      assert.equal(change.baseline_event_id, b.event_id);
      assert.equal(change.intervention_event_id, i.event_id);
    }
  }
});

test('a full fare run stays under two seconds once the background is fitted', async () => {
  // The first sandbox per world fits side-street exchange to the observed counts (~2 s, once per
  // page or process); every later paired run reuses it and the cached background traffic.
  await prepared();
  const started = Date.now();
  await run(fare);
  assert.ok(Date.now() - started < 2000, `fare run took ${Date.now() - started} ms`);
});

test('loads as browser globals (no require) and reproduces the Node run', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const context = vm.createContext({});
  context.window = context;
  for (const file of ['../world/background.js', '../world/sandbox.js', './world-fixtures.js', './world-runner.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  assert.equal(vm.runInContext('typeof require + typeof module', context), 'undefinedundefined');
  const result = await context.CounterfactualWorldExperiment.runWorldExperiment(context.CounterfactualWorldFixtures.bike, { world });
  const [, nodeRun] = await prepared();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(nodeRun)));
});

test('checked-in offline snapshots match fresh runs', async () => {
  const [f, b] = await prepared();
  assert.deepEqual(f, savedFare);
  assert.deepEqual(b, savedBike);
});
