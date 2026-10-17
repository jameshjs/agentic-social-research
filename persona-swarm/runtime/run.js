#!/usr/bin/env node
/* World runs: the paired experiment (experiment/runner.js, unchanged) with the 40 deciders from data/city/agents.json,
 * written as an experiment.v1 RunResult with decision_replay. Usage:
 *   node persona-swarm/runtime/run.js fare|bike|both [--backend local|token|api|none] [--seed 42] [--concurrency 16]
 *        [--ticks N] [--replay]
 * `both` runs the two policies as parallel processes. Output: data/city/run-<scenario>.json (smoke-<scenario>.json with
 * --ticks). --replay re-runs a saved file from its decision_replay with no model calls and checks it is identical. */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runExperiment } = require('../../experiment/runner');
const fixtures = require('../../experiment/fixtures');
const cd = require('./claude-decision');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO, 'persona-swarm', 'data', 'city');
const rel = (p) => path.relative(REPO, p);
const decisionsByArm = (result) => new Map(['baseline', 'intervention'].flatMap((arm, a) =>
  result.runs[arm].decisions.map((d) => [`${a}|${d.tick}|${d.actor}|${d.trip_id}`, d.action])));

/* The runner awaits decide() one request at a time. To decide concurrently without changing it, re-run the
 * deterministic runner in passes: each pass answers from the cache, keyed by the request and this person's last
 * choice, and fetches all at once the requests whose history is settled (nothing unanswered earlier in that person's
 * week or in an earlier week). The last pass is an ordinary run in which every request is a cache hit, so the result
 * equals a sequential run. A fallback's real choice (the fixture rule's) is read from the previous pass. After each
 * pass, onSettled(result, week) reports the weeks whose results are final. run and createMemory swap in another runner
 * (runtime/mapped.js: the mapped world runner and its memory). */
async function runCity(spec, { personas, seed = 42, ask, cache = new Map(), onPass = () => {}, onSettled = () => {}, run = runExperiment, createMemory = cd.createRunMemory }) {
  const personIds = personas.map((p) => p.id);
  let previous = null;
  for (let pass = 1; ; pass++) {
    const pending = new Map();
    const personMiss = new Set();
    let missTick = Infinity;
    const prior = previous;
    const memory = createMemory({ personIds, resolve: prior && ((a, week, person, trip) => prior.get(`${a}|${week}|${person}|${trip}`)) });
    const result = await run(spec, { seed, personas, decide: async (request) => {
      const lastChoice = memory.lastChoice(request);
      const key = `${JSON.stringify(request)}\n${lastChoice}`;
      let answer = null;                                      // a placeholder on a miss; this pass's result is discarded
      if (cache.has(key)) answer = cache.get(key);
      else {
        const mine = `${memory.arm}:${request.tick}:${request.person.id}`;
        if (missTick >= request.tick && !personMiss.has(mine)) pending.set(key, { request, lastChoice });
        missTick = Math.min(missTick, request.tick);
        personMiss.add(mine);
      }
      memory.record(request, answer);
      return answer;
    } });
    await onSettled(result, Math.min(spec.ticks, missTick - 1));
    if (!pending.size) return { result, passes: pass };
    onPass(pass, pending.size);
    previous = decisionsByArm(result);
    await Promise.all([...pending].map(async ([key, { request, lastChoice }]) => { cache.set(key, await ask(request, lastChoice)); }));
  }
}

// Events, decisions and metrics; not warnings, since a replayed failure (a cached null) falls back without one.
const replayView = (r) => ['baseline', 'intervention'].map((arm) => [r.runs[arm].events, r.runs[arm].decisions, r.runs[arm].metrics]).concat([r.changed_decisions]);
const sameDecisions = (a, b) => JSON.stringify(replayView(a)) === JSON.stringify(replayView(b));

/* The fixture spec, relabelled for the agent bundles and agent choices (neither enters the decision cache key). */
function specFor(scenario, ticks) {
  const fixture = fixtures[scenario];
  const spec = { ...fixture,
    population_source: "agents-v1: Twin-2K-500 respondents' given answers (US survey; party and ideology removed) in synthetic Toronto roles; 40 world deciders",
    assumptions: [...(fixture.assumptions || []),
      { id: 'external_agent_choice', kind: 'synthetic', note: `A persona agent (${cd.PROVIDER}, low effort) chose one legal option. Tuned on US survey answers; not validated on mobility choices.` },
      { id: 'twin_anchored_personas', kind: 'synthetic', note: "Each persona is a US survey respondent's attitudes placed in a synthetic Toronto role; roles and money come from census marginals and the world's counts." }] };
  return ticks && ticks !== fixture.ticks ? { ...spec, ticks, policy_start: Math.min(fixture.policy_start, ticks) } : spec;
}

