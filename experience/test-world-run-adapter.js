const assert = require('node:assert/strict');
const test = require('node:test');
const { toMappedScenario } = require('./world-run-adapter');
const fareRun = require('../experiment/sample-world-fare.json');
const bikeRun = require('../experiment/sample-world-bike.json');
const v1Run = require('../experiment/sample-bike.json');

const KEYS = ['mobility', 'access', 'commerce', 'households', 'public'];
const template = (id) => ({ id, mapTag: 'TAG', sectors: Object.fromEntries(KEYS.map((key) => [key, { icon: 'x', number: key }])) });
const byTick = (result, arm, ids) => result.runs[arm].metrics.by_tick.map((p) => (ids.length === 1 ? p[ids[0]] : ids.reduce((s, id) => s + p[id], 0)));
const EXPECTED = {
  fare: { mobility: ['transit_trips'], access: ['deferred_trips', 'errands_elsewhere'], commerce: ['shop_sales_cad'], households: ['household_fare_spend_cad'], public: ['fare_revenue_cad'] },
  bike: { mobility: ['bloor_bike_trips'], access: ['bloor_shared_cycling_m'], commerce: ['shop_sales_cad'], households: ['household_transport_spend_cad'], public: ['driver_mapped_minutes'] },
};

test('both prepared runs map onto the dashboard from by_tick series only', () => {
  for (const result of [fareRun, bikeRun]) {
    const kind = result.scenario_id;
    const scenario = toMappedScenario(result, template(kind));
    assert.equal(scenario.run, result);
    assert.equal(scenario.id, kind);
    assert.equal(scenario.mapTag, 'TAG');
    assert.equal(scenario.title, result.scenario.question);
    assert.equal(scenario.breadcrumb, 'BLOOR WEST · BATHURST–SPADINA');
    assert.equal(scenario.viewport, 'BATHURST–SPADINA SECTION');
    assert.equal(scenario.mini.length, 3);
    assert.ok(scenario.headline.label && scenario.headline.value && scenario.headline.direction);
    assert.match(scenario.sourceRibbon, new RegExp(`Seed ${result.seed} · v${result.version} · ${result.changed_decisions.length} changed decisions · synthetic responses`));
    for (const text of [scenario.summary, scenario.narrative]) assert.match(text, /not a Toronto forecast/);
    for (const key of KEYS) {
      const sector = scenario.sectors[key];
      assert.equal(sector.icon, 'x', 'template sector fields are kept');
      assert.deepEqual(sector.metric_ids, EXPECTED[kind][key]);
      assert.deepEqual(sector.baseline, byTick(result, 'baseline', EXPECTED[kind][key]), `${kind}/${key} baseline`);
      assert.deepEqual(sector.policy, byTick(result, 'intervention', EXPECTED[kind][key]), `${kind}/${key} policy`);
      for (const field of ['title', 'description', 'delta', 'chartTitle', 'unit', 'evidence']) assert.ok(sector[field], `${kind}/${key}.${field}`);
      assert.match(sector.evidence, /synthetic|assumption/i);
      assert.equal(sector.baseline.length, result.scenario.ticks);
    }
  }
});

test('fare headline compares sample TTC receipts per period after the change', () => {
  const scenario = toMappedScenario(fareRun, template('fare'));
  const mean = (arm) => {
    const values = fareRun.runs[arm].metrics.by_tick.filter((p) => p.tick >= fareRun.scenario.policy_start).map((p) => p.fare_revenue_cad);
    return `$${(Math.round(values.reduce((s, v) => s + v, 0) / values.length * 100) / 100).toFixed(2)}`;
  };
  assert.equal(scenario.headline.value, `${mean('intervention')} / ${mean('baseline')}`);
  assert.match(scenario.sectors.households.title, /Fair Pass stays at \$2\.10/);
  assert.match(scenario.sectors.households.description, /by_group/);
});

test('bike copy keeps exposure, injuries and driver time honest', () => {
  const scenario = toMappedScenario(bikeRun, template('bike'));
  const p4 = (arm) => bikeRun.runs[arm].metrics.by_tick.at(-1).bloor_bike_trips;
  assert.equal(scenario.headline.value, `${p4('intervention')} / ${p4('baseline')}`);
  assert.match(scenario.sectors.access.unit, /exposure distance, not injuries/);
  assert.match(scenario.sectors.access.description, /not injuries/);
  assert.match(scenario.sectors.public.delta, /ZERO DRIVER-TIME GAIN CASE/);
  assert.match(scenario.sectors.public.title, /[Zz]ero driver-time gain case/);
});

test('non-v2 input is refused', () => {
  assert.throws(() => toMappedScenario(v1Run, template('bike')), TypeError);
  assert.throws(() => toMappedScenario(null, template('bike')), TypeError);
  assert.throws(() => toMappedScenario({ ...fareRun, scenario_id: 'custom' }, template('custom')), TypeError);
});
