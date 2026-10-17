const assert = require('node:assert/strict');
const test = require('node:test');
const { toMappedScenario, changedSummary, SECTORS } = require('./world-run-adapter');
const { runWorldExperiment } = require('../experiment/world-runner');
const fixtures = require('../experiment/world-fixtures');
const world = require('../data/world/bloor_spadina_bathurst.json');
const fareRun = require('../experiment/sample-world-fare.json');
const bikeRun = require('../experiment/sample-world-bike.json');
const v1Run = require('../experiment/sample-bike.json');

const KEYS = ['mobility', 'access', 'commerce', 'households', 'public'];
const template = (id, extra = {}) => ({ id, mapTag: 'TAG', sectors: Object.fromEntries(KEYS.map((key) => [key, { icon: 'x', number: key }])), ...extra });
const byTick = (result, arm, ids) => result.runs[arm].metrics.by_tick.map((p) => (ids.length === 1 ? p[ids[0]] : ids.reduce((s, id) => s + p[id], 0)));
const EXPECTED = {
  fare: { mobility: ['transit_trips'], access: ['deferred_trips', 'errands_elsewhere'], commerce: ['shop_sales_cad'], households: ['household_fare_spend_cad'], public: ['fare_revenue_cad'] },
  bike: { mobility: ['bloor_bike_trips'], access: ['bloor_shared_cycling_m'], commerce: ['shop_sales_cad'], households: ['household_transport_spend_cad'], public: ['driver_mapped_minutes'] },
  compiled: { mobility: ['transit_trips'], access: ['deferred_trips', 'errands_elsewhere'], commerce: ['shop_sales_cad'], households: ['household_transport_spend_cad'], public: ['fare_revenue_cad'] },
};
const FIELDS = ['run', 'title', 'summary', 'breadcrumb', 'viewport', 'mapTag', 'worldCaption', 'chain', 'focus', 'headline', 'mini', 'narrative', 'sourceRibbon', 'evidence', 'sectors'];

let compiledRun;
const compiled = async () => (compiledRun ||= await runWorldExperiment({
  ...fixtures.fare, id: 'bloor-section-line2-headway-x2', scenario_id: 'compiled', evidence_tier: 'speculative',
  question: 'What if Line 2 ran half as often through Bathurst–Spadina?',
  intervention: [{ operator: 'set_lever', lever: 'line2_headway_multiplier', value: 2 }],
}, { world }));

// Every string the dashboard shows, for copy checks.
const copyOf = (s) => [s.title, s.summary, s.worldCaption, s.narrative, s.sourceRibbon, ...s.chain, ...s.focus, s.headline.label, s.headline.direction,
  ...s.mini.map((m) => m.label), s.evidence.title, s.evidence.text, ...KEYS.flatMap((k) => ['title', 'description', 'delta', 'chartTitle', 'unit', 'evidence'].map((f) => s.sectors[k][f]))];

function checkShape(result, scenario, kind) {
  for (const field of FIELDS) assert.ok(scenario[field] !== undefined, `${kind}.${field}`);
  assert.equal(scenario.run, result);
  assert.equal(scenario.breadcrumb, 'BLOOR WEST · BATHURST–SPADINA');
  assert.equal(scenario.viewport, 'BATHURST–SPADINA SECTION');
  assert.equal(scenario.chain.length, 4);
  assert.ok(scenario.chain.every((s) => typeof s === 'string' && s.length));
  assert.equal(scenario.focus.length, 2);
  assert.ok(scenario.focus.every((s) => typeof s === 'string' && /^0[12] \/ /.test(s)));
  assert.ok(scenario.headline.label && scenario.headline.value && scenario.headline.direction);
  assert.equal(scenario.mini.length, 3);
  for (const m of scenario.mini) { assert.ok(m.label && m.value); assert.ok(['positive', 'negative', 'neutral'].includes(m.tone)); }
  assert.ok(scenario.evidence.title && scenario.evidence.text && scenario.evidence.links.length);
  for (const link of scenario.evidence.links) { assert.equal(link.length, 2); assert.ok(link[0] && link[1]); }
  assert.match(scenario.sourceRibbon, new RegExp(`Seed ${result.seed} · v${result.version} · ${result.changed_decisions.length} changed decisions · synthetic responses`));
  for (const text of [scenario.summary, scenario.narrative]) {
    assert.match(text, /not a Toronto forecast/);
    assert.match(text, /[Ss]ynthetic/);
    assert.match(text, /Bathurst–Spadina/);
  }
  assert.match(scenario.worldCaption, /Bathurst–Spadina/);
  // Closures, injuries and emissions may only appear as things the run does not estimate.
  for (const text of copyOf(scenario)) if (/closure|injur|emission/i.test(text)) assert.match(text, /\b(not|no)\b/i, text);
  for (const key of KEYS) {
    const sector = scenario.sectors[key];
    assert.equal(sector.icon, 'x', 'template sector fields are kept');
    assert.equal(sector.number, key);
    assert.deepEqual(sector.metric_ids, EXPECTED[kind][key]);
    assert.deepEqual(sector.baseline, byTick(result, 'baseline', EXPECTED[kind][key]), `${kind}/${key} baseline`);
    assert.deepEqual(sector.policy, byTick(result, 'intervention', EXPECTED[kind][key]), `${kind}/${key} policy`);
    for (const field of ['title', 'description', 'delta', 'chartTitle', 'unit', 'evidence']) assert.ok(sector[field], `${kind}/${key}.${field}`);
    assert.match(sector.evidence, /synthetic|assumption/i);
    assert.equal(sector.baseline.length, result.scenario.ticks);
  }
}

