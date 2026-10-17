const test = require('node:test');
const assert = require('node:assert/strict');
const { decisionBody, readDecision, createVultrDecisionProvider } = require('./vultr-decision');

const request = {
  scenario: 'bike', tick: 2, person: { id: 'leila', role: 'less_confident_cyclist', has_car: false, has_bike: true, bike_safety_sensitivity: 1.8, mode_preference: { bike_bloor: 3.5 } },
  trip: { id: 'work', purpose: 'commute', distance_km: 5, destination: 'workplace' },
  environment: { adult_fare_cad: 3.3, fair_pass_fare_cad: 2.1, bike_lane_protected: false, unprotected_bike_penalty: 2.1 },
  cash_cad: 42, shop_hours: 9,
  options: [
    { action: 'bike_bloor', mode: 'bicycle', cost_cad: 0, minutes: 17, destination: 'workplace', route_id: 'bloor_main' },
    { action: 'bike_detour', mode: 'bicycle', cost_cad: 0, minutes: 27, destination: 'workplace', route_id: 'side_street' },
    { action: 'defer', mode: 'none', cost_cad: 0, minutes: 0, destination: null, route_id: null },
  ],
};

test('decision request contains only bounded legal actions and current state', () => {
  const body = decisionBody(request);
  assert.equal(body.model, 'clef');
  assert.deepEqual(Object.keys(body.questions.action.criteria), request.options.map((o) => o.action));
  assert.equal(body.state.environment.bike_lane_protected, false);
  assert.equal(body.state.person.bike_safety_sensitivity, 1.8);
  assert.equal(body.state.cash_cad, 42);
});

test('provider maps a typed Vultr choice into the runner action contract', async () => {
  const decide = createVultrDecisionProvider({
    apiKey: 'test-only',
    fetchImpl: async (_url, init) => {
      assert.equal(JSON.parse(init.body).questions.action.type, 'choice');
      return { ok: true, json: async () => ({ model: 'clef', answers: { action: { type: 'choice', choice: 'bike_detour', confidence: 0.8, probabilities: { bike_bloor: 0.1, bike_detour: 0.8, defer: 0.1 } } }, usage: { input_tokens: 172, output_tokens: 0 } }) };
    },
  });
  const answer = await decide(request);
  assert.equal(answer.action, 'bike_detour');
  assert.equal(answer.provider, 'vultr:clef');
  assert.equal(answer.usage.input_tokens, 172);
});

test('provider rejects illegal or mismatched model results', () => {
  assert.throws(() => readDecision({ model: 'jev-latest', answers: { action: { type: 'choice', choice: 'bike_bloor' } } }, request, 'clef'), /model mismatch/);
  assert.throws(() => readDecision({ model: 'clef', answers: { action: { type: 'choice', choice: 'drive' } } }, request, 'clef'), /illegal action/);
});

test('provider retries a rate limit and preserves the same bounded request', async () => {
  let calls = 0;
  const decide = createVultrDecisionProvider({
    apiKey: 'test-only',
    fetchImpl: async (_url, init) => {
      calls++;
      assert.equal(JSON.parse(init.body).model, 'clef');
      if (calls === 1) return { ok: false, status: 429, headers: { get: () => '0' } };
      return { ok: true, json: async () => ({ model: 'clef', answers: { action: { type: 'choice', choice: 'defer', confidence: 1, probabilities: { bike_bloor: 0, bike_detour: 0, defer: 1 } } } }) };
    },
  });
  assert.equal((await decide(request)).action, 'defer');
  assert.equal(calls, 2);
});

/* experiment.v2: mapped Bathurst–Spadina requests from experiment/world-runner.js */
const { decisionState, isWorldRequest } = require('./vultr-decision');

const worldRequest = {
  scenario: 'bloor-section-track-removal', tick: 3, seed: 42,
  person: { id: 'leila', name: 'Leila', role: 'less_confident_cyclist', fare_category: 'adult', has_bike: true, has_car: false,
    cost_sensitivity: 1, time_sensitivity: 1, bike_safety_sensitivity: 1.8,
    mode_preference: { bike_bloor: 4.6, bike_side_street: 3.1, transit: 2.9 }, home: 'Howland Ave' },
  trip: { id: 'commute', purpose: 'commute', depart: '08:01', planned_shop: null },
  options: [
    { action: 'bike_bloor', mode: 'bike', minutes: 13.4, mapped_minutes: 3.4, offmap_minutes: 10, cost_cad: 0, shared_with_cars_m: 412.5, destination: 'Downtown / U of T (off-map)', route: 'bloor_cycle_route' },
    { action: 'bike_side_street', mode: 'bike', minutes: 17.1, mapped_minutes: 2.1, offmap_minutes: 15, cost_cad: 0, shared_with_cars_m: 0, destination: 'Downtown / U of T (off-map)', route: 'side_street_detour' },
    { action: 'transit', mode: 'transit', minutes: 21.5, mapped_minutes: 5.5, offmap_minutes: 16, cost_cad: 3.3, shared_with_cars_m: 0, destination: 'Downtown / U of T (off-map)', route: 'transit' },
    { action: 'defer', mode: 'none', route: null, destination: null, mapped_minutes: 0, offmap_minutes: 0, minutes: 0, cost_cad: 0, shared_with_cars_m: 0 },
  ],
  cash_cad: 70,
  world: { adult_fare_cad: 3.3, fair_pass_fare_cad: 2.1, bloor_cycle_track: 'none', line2_headway_multiplier: 1 },
};

