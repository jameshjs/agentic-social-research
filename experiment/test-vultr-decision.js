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
