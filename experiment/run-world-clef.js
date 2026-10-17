#!/usr/bin/env node
/* Vultr Clef second opinion on the mapped Bathurst–Spadina paired runs.
 *
 *   node ops/vultr.js run -- node experiment/run-world-clef.js fare|bike|both
 *   node experiment/run-world-clef.js both --mock      # offline, deterministic fake Clef, writes to the OS temp dir
 *
 * For each prepared scenario:
 *   1. run the canonical fixture-rule RunResult (experiment/world-runner.js);
 *   2. replay it once more to capture every decision request in arm order
 *      (the decide hook throws, so the runner keeps the fixture choice);
 *   3. ask Clef (/v1/systemone) once per UNIQUE decision state, deduplicated
 *      across arms and scenarios (≤6 in flight, client-side rate limit, 429
 *      Retry-After respected by the provider);
 *   4. run the full paired experiment with Clef as `decide`, answered from the
 *      same cache; a state the fixture trajectory never reached is asked live and
 *      counted separately.
 * Writes experiment/vultr-runs/clef-world-<scenario>.json (compact; no RunResult).
 * The key is read from VULTR_INFERENCE_API_KEY in this process only and is never
 * printed or written. Clef probabilities are not calibrated travel propensities. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { runWorldExperiment } = require('./world-runner');
const fixtures = require('./world-fixtures');
const world = require('../data/world/bloor_spadina_bathurst.json');
const { DEFAULT_BASE_URL, decisionBody, createVultrDecisionProvider } = require('./vultr-decision');

const MODEL = process.env.VULTR_DECISION_MODEL || 'clef';
const ENDPOINT = `${DEFAULT_BASE_URL}/systemone`;
const MAX_CALLS = 600;
const MAX_IN_FLIGHT = 6;
const RPM = Number(process.env.CLEF_RPM) > 0 ? Number(process.env.CLEF_RPM) : 110;   // Vultr default ≈120 req/min/model
const MAX_ERROR_RATE = 0.05;
const SAFETY_SENSITIVE = 1.5;     // bike_safety_sensitivity at or above this counts as safety-sensitive
const P_TOLERANCE = 0.02;         // allowed rise in P(bike on Bloor) before the paired check fails
const HEADLINE = ['completed_trips', 'transit_trips', 'bike_trips', 'bloor_bike_trips', 'car_trips', 'walk_trips', 'deferred_trips',
  'line2_rides', 'bloor_shared_cycling_m', 'local_shop_visits', 'shop_sales_cad', 'errands_elsewhere', 'fare_revenue_cad',
  'household_fare_spend_cad', 'shops_reduced_hours'];
const NOTE = 'Second opinion from Vultr Clef on the same legal options; the public run uses the fixture rule / Steven\'s persona agents. Not a Toronto forecast.';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const r3 = (x) => Math.round(x * 1000) / 1000;
const r4 = (x) => Math.round(x * 10000) / 10000;
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
const secret = process.env.VULTR_INFERENCE_API_KEY || '';
const scrub = (text) => {
  let s = String(text ?? '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  if (secret) s = s.split(secret).join('[redacted]');
  return s;
};
const say = (line) => process.stderr.write(`${scrub(line)}\n`);

function quantile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/* ≤ inFlight concurrent calls, and call starts spaced to stay under rpm. */
function createLimiter({ rpm, inFlight }) {
  const gap = 60000 / rpm;
  let next = 0, active = 0;
  const waiting = [];
  return async function limit(fn) {
    while (active >= inFlight) await new Promise((resolve) => waiting.push(resolve));
    active++;
    try {
      const now = Date.now();
      const wait = Math.max(0, next - now);
      next = Math.max(now, next) + gap;
      if (wait) await pause(wait);
      return await fn();
    } finally {
      active--;
      const wake = waiting.shift();
      if (wake) wake();
    }
  };
}

/* Deterministic offline stand-in for Clef: prefers the persona's stated
 * preference, penalises cost, time and shared-with-cars distance. Only for --mock. */
