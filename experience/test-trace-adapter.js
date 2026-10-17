const assert = require('node:assert/strict');
const sim = require('../demo-ui/sim.js');
const adapter = require('./trace-adapter.js');

const sectors = Object.fromEntries(['mobility', 'access', 'commerce', 'households', 'public'].map(key => [key, {}]));
const first = sim.buildTrace({ seed: 42, version: 1 });
const revised = sim.buildTrace({
  seed: 42,
  version: 2,
  assumptions: first.assumptions.map(assumption => assumption.id === 'low_income_mult'
    ? { ...assumption, value: 1, status: 'accepted' }
    : assumption),
});

const a = adapter.toFareScenario(first, { id: 'fare', sectors });
const b = adapter.toFareScenario(revised, { id: 'fare', sectors });
assert.deepEqual(first.runs.baseline.metrics.by_tick, revised.runs.baseline.metrics.by_tick);
assert.deepEqual(a.sectors.mobility.baseline, first.runs.baseline.metrics.by_tick.map(row => row.bus_trips));
assert.deepEqual(a.sectors.mobility.policy, first.runs.intervention.metrics.by_tick.map(row => row.bus_trips));
assert.deepEqual(a.sectors.households.policy, first.runs.intervention.metrics.by_group.near_poor.map(row => row.fare_burden_pct));
assert.notEqual(a.headline.value, b.headline.value);
assert.notDeepEqual(a.sectors.mobility.policy, b.sectors.mobility.policy);
assert.equal(b.trace.version, 2);
console.log('TTC trace adapter: v1/v2 metrics update from the same seeded result');
