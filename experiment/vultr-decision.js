/* Server-side adapter for Vultr's TypeSafe-compatible decision endpoint.
 * The world remains the only authority on available actions and event commits. */
'use strict';

const DEFAULT_BASE_URL = 'https://api.vultrinference.com/v1';
const DEFAULT_MODEL = 'clef';
const RETRYABLE = new Set([429, 502, 503, 504]);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decisionState(request) {
  if (!request || !Array.isArray(request.options) || !request.options.length) {
    throw new Error('A decision request needs legal options');
  }
  const { person, trip, environment, options } = request;
  if (!person || !trip || !environment) throw new Error('Decision request is missing world state');
  return {
    scenario: request.scenario,
    tick: request.tick,
    person: {
      role: person.role,
      fare_category: person.fare_category,
      has_car: person.has_car,
      has_bike: person.has_bike,
      weekly_income_cad: person.weekly_income_cad,
      cost_sensitivity: person.cost_sensitivity,
      time_sensitivity: person.time_sensitivity,
      bike_safety_sensitivity: person.bike_safety_sensitivity,
      mode_preference: person.mode_preference,
      defer_bias: person.defer_bias,
    },
    trip: {
      purpose: trip.purpose,
      distance_km: trip.distance_km,
      destination: trip.destination,
      time_window: trip.time_window,
      mode_preference: trip.mode_preference,
      defer_bias: trip.defer_bias,
    },
    cash_cad: request.cash_cad,
    shop_hours: request.shop_hours,
    environment: {
      adult_fare_cad: environment.adult_fare_cad,
      fair_pass_fare_cad: environment.fair_pass_fare_cad,
      bike_lane_protected: environment.bike_lane_protected,
      unprotected_bike_penalty: environment.unprotected_bike_penalty,
    },
    legal_options: options.map(({ action, cost_cad, minutes, destination, route_id }) => ({ action, cost_cad, minutes, destination, route_id })),
  };
}

function decisionBody(request, model = DEFAULT_MODEL) {
  const state = decisionState(request);
  const criteria = Object.fromEntries(request.options.map((option) => [option.action, {
    mode: option.mode, cost_cad: option.cost_cad, minutes: option.minutes,
    destination: option.destination, route_id: option.route_id,
  }]));
  return {
    model,
    state,
    questions: {
      action: {
        type: 'choice',
        instructions: 'For this one synthetic person and this one trip, choose the most plausible next action from the legal options. Respect the persona’s preferences, money, time, mobility access, safety sensitivity, trip purpose, and current world. A policy does not guarantee a switch. Do not infer a citywide outcome.',
        criteria,
      },
    },
  };
}

function readDecision(payload, request, expectedModel) {
  if (payload?.model !== expectedModel) throw new Error(`Decision model mismatch: expected ${expectedModel}, got ${payload?.model || 'none'}`);
  const answer = payload?.answers?.action;
  if (answer?.type !== 'choice' || typeof answer.choice !== 'string') throw new Error('Vultr returned no typed action choice');
  if (!request.options.some((option) => option.action === answer.choice)) throw new Error(`Vultr returned an illegal action: ${answer.choice}`);
  if (answer.probabilities && (
    typeof answer.probabilities !== 'object' ||
    Object.values(answer.probabilities).some((p) => !Number.isFinite(p) || p < 0 || p > 1)
  )) throw new Error('Vultr returned invalid action probabilities');
  return {
    action: answer.choice,
    provider: `vultr:${expectedModel}`,
    reason: 'Typed model choice among this person’s legal actions; an unvalidated simulation assumption.',
    model_confidence: answer.confidence ?? null,
    probabilities: answer.probabilities ?? null,
    usage: payload.usage ?? null,
  };
}

function createVultrDecisionProvider({
  apiKey = process.env.VULTR_INFERENCE_API_KEY,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
  maxRetries = 2,
  onResponse,
} = {}) {
  if (!apiKey) throw new Error('Set VULTR_INFERENCE_API_KEY on the server');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/systemone`;
  return async function decide(request) {
    const body = decisionBody(request, model);
    let response;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) break;
      if (!RETRYABLE.has(response.status) || attempt === maxRetries) throw new Error(`Vultr decision HTTP ${response.status}`);
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      await pause(Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 30000) : 1000 * (2 ** attempt));
    }
    const payload = await response.json();
    const answer = readDecision(payload, request, model);
    if (onResponse) onResponse({ request, answer, usage: payload.usage ?? null });
    return answer;
  };
}

module.exports = { DEFAULT_BASE_URL, DEFAULT_MODEL, decisionState, decisionBody, readDecision, createVultrDecisionProvider };