function mockFetch(_url, init) {
  const body = JSON.parse(init.body);
  const { person, legal_options: options } = body.state;
  const score = (o) => (o.action === 'defer' ? -3 : Number(person.mode_preference?.[o.action] ?? 0)
    - o.cost_cad * 0.4 * Number(person.cost_sensitivity || 1) - o.minutes / 30
    - o.shared_with_cars_m / 1000 * 3 * Number(person.bike_safety_sensitivity || 1));
  const exp = options.map((o) => Math.exp(score(o)));
  const total = exp.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(options.map((o, i) => [o.action, exp[i] / total]));
  const choice = options.reduce((best, o) => (probabilities[o.action] > probabilities[best.action] ? o : best)).action;
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ model: MODEL, answers: { action: { type: 'choice', choice, confidence: probabilities[choice], probabilities } }, usage: { input_tokens: Math.round(init.body.length / 4), output_tokens: 0 } }) });
}

class AbortRun extends Error {}

/* One shared, deduplicated Clef cache for the whole process. */
function createClef({ mock }) {
  const info = new WeakMap();
  const provider = createVultrDecisionProvider({
    apiKey: mock ? 'mock-only' : undefined, model: MODEL, fetchImpl: mock ? mockFetch : globalThis.fetch,
    timeoutMs: 15000, maxRetries: 4, onResponse: ({ request, usage, latency_ms, http_attempts }) => info.set(request, { usage, latency_ms, http_attempts }),
  });
  const limit = createLimiter({ rpm: mock ? 60000 : RPM, inFlight: MAX_IN_FLIGHT });
  const states = new Map();
  const stats = { calls: 0, finished: 0, errors: 0, aborted: null };
  const checkAbort = () => {
    if (stats.aborted) return;
    if (stats.errors && stats.finished >= 20 && stats.errors / stats.finished > MAX_ERROR_RATE) stats.aborted = `error rate ${stats.errors}/${stats.finished} exceeds ${MAX_ERROR_RATE * 100}%`;
  };
  function ask(request, origin) {
    const key = JSON.stringify(decisionBody(request, MODEL));
    let entry = states.get(key);
    if (entry) { entry.used_by.add(origin.scenario); return entry.promise; }
    if (stats.aborted) return Promise.reject(new AbortRun(stats.aborted));
    if (stats.calls >= MAX_CALLS) { stats.aborted = `call cap ${MAX_CALLS} reached`; return Promise.reject(new AbortRun(stats.aborted)); }
    stats.calls++;
    entry = { key, hash: sha(key), first_scenario: origin.scenario, phase: origin.phase, used_by: new Set([origin.scenario]), result: null, error: null };
    states.set(key, entry);
    entry.promise = limit(async () => {
      if (stats.aborted) throw new AbortRun(stats.aborted);
      const started = Date.now();
      const answer = await provider(request);
      const meta = info.get(request) || {};
      entry.result = {
        action: answer.action,
        probabilities: answer.probabilities ? Object.fromEntries(Object.entries(answer.probabilities).map(([k, v]) => [k, r4(v)])) : null,
        confidence: answer.model_confidence == null ? null : r4(answer.model_confidence),
        input_tokens: Number(meta.usage?.input_tokens ?? meta.usage?.prompt_tokens ?? 0) || 0,
        latency_ms: meta.latency_ms ?? Date.now() - started,
        http_attempts: meta.http_attempts ?? 1,
      };
      return entry.result;
    }).then((result) => { stats.finished++; return result; }, (error) => {
      if (!(error instanceof AbortRun)) { stats.finished++; stats.errors++; entry.error = scrub(error?.message || error).slice(0, 160); checkAbort(); }
      throw error;
    });
    entry.promise.catch(() => {});
    return entry.promise;
  }
  return { ask, states, stats };
}

/* ---------- per-scenario pieces ---------- */
function armPairs(spec, canonical, captured) {
  const pairs = [
    ...canonical.runs.baseline.decisions.map((d) => ({ arm: 'baseline', d })),
    ...canonical.runs.intervention.decisions.map((d) => ({ arm: 'intervention', d })),
  ];
  if (captured.length !== pairs.length) throw new Error(`Captured ${captured.length} requests for ${pairs.length} decisions; the runner's decide hook changed`);
  pairs.forEach((p, i) => {
    const q = captured[i];
    if (q.tick !== p.d.tick || q.person.id !== p.d.actor || q.trip.id !== p.d.trip_id) throw new Error(`Request ${i} (${q.tick}:${q.person.id}:${q.trip.id}) does not match decision ${p.d.key}`);
    p.request = q;
  });
  return pairs;
}