/* One live world run: the 40 deciders, one provider on the given backend call, per-week results as they settle. */
async function runWorld(scenario, { call, backend, token, ticks, seed = 42, concurrency = 16, onCall = () => {}, onWeek = () => {}, onPass = () => {} } = {}) {
  const spec = specFor(scenario, ticks);
  const { deciders, sheets } = cd.loadAgents();
  const calls = [];
  const provider = cd.createClaudeDecisionProvider({ sheets, baseline: spec.environment, places: cd.placesFrom(spec.world?.locations), backend, token, call,
    concurrency, warn: () => {}, onCall: (c) => {
      const row = { person: c.request?.person.id, tick: c.request?.tick, trip: c.request?.trip.id, last_choice: c.lastChoice, ok: c.ok,
        action: c.answer?.action, reason: c.answer?.reason, arm: !c.request ? undefined : c.request.tick < spec.policy_start ? 'both'
          : JSON.stringify(c.request.environment) === JSON.stringify(spec.environment) ? 'baseline' : 'policy',
        skipped: c.skipped || undefined, limited: c.limited || undefined, attempts: c.attempts, latency_ms: c.latency_ms, cost_usd: c.cost_usd ?? undefined, error: c.error };
      calls.push(row);
      onCall(row);
    } });
  const started = Date.now();
  let sent = 0;
  const { result, passes } = await runCity(spec, { personas: deciders, seed, ask: provider.ask, onPass, onSettled: async (r, upTo) => {
    for (; sent < upTo; sent++) await onWeek(sent + 1, { baseline: r.runs.baseline.metrics.by_tick[sent], intervention: r.runs.intervention.metrics.by_tick[sent] });
  } });
  const live = calls.filter((c) => !c.skipped);
  return { result, spec, passes, provider, calls, meta: {
    scenario, study_id: result.study_id, ticks: spec.ticks, deciders: deciders.length, backend, model: cd.AGENT.model, effort: cd.AGENT.effort,
    provider: cd.PROVIDER, instructions_sha256: cd.sha256(cd.INSTRUCTIONS), addendum_sha256: cd.sha256(cd.ADDENDUM),
    wall_s: Math.round((Date.now() - started) / 100) / 10, passes, calls: live.length, failed_calls: live.filter((c) => !c.ok).length,
    limited: calls.some((c) => c.limited), cost_usd: Math.round(live.reduce((s, c) => s + (c.cost_usd || 0), 0) * 10000) / 10000,
    decisions: result.runs.baseline.decisions.length + result.runs.intervention.decisions.length,
    fallback_warnings: result.runs.baseline.warnings.length + result.runs.intervention.warnings.length, changed_decisions: result.changed_decisions.length,
  } };
}

async function runScenario(scenario, opts) {
  const spec = specFor(scenario, opts.ticks);
  const out = path.join(OUT_DIR, `${spec.ticks === fixtures[scenario].ticks ? 'run' : 'smoke'}-${scenario}.json`);
  if (opts.replay) {
    const prior = JSON.parse(fs.readFileSync(out, 'utf8'));
    const again = await runExperiment(spec, { seed: prior.seed, personas: prior.personas, replay_decisions: prior.decision_replay });
    const ok = sameDecisions(prior, again);
    process.stdout.write(`${rel(out)}: replay from decision_replay ${ok ? 'is identical' : 'DIFFERS'} (${prior.decision_replay.length} decisions, no model calls)\n`);
    return ok;
  }
  const { result, meta, calls } = await runWorld(scenario, { backend: opts.backend, token: cd.readDotEnv().CLAUDE_CODE_OAUTH_TOKEN, ticks: opts.ticks,
    seed: opts.seed, concurrency: opts.concurrency, onPass: (pass, n) => process.stderr.write(`${scenario}: pass ${pass}, ${n} decisions\n`) });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(out.replace(/\.json$/, '.meta.json'), `${JSON.stringify({ schema: 'persona-swarm.city-run-meta.v3', run_file: rel(out), ...meta, call_log: calls }, null, 2)}\n`);
  process.stdout.write(`${rel(out)}: ${meta.calls} calls (${meta.failed_calls} failed), ${meta.passes} passes, ${meta.wall_s} s, $${meta.cost_usd}; `
    + `${meta.decisions} decisions, ${meta.fallback_warnings} fallbacks, ${meta.changed_decisions} changed between arms\n`);
  return opts.backend === 'none' || meta.fallback_warnings === 0;
}

function parseArgs(argv) {
  const value = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
  const opts = {
    which: argv[0] || 'both', backend: value('--backend', cd.readDotEnv().AGENT_BACKEND || 'local'), seed: Number(value('--seed', 42)),
    concurrency: Number(value('--concurrency', 16)), ticks: value('--ticks') === undefined ? undefined : Number(value('--ticks')), replay: argv.includes('--replay'),
  };
  if (!['fare', 'bike', 'both'].includes(opts.which) || !['local', 'token', 'api', 'none'].includes(opts.backend)
    || !Number.isInteger(opts.seed) || !(opts.concurrency >= 1) || (opts.ticks !== undefined && !(Number.isInteger(opts.ticks) && opts.ticks >= 1))) {
    throw new Error('Usage: node persona-swarm/runtime/run.js fare|bike|both [--backend local|token|api|none] [--seed 42] [--concurrency 16] [--ticks N] [--replay]');
  }
  return opts;
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  if (opts.which === 'both') {                                 // two processes in parallel, one per policy
    const started = Date.now();
    const codes = await Promise.all(['fare', 'bike'].map((s) => new Promise((resolve) => {
      spawn(process.execPath, [__filename, s, ...argv.slice(1)], { stdio: 'inherit' }).on('close', resolve);
    })));
    if (!opts.replay) process.stdout.write(`both policies: ${Math.round((Date.now() - started) / 100) / 10} s wall time\n`);
    process.exitCode = Math.max(...codes);
    return;
  }
  if (!(await runScenario(opts.which, opts))) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { process.stderr.write(`${e.message || e}\n`); process.exitCode = 2; });

module.exports = { runCity, runWorld, runScenario, specFor, parseArgs, sameDecisions };
