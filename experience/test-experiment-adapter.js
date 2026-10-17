const assert = require('node:assert/strict');
const test = require('node:test');
const { toBikeScenario, toFareScenario } = require('./experiment-adapter');
const result = require('../experiment/sample-bike.json');
const fare = require('../experiment/sample-fare.json');

test('Bloor dashboard series and headline are read from the paired event result', () => {
  const template = { id: 'bike', sectors: Object.fromEntries(['mobility', 'access', 'commerce', 'households', 'public'].map((key) => [key, { icon: 'x' }])) };
  const scenario = toBikeScenario(result, template);
  assert.equal(scenario.experiment, result);
  assert.equal(scenario.headline.value, '5 / 10');
  for (const [sector, field] of Object.entries({ mobility: 'bloor_route_trips', access: 'plaza_arrivals', commerce: 'shop_sales_cad', households: 'household_transport_spend_cad', public: 'fare_revenue_cad' })) {
    assert.deepEqual(scenario.sectors[sector].baseline, result.runs.baseline.metrics.by_tick.map((point) => point[field]));
    assert.deepEqual(scenario.sectors[sector].policy, result.runs.intervention.metrics.by_tick.map((point) => point[field]));
  }
});

test('TTC fare dashboard reads the paired experiment.v1 result and labels who decided', () => {
  const template = { id: 'fare', sectors: Object.fromEntries(['mobility', 'access', 'commerce', 'households', 'public'].map((key) => [key, { icon: 'x' }])) };
  const scenario = toFareScenario(fare, template);
  assert.equal(scenario.experiment, fare);
  assert.equal(scenario.headline.value, '11 / 12');
  for (const [sector, field] of Object.entries({ mobility: 'bus_trips', access: 'deferred_trips', commerce: 'shop_sales_cad', households: 'household_fare_spend_cad', public: 'fare_revenue_cad' })) {
    assert.deepEqual(scenario.sectors[sector].baseline, fare.runs.baseline.metrics.by_tick.map((point) => point[field]));
    assert.deepEqual(scenario.sectors[sector].policy, fare.runs.intervention.metrics.by_tick.map((point) => point[field]));
  }
  assert.match(scenario.sourceRibbon, /fixture-rule decisions/);
  const live = structuredClone(fare);
  live.runs.intervention.decisions[0].provider = 'claude-haiku-5-5';
  assert.match(toFareScenario(live, template).sourceRibbon, /1\/128 persona-agent decisions/);
  assert.throws(() => toFareScenario(result, template), TypeError);
});
