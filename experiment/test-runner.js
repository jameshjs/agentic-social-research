const assert = require('node:assert/strict');
const test = require('node:test');
const { runExperiment, reduceMetrics } = require('./runner');
const { fare, bike } = require('./fixtures');
const savedFare = require('./sample-fare.json');
const savedBike = require('./sample-bike.json');

const eventsOf = (result, arm, action) => result.runs[arm].events.filter((event) => event.action === action);

test('paired runs replay exactly and share all pre-policy decisions', async () => {
  for (const spec of [fare, bike]) {
    const first = await runExperiment(spec);
    assert.deepEqual(first, await runExperiment(spec));
    const baseline = first.runs.baseline.decisions.filter((d) => d.tick < spec.policy_start);
    const proposed = first.runs.intervention.decisions.filter((d) => d.tick < spec.policy_start);
    assert.deepEqual(proposed.map(({ action, route_id, destination }) => ({ action, route_id, destination })), baseline.map(({ action, route_id, destination }) => ({ action, route_id, destination })));
    assert.deepEqual(first.runs.intervention.metrics.by_tick[0], first.runs.baseline.metrics.by_tick[0]);
    for (const arm of ['baseline', 'intervention']) {
      assert.deepEqual(first.runs[arm].metrics, reduceMetrics(first.runs[arm].events, spec.ticks));
      const ids = new Set(first.runs[arm].events.map((event) => event.id));
      for (const event of first.runs[arm].events) for (const parent of event.caused_by || []) assert.ok(ids.has(parent), `${parent} must exist`);
    }
  }
});

test('an empty intervention yields the same sample outcomes', async () => {
  const result = await runExperiment({ ...fare, intervention: [] });
  assert.deepEqual(result.changed_decisions, []);
  assert.deepEqual(result.runs.baseline.metrics, result.runs.intervention.metrics);
});

test('fare chain is decision → receipts → hours → later destination', async () => {
  const result = await runExperiment(fare);
  const policy = result.runs.intervention;
  assert.equal(policy.metrics.totals.household_fare_spend_cad, policy.metrics.totals.fare_revenue_cad);
  assert.equal(policy.metrics.totals.household_shopping_spend_cad, policy.metrics.totals.shop_sales_cad);
  assert.ok(policy.metrics.totals.bus_trips < result.runs.baseline.metrics.totals.bus_trips);
  const policyFares = eventsOf(result, 'intervention', 'pay_fare');
  assert.ok(policyFares.some((event) => event.actor === 'nadia' && event.tick >= 2 && event.amount_cad === 2.1));
  assert.ok(policyFares.some((event) => event.actor === 'jun' && event.tick >= 2 && event.amount_cad === 3.8));
  const deferral = eventsOf(result, 'intervention', 'defer_trip').find((event) => event.actor === 'maria' && event.tick === 3);
  const hours = eventsOf(result, 'intervention', 'set_shop_hours').find((event) => event.tick === 3);
  const redirect = eventsOf(result, 'intervention', 'change_destination').find((event) => event.tick === 4 && event.from === 'local_shop');
  assert.ok(deferral && hours && redirect);
  assert.equal(hours.hours, 6);
  const priorChoice = policy.events.find((event) => event.id === redirect.caused_by[0]);
  assert.ok(priorChoice.caused_by.includes(hours.id));
  assert.ok(result.changed_decisions.some((change) => change.actor === redirect.actor && change.intervention.destination === 'plaza'));
  assert.equal(result.runs.baseline.metrics.by_tick[3].shop_open_hours, 9);
});

test('Bloor removal changes bounded routes and local receipts without inventing car gains', async () => {
  const result = await runExperiment(bike);
  assert.ok(result.changed_decisions.some((change) => change.baseline.action === 'bike_bloor' && change.intervention.action === 'bike_detour'));
  assert.ok(result.runs.intervention.metrics.totals.local_shop_visits < result.runs.baseline.metrics.totals.local_shop_visits);
  assert.ok(result.runs.intervention.metrics.totals.shop_sales_cad < result.runs.baseline.metrics.totals.shop_sales_cad);
  assert.equal(result.runs.intervention.metrics.totals.car_trips, result.runs.baseline.metrics.totals.car_trips);
  assert.equal(result.runs.intervention.metrics.not_estimable.find((m) => m.id === 'injuries').value, null);
  assert.equal(result.runs.intervention.metrics.not_estimable.find((m) => m.id === 'business_closures').value, null);
});

test('external agents are bounded, cached for identical states, and replayable', async () => {
  let calls = 0;
  const decide = async (request) => {
    calls++;
    assert.equal('arm' in request, false);
    return { action: request.person.id === 'nadia' ? 'teleport' : 'bus', provider: 'test_agent' };
  };
  const result = await runExperiment(fare, { decide });
  assert.ok(result.runs.baseline.warnings.some((warning) => warning.code === 'invalid_agent_action'));
  assert.ok(result.runs.intervention.warnings.some((warning) => warning.code === 'invalid_agent_action'));
  assert.ok(result.runs.baseline.decisions.some((choice) => choice.provider === 'test_agent'));
  assert.ok(calls < result.runs.baseline.decisions.length + result.runs.intervention.decisions.length);
  const replay = await runExperiment(fare, { replay_decisions: result.decision_replay });
  assert.deepEqual(replay.runs.baseline.decisions, result.runs.baseline.decisions);
  assert.deepEqual(replay.runs.intervention.decisions, result.runs.intervention.decisions);
  assert.deepEqual(replay.runs.intervention.metrics, result.runs.intervention.metrics);
});

test('unsupported intervention is rejected instead of silently model-executed', async () => {
  await assert.rejects(runExperiment({ ...fare, intervention: [{ operator: 'run_code', script: 'noop' }] }), /Unsupported intervention/);
});

test('the checked-in offline runs match the controller and fixtures', async () => {
  assert.deepEqual(await runExperiment(fare), savedFare);
  assert.deepEqual(await runExperiment(bike), savedBike);
});