function tally(pairs, keyOf) {
  const out = {};
  for (const p of pairs) {
    if (!p.clef) continue;
    const k = keyOf(p);
    out[k] ||= { n: 0, agree: 0, rate: 0 };
    out[k].n++;
    if (p.clef.action === p.d.action) out[k].agree++;
  }
  for (const v of Object.values(out)) v.rate = v.n ? r3(v.agree / v.n) : null;
  return out;
}

function pairedByKey(pairs) {
  const map = new Map();
  for (const p of pairs) {
    const slot = map.get(p.d.key) || {};
    slot[p.arm] = p;
    map.set(p.d.key, slot);
  }
  return [...map.values()].filter((s) => s.baseline && s.intervention && s.baseline.clef && s.intervention.clef);
}

const optionSig = (q) => JSON.stringify(q.options.map(({ action, cost_cad, minutes, shared_with_cars_m, destination }) => ({ action, cost_cad, minutes, shared_with_cars_m, destination })));
const transitAction = (q) => q.options.find((o) => o.mode === 'transit')?.action || null;
const bloorBikeAction = (q) => q.options.find((o) => o.mode === 'bike' && (o.route === 'bloor_cycle_route' || o.action === 'bike_bloor'))?.action || null;
const prob = (p, action) => (action && p.clef.probabilities ? Number(p.clef.probabilities[action] ?? 0) : null);

function farePassCheck(spec, slots) {
  if (!spec.intervention.some((c) => c.lever === 'adult_fare_cad')) return { applicable: false, reason: 'This scenario does not change the adult fare.' };
  const rows = [], adult = [];
  for (const { baseline: b, intervention: i } of slots) {
    if (b.d.tick < spec.policy_start) continue;
    const action = transitAction(b.request);
    if (!action || !transitAction(i.request)) continue;
    const pb = prob(b, action), pi = prob(i, action);
    if (b.request.person.fare_category === 'fair_pass') {
      rows.push({ key: b.d.key, persona: b.d.actor, same_options: optionSig(b.request) === optionSig(i.request),
        baseline: b.clef.action, intervention: i.clef.action, p_transit_baseline: r4(pb), p_transit_intervention: r4(pi), delta: r4(pi - pb) });
    } else adult.push({ delta: pi - pb, switched_away: b.clef.action === action && i.clef.action !== action });
  }
  const comparable = rows.filter((r) => r.same_options);
  const changed = comparable.filter((r) => r.baseline !== r.intervention);
  return {
    applicable: true,
    rule: 'Fair Pass riders whose legal options (cost, minutes) are identical in both arms keep the same Clef choice when only the adult fare rises.',
    pass: comparable.length > 0 && changed.length === 0,
    compared: comparable.length, choice_changes: changed.length,
    max_abs_p_transit_delta: comparable.length ? r4(Math.max(...comparable.map((r) => Math.abs(r.delta)))) : null,
    rows,
    context_adult_riders: { pairs: adult.length, mean_p_transit_delta: adult.length ? r4(adult.reduce((s, a) => s + a.delta, 0) / adult.length) : null, switched_away_from_transit: adult.filter((a) => a.switched_away).length,
      note: 'Context only: adult riders do face the higher fare; a fall in P(transit) is directionally plausible, not a measured elasticity.' },
  };
}

