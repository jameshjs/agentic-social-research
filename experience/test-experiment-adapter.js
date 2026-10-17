const assert = require('node:assert/strict');
const test = require('node:test');
const { toBikeScenario } = require('./experiment-adapter');
const result = require('../experiment/sample-bike.json');

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