test('v1 requests keep the experiment.v1 state shape', () => {
  assert.equal(isWorldRequest(request), false);
  const state = decisionState(request);
  assert.ok(state.environment);
  assert.equal(state.world, undefined);
  assert.equal(decisionBody(request).questions.action.criteria.bike_detour.route_id, 'side_street');
});

test('v2 world requests carry mapped options, world levers, planned shop and home', () => {
  assert.equal(isWorldRequest(worldRequest), true);
  const body = decisionBody(worldRequest);
  assert.equal(body.model, 'clef');
  assert.deepEqual(Object.keys(body.questions.action.criteria), worldRequest.options.map((o) => o.action));
  assert.equal(body.state.world.bloor_cycle_track, 'none');
  assert.equal(body.state.world.adult_fare_cad, 3.3);
  assert.equal(body.state.person.home, 'Howland Ave');
  assert.equal(body.state.trip.planned_shop, null);
  assert.equal(body.state.environment, undefined);
  const bloor = body.state.legal_options.find((o) => o.action === 'bike_bloor');
  assert.deepEqual(bloor, { action: 'bike_bloor', mode: 'bike', minutes: 13.4, mapped_minutes: 3.4, offmap_minutes: 10, cost_cad: 0, shared_with_cars_m: 412.5, destination: 'Downtown / U of T (off-map)', route: 'bloor_cycle_route' });
  assert.equal(body.questions.action.criteria.bike_bloor.shared_with_cars_m, 412.5);
  assert.equal(body.questions.action.criteria.bike_bloor.action, undefined);
  assert.match(body.questions.action.instructions, /shared_with_cars_m/);
});

test('v2 state withholds the scenario label, seed and persona identity', () => {
  const state = decisionState(worldRequest);
  const text = JSON.stringify(state);
  for (const leak of ['track-removal', 'Leila', '"leila"', '"seed"', '"scenario"']) assert.ok(!text.includes(leak), `state leaks ${leak}`);
  const sameStateOtherScenario = { ...worldRequest, scenario: 'bloor-section-fare-050', seed: 7, person: { ...worldRequest.person, id: 'x', name: 'X' } };
  assert.deepEqual(decisionBody(sameStateOtherScenario), decisionBody(worldRequest));
});

test('v2 errand state keeps the planned shop and rejects a missing world', () => {
  const errand = { ...worldRequest, trip: { id: 'errand', purpose: 'errand', depart: '18:22', planned_shop: 'osm_n252334755' },
    options: [{ action: 'walk', mode: 'walk', minutes: 4.2, mapped_minutes: 4.2, offmap_minutes: 0, cost_cad: 0, shared_with_cars_m: 0, destination: 'osm_n252334755', route: 'walk' }, worldRequest.options[3]] };
  assert.equal(decisionState(errand).trip.planned_shop, 'osm_n252334755');
  const { world, ...missing } = errand;
  assert.throws(() => decisionState(missing), /missing world state/);
});

test('provider decides a v2 request and reports latency without changing the answer contract', async () => {
  let seen = null;
  const decide = createVultrDecisionProvider({
    apiKey: 'test-only',
    onResponse: (info) => { seen = info; },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.state.world.bloor_cycle_track, 'none');
      return { ok: true, json: async () => ({ model: 'clef', answers: { action: { type: 'choice', choice: 'bike_side_street', confidence: 0.7, probabilities: { bike_bloor: 0.1, bike_side_street: 0.7, transit: 0.15, defer: 0.05 } } }, usage: { input_tokens: 410 } }) };
    },
  });
  const answer = await decide(worldRequest);
  assert.equal(answer.action, 'bike_side_street');
  assert.equal(answer.provider, 'vultr:clef');
  assert.ok(Number.isFinite(seen.latency_ms));
  assert.equal(seen.http_attempts, 1);
});

test('provider retries a network failure', async () => {
  let calls = 0;
  const decide = createVultrDecisionProvider({
    apiKey: 'test-only', maxRetries: 2,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return { ok: true, json: async () => ({ model: 'clef', answers: { action: { type: 'choice', choice: 'defer' } } }) };
    },
  });
  assert.equal((await decide(worldRequest)).action, 'defer');
  assert.equal(calls, 2);
});