function safetyCheck(spec, slots) {
  if (!spec.intervention.some((c) => c.lever === 'bloor_cycle_track')) return { applicable: false, reason: 'This scenario does not change the Bloor cycle track.' };
  const rows = [], confident = [];
  for (const { baseline: b, intervention: i } of slots) {
    if (b.d.tick < spec.policy_start) continue;
    const action = bloorBikeAction(b.request);
    if (!action || bloorBikeAction(i.request) !== action) continue;
    const pb = prob(b, action), pi = prob(i, action);
    const sensitivity = Number(b.request.person.bike_safety_sensitivity || 0);
    if (sensitivity >= SAFETY_SENSITIVE) {
      rows.push({ key: b.d.key, persona: b.d.actor, bike_safety_sensitivity: sensitivity, baseline: b.clef.action, intervention: i.clef.action,
        p_bloor_baseline: r4(pb), p_bloor_intervention: r4(pi), delta: r4(pi - pb), shared_with_cars_m: i.request.options.find((o) => o.action === action).shared_with_cars_m,
        switched_to_bloor: b.clef.action !== action && i.clef.action === action });
    } else confident.push(pi - pb);
  }
  const violations = rows.filter((r) => r.delta > P_TOLERANCE || r.switched_to_bloor);
  return {
    applicable: true,
    rule: `Riders with bike_safety_sensitivity ≥ ${SAFETY_SENSITIVE} are not more likely (P rise ≤ ${P_TOLERANCE}) to ride Bloor, and never switch onto Bloor, once protection is removed.`,
    pass: rows.length > 0 && violations.length === 0,
    compared: rows.length, violations: violations.length,
    mean_p_bloor_delta: rows.length ? r4(rows.reduce((s, r) => s + r.delta, 0) / rows.length) : null,
    rows,
    context_less_sensitive_riders: { pairs: confident.length, mean_p_bloor_delta: confident.length ? r4(confident.reduce((s, d) => s + d, 0) / confident.length) : null },
  };
}

const headline = (run, tick) => {
  const point = run.metrics.by_tick.find((p) => p.tick === tick) || {};
  return Object.fromEntries(HEADLINE.map((k) => [k, point[k] ?? null]));
};