test('both prepared runs map onto the dashboard from by_tick series only', () => {
  assert.deepEqual(SECTORS, KEYS);
  for (const result of [fareRun, bikeRun]) {
    const kind = result.scenario_id;
    const scenario = toMappedScenario(result, template(kind));
    checkShape(result, scenario, kind);
    assert.equal(scenario.id, kind);
    assert.equal(scenario.mapTag, 'TAG', 'a template map tag is kept');
    assert.equal(scenario.title, result.scenario.question);
    // Focus markers follow the first people whose decision changed.
    const first = changedSummary(result)[0];
    assert.match(scenario.focus[0], new RegExp(first.name.toUpperCase()));
  }
  assert.match(toMappedScenario(fareRun, {}).mapTag, /TTC FARE/);
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
  assert.match(scenario.summary, /\$3\.30 to \$3\.80/);
  assert.match(scenario.chain[0], /\$3\.30 → \$3\.80/);
});

test('bike copy keeps exposure, injuries and driver time honest', () => {
  const scenario = toMappedScenario(bikeRun, template('bike'));
  const p4 = (arm) => bikeRun.runs[arm].metrics.by_tick.at(-1).bloor_bike_trips;
  assert.equal(scenario.headline.value, `${p4('intervention')} / ${p4('baseline')}`);
  assert.match(scenario.sectors.access.unit, /exposure distance, not injuries/);
  assert.match(scenario.sectors.access.description, /not injuries/);
  assert.match(scenario.sectors.public.delta, /NO DRIVER-TIME GAIN/);
  assert.match(scenario.sectors.public.title, /No driver-time gain/);
  // James's calibrated queues: cyclists in the car lane add 0.5 PCE, so drivers are never faster after removal.
  assert.match(scenario.sectors.public.description, /0\.5 car equivalents|identical in both arms/);
  scenario.sectors.public.policy.forEach((v, i) => assert.ok(v >= scenario.sectors.public.baseline[i], `P${i + 1}`));
  assert.match(scenario.evidence.text, /Not estimable from this run: .*injuries/);
});

test('a compiled set_lever spec maps onto the generic dashboard', async () => {
  const result = await compiled();
  const scenario = toMappedScenario(result, template('custom', { mapTag: undefined }));
  checkShape(result, scenario, 'compiled');
  assert.equal(scenario.mapTag, 'COMPILED LEVER / BATHURST–SPADINA');
  assert.equal(scenario.title, result.scenario.question);
  for (const text of [scenario.summary, scenario.chain[0], scenario.evidence.text]) assert.match(text, /line2_headway_multiplier = 2/);
  assert.match(scenario.sourceRibbon, /speculative/);
  const policyDecisions = result.runs.intervention.decisions.filter((d) => d.tick >= result.scenario.policy_start).length;
  assert.equal(scenario.headline.value, `${changedSummary(result).length} / ${policyDecisions}`);
});

test('non-v2 input is refused', () => {
  assert.throws(() => toMappedScenario(v1Run, template('bike')), TypeError);
  assert.throws(() => toMappedScenario(null, template('bike')), TypeError);
  assert.throws(() => toMappedScenario({ ...fareRun, schema_version: 'experiment.v1' }, template('fare')), TypeError);
  assert.throws(() => toMappedScenario({ ...fareRun, runs: { baseline: fareRun.runs.baseline } }, template('fare')), TypeError);
  assert.throws(() => changedSummary(v1Run), TypeError);
});

test('changedSummary lists policy-tick decision changes in tick then actor order', async () => {
  for (const result of [fareRun, bikeRun, await compiled()]) {
    const rows = changedSummary(result);
    const expected = result.changed_decisions.filter((c) => c.tick >= result.scenario.policy_start);
    assert.equal(rows.length, expected.length);
    assert.deepEqual(rows.map((r) => r.key).sort(), expected.map((c) => c.key).sort());
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      assert.ok(a.tick < b.tick || (a.tick === b.tick && a.actor <= b.actor), `${a.key} before ${b.key}`);
    }
    for (const row of rows) {
      assert.deepEqual(Object.keys(row), ['key', 'actor', 'name', 'role', 'tick', 'trip_id', 'from', 'to', 'baseline_event_id', 'intervention_event_id']);
      const change = expected.find((c) => c.key === row.key);
      const person = result.personas.find((p) => p.id === row.actor);
      assert.equal(row.name, person.name);
      assert.equal(row.role, person.role);
      assert.equal(row.tick, change.tick);
      assert.equal(row.trip_id, change.trip_id);
      assert.equal(row.baseline_event_id, change.baseline_event_id);
      assert.equal(row.intervention_event_id, change.intervention_event_id);
      if (change.baseline.action !== change.intervention.action) assert.deepEqual([row.from, row.to], [change.baseline.action, change.intervention.action]);
      assert.notEqual(row.from, row.to);
      // The ledger rows point at the recorded choose_trip events in each arm.
      assert.equal(result.runs.baseline.events.find((e) => e.id === row.baseline_event_id).action, 'choose_trip');
      assert.equal(result.runs.intervention.events.find((e) => e.id === row.intervention_event_id).chosen, change.intervention.action);
    }
  }
  assert.ok(changedSummary(fareRun).length > 0 && changedSummary(bikeRun).length > 0);
});