async function runScenario(name, clef, { seed }) {
  const spec = fixtures[name];
  const started = Date.now();
  const canonical = await runWorldExperiment(spec, { world, seed });
  const captured = [];
  await runWorldExperiment(spec, { world, seed, decide: async (request) => { captured.push(request); throw new Error('capture only'); } });
  const pairs = armPairs(spec, canonical, captured);
  const usedKeys = new Set();
  const callsBefore = clef.stats.calls;

  // Unique fixture-trajectory states, deduplicated across arms (and earlier scenarios).
  const settled = await Promise.allSettled(pairs.map((p) => clef.ask(p.request, { scenario: name, phase: 'fixture_states' })));
  if (clef.stats.aborted) throw new AbortRun(clef.stats.aborted);
  const fixtureCalls = clef.stats.calls - callsBefore;
  pairs.forEach((p, i) => {
    const key = JSON.stringify(decisionBody(p.request, MODEL));
    usedKeys.add(key);
    p.entry = clef.states.get(key);
    p.clef = settled[i].status === 'fulfilled' ? settled[i].value : null;
  });

  // The paired run with Clef deciding, answered from the cache.
  const beforeRun = clef.stats.calls;
  const clefRun = await runWorldExperiment(spec, { world, seed, decide: async (request) => {
    usedKeys.add(JSON.stringify(decisionBody(request, MODEL)));
    const r = await clef.ask(request, { scenario: name, phase: 'clef_run' });
    return { action: r.action, provider: `vultr:${MODEL}`, reason: 'Vultr Clef typed choice among this person’s sandbox-checked legal actions (second opinion; unvalidated).' };
  } });
  if (clef.stats.aborted) throw new AbortRun(clef.stats.aborted);
  const runCalls = clef.stats.calls - beforeRun;

  // Records: one per (decision key, state); tick-1 states are shared by both arms.
  const records = new Map();
  for (const p of pairs) {
    const rk = `${p.d.key}|${p.entry.hash}`;
    let rec = records.get(rk);
    if (!rec) {
      const c = p.clef;
      rec = { key: p.d.key, state: p.entry.hash, arms: [], persona: p.d.actor, role: p.request.person.role, tick: p.d.tick, trip: p.d.trip_id,
        options: p.request.options.map((o) => o.action), fixture: p.d.action, clef: c ? c.action : null, agree: c ? c.action === p.d.action : null,
        p: c ? c.probabilities : null, p_fixture_choice: c && c.probabilities ? r4(Number(c.probabilities[p.d.action] ?? 0)) : null,
        latency_ms: c ? c.latency_ms : null, input_tokens: c ? c.input_tokens : null };
      if (!c) rec.error = p.entry.error || 'no answer';
      records.set(rk, rec);
    }
    rec.arms.push(p.arm);
  }

  const used = [...usedKeys].map((k) => clef.states.get(k));
  const own = used.filter((e) => e.first_scenario === name && e.result);
  const latencies = own.map((e) => e.result.latency_ms);
  const slots = pairedByKey(pairs);
  const warnings = [...clefRun.runs.baseline.warnings, ...clefRun.runs.intervention.warnings];
  const fixtureByKey = { baseline: new Map(canonical.runs.baseline.decisions.map((d) => [d.key, d.action])), intervention: new Map(canonical.runs.intervention.decisions.map((d) => [d.key, d.action])) };
  const differs = (arm) => clefRun.runs[arm].decisions.filter((d) => fixtureByKey[arm].get(d.key) !== d.action).length;
  const answered = pairs.filter((p) => p.clef);
  const errorsHere = used.filter((e) => e.first_scenario === name && e.error).length;

  return {
    schema: 'clef-second-opinion.v1',
    model: MODEL,
    endpoint: ENDPOINT,
    run_at: new Date().toISOString(),
    scenario: name, spec_id: spec.id, question: spec.question, world_id: spec.world_id, seed,
    calls: fixtureCalls + runCalls,
    call_breakdown: { fixture_trajectory_states: fixtureCalls, clef_run_new_states: runCalls,
      states_used: used.length, reused_from_earlier_scenario: used.filter((e) => e.first_scenario !== name).length,
      note: 'One call per unique decision state; identical states across arms and scenarios share a call. Latency and tokens below cover only calls made for this scenario.' },
    errors: errorsHere,
    median_latency_ms: quantile(latencies, 0.5),
    p95_latency_ms: quantile(latencies, 0.95),
    input_tokens: own.reduce((s, e) => s + e.result.input_tokens, 0),
    http_retries: own.reduce((s, e) => s + (e.result.http_attempts - 1), 0),
    wall_ms: Date.now() - started,
    agreement: {
      unit: 'arm-decisions on the fixture-rule trajectory (tick-1 states count once per arm)',
      overall: tally(pairs, () => 'all').all || { n: 0, agree: 0, rate: null },
      by_arm: tally(pairs, (p) => p.arm),
      by_role: tally(pairs, (p) => p.request.person.role),
      unanswered: pairs.length - answered.length,
    },
    paired_checks: {
      fair_pass_unchanged_by_fare: farePassCheck(spec, slots),
      safety_sensitive_not_more_bike_bloor_after_removal: safetyCheck(spec, slots),
      note: 'Engineering face-validity checks on Clef’s choices for the same people in both arms; not empirical transport validation.',
    },
    decisions: [...records.values()],
    clef_run_summary: {
      description: 'Full paired runWorldExperiment with Clef as decide; the mapped sandbox validated and committed every move.',
      run_ids: { baseline: clefRun.runs.baseline.run_id, intervention: clefRun.runs.intervention.run_id },
      decisions: clefRun.runs.baseline.decisions.length + clefRun.runs.intervention.decisions.length,
      fallbacks: warnings.filter((w) => w.code === 'agent_error' || w.code === 'invalid_agent_action').length,
      rejected_actions: clefRun.runs.baseline.game_master.rejected_actions + clefRun.runs.intervention.game_master.rejected_actions,
      differs_from_fixture_run: { baseline: differs('baseline'), intervention: differs('intervention') },
      changed_decisions: clefRun.changed_decisions.map((c) => ({ actor: c.actor, tick: c.tick, trip: c.trip_id, from: c.baseline.action, to: c.intervention.action,
        ...(c.baseline.destination !== c.intervention.destination ? { destination_from: c.baseline.destination, destination_to: c.intervention.destination } : {}) })),
      fixture_changed_decisions: canonical.changed_decisions.length,
      headline_tick: spec.ticks,
      headline_p4: { baseline: headline(clefRun.runs.baseline, spec.ticks), intervention: headline(clefRun.runs.intervention, spec.ticks) },
      fixture_headline_p4: { baseline: headline(canonical.runs.baseline, spec.ticks), intervention: headline(canonical.runs.intervention, spec.ticks) },
    },
    replay: Object.fromEntries(used.filter((e) => e.result).map((e) => [e.hash, e.result.action])),
    replay_note: 'state hash = first 12 hex of sha256(JSON of the /v1/systemone body built by experiment/vultr-decision.js decisionBody); value = Clef choice. Enough to rebuild the Clef paired run offline.',
    note: NOTE,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const name = argv.find((a) => !a.startsWith('--')) || 'both';
  const mock = argv.includes('--mock');
  const outIdx = argv.indexOf('--out');
  const seedIdx = argv.indexOf('--seed');
  const seed = seedIdx >= 0 ? Number(argv[seedIdx + 1]) : 42;
  if (!['fare', 'bike', 'both'].includes(name) || !Number.isInteger(seed)) {
    say('Usage: node ops/vultr.js run -- node experiment/run-world-clef.js fare|bike|both [--seed 42] [--mock] [--out dir]');
    process.exitCode = 2;
    return;
  }
  if (!mock && !secret) {
    say('Set VULTR_INFERENCE_API_KEY server-side, e.g. node ops/vultr.js run -- node experiment/run-world-clef.js both (or use --mock).');
    process.exitCode = 2;
    return;
  }
  const outDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : mock ? os.tmpdir() : path.join(__dirname, 'vultr-runs');
  const clef = createClef({ mock });
  const scenarios = name === 'both' ? ['fare', 'bike'] : [name];
  const started = Date.now();
  const results = [];
  say(`Clef second opinion: model=${MODEL}${mock ? ' (MOCK)' : ''} scenarios=${scenarios.join(',')} seed=${seed} rpm≤${mock ? '∞' : RPM} in_flight≤${MAX_IN_FLIGHT} cap=${MAX_CALLS}`);
  try {
    for (const s of scenarios) {
      const out = await runScenario(s, clef, { seed });
      if (mock) Object.assign(out, { mock: true, note: `MOCK provider, not Vultr. ${NOTE}` });
      results.push(out);
      const fp = out.paired_checks.fair_pass_unchanged_by_fare, sc = out.paired_checks.safety_sensitive_not_more_bike_bloor_after_removal;
      say(`[${s}] calls=${out.calls} (fixture states ${out.call_breakdown.fixture_trajectory_states}, clef-run new ${out.call_breakdown.clef_run_new_states}, reused ${out.call_breakdown.reused_from_earlier_scenario}) errors=${out.errors} median=${out.median_latency_ms}ms p95=${out.p95_latency_ms}ms tokens=${out.input_tokens} agreement=${out.agreement.overall.agree}/${out.agreement.overall.n} (${(out.agreement.overall.rate * 100).toFixed(1)}%) fair_pass=${fp.applicable ? (fp.pass ? 'PASS' : 'FAIL') : 'n/a'} safety=${sc.applicable ? (sc.pass ? 'PASS' : 'FAIL') : 'n/a'} clef_run_changed=${out.clef_run_summary.changed_decisions.length} fallbacks=${out.clef_run_summary.fallbacks} rejected=${out.clef_run_summary.rejected_actions}`);
    }
  } catch (error) {
    if (error instanceof AbortRun) {
      say(`ABORTED: ${error.message}. calls=${clef.stats.calls} errors=${clef.stats.errors}. No result written.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  const { calls, errors } = clef.stats;
  if (calls && errors / calls > MAX_ERROR_RATE) {
    say(`ABORTED: ${errors}/${calls} calls failed (> ${MAX_ERROR_RATE * 100}%). No result written.`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const out of results) {
    out.batch = { scenarios, calls_total: calls, errors_total: errors, wall_ms: Date.now() - started, rate_limit_rpm: mock ? null : RPM, max_in_flight: MAX_IN_FLIGHT };
    const file = path.join(outDir, `clef-world-${out.scenario}${mock ? '.mock' : ''}.json`);
    const text = `${scrub(JSON.stringify(out, null, 1))}\n`;
    fs.writeFileSync(file, text);
    say(`wrote ${path.relative(process.cwd(), file) || file} (${Math.round(text.length / 1024)} KB)`);
  }
  say(`total: calls=${calls} errors=${errors} wall=${Math.round((Date.now() - started) / 1000)}s`);
}

if (require.main === module) {
  main().catch((error) => { say(error && error.stack ? error.stack : String(error)); process.exitCode = 1; });
}

module.exports = { createLimiter, farePassCheck, safetyCheck, quantile };
