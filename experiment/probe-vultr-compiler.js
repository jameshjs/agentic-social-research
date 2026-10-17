#!/usr/bin/env node
/* Go/no-go probe for the Vultr hypothesis compiler (VULTR.md): two prepared and
 * two unseen prompts through the same schema, validator and world-spec builder.
 *
 *   node experiment/probe-vultr-compiler.js --dry-run   # exact request bodies, no key
 *   node experiment/probe-vultr-compiler.js             # live, needs VULTR_INFERENCE_API_KEY
 *   node experiment/probe-vultr-compiler.js --json      # live, full JSON on stdout
 *
 * Never prints the API key or request headers. Exits non-zero if any live
 * compile fell back to offline rules or missed its expected mapping. */
'use strict';

const compiler = require('./scenario-compiler');
const fixtures = require('./world-fixtures');
const world = require('../data/world/bloor_spadina_bathurst.json');
const {
  DEFAULT_BASE_URL, resolveCompilerOptions, chatCompletionBody, createVultrCompilerProvider, listModels,
} = require('./vultr-compiler');

const CASES = [
  { id: 'prepared_fare', prompt: compiler.PREPARED_PROMPTS.fare[0], expect: { path: 'known_operators', levers: { adult_fare_cad: 3.8 } } },
  { id: 'prepared_bike', prompt: compiler.PREPARED_PROMPTS.bike[0], expect: { path: 'known_operators', levers: { bloor_cycle_track: 'none' } } },
  { id: 'unseen_line2_headway', prompt: 'What if Line 2 trains came half as often?', expect: { path: 'known_operators', levers: { line2_headway_multiplier: 2 } } },
  { id: 'unseen_minimum_wage', prompt: 'What if Ontario raised the minimum wage by 10%?', expect: { path: 'speculative', levers: {} } },
];

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const secret = process.env.VULTR_INFERENCE_API_KEY || '';
const scrub = (text) => {
  let s = String(text ?? '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  if (secret) s = s.split(secret).join('[redacted]');
  return s;
};
// Human-readable lines go to stdout, or to stderr when stdout carries --json output.
const say = (line) => (asJson ? process.stderr : process.stdout).write(`${scrub(line)}\n`);

function expectationMet(result, expect) {
  if (result.execution_path !== expect.path) return false;
  const got = Object.fromEntries(result.interventions.map((i) => [i.lever, i.value]));
  const keys = Object.keys(expect.levers);
  return Object.keys(got).length === keys.length && keys.every((k) => got[k] === expect.levers[k]);
}

function dryRun() {
  const options = resolveCompilerOptions(process.env);
  const out = {
    mode: 'dry_run',
    endpoint: `${DEFAULT_BASE_URL}/chat/completions`,
    method: 'POST',
    auth: 'Bearer token from VULTR_INFERENCE_API_KEY, added server-side; never printed',
    model: options.model,
    requests: CASES.map(({ id, prompt }) => ({ id, prompt, body: chatCompletionBody(compiler.buildMessages(prompt), options) })),
    offline_preview: CASES.map(({ id, prompt, expect }) => {
      const r = compiler.offlineCompile(prompt, { world });
      return { id, execution_path: r.execution_path, levers: r.interventions.map((i) => ({ lever: i.lever, value: i.value })),
        runnable_spec: compiler.isRunnableSpec(compiler.toWorldSpec(r, fixtures, { world })), expectation_met: expectationMet(r, expect) };
    }),
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

async function live() {
  if (!secret) {
    process.stderr.write('Set VULTR_INFERENCE_API_KEY in this shell (server-side only), or run with --dry-run.\n');
    process.exitCode = 2;
    return;
  }
  const options = resolveCompilerOptions(process.env);
  let catalogue = null;
  try {
    catalogue = await listModels();
    say(`Vultr models (${catalogue.ids.length}): ${catalogue.ids.join(', ')}`);
    const entry = catalogue.models.find((m) => m.id === options.model);
    if (!entry) say(`WARNING: ${options.model} is not in the catalogue; chat would route to the default model and the adapter will reject it.`);
    else if (entry.json_schema === false) say(`WARNING: ${options.model} does not advertise json_schema output; try VULTR_COMPILER_RESPONSE_FORMAT=json_object.`);
  } catch (error) {
    say(`WARNING: model list unavailable (${error.message || error}); continuing.`);
  }
  const provider = createVultrCompilerProvider(options);
  const rows = [];
  for (const item of CASES) {
    const result = await compiler.compileHypothesis(item.prompt, { provider, world });
    const spec = compiler.toWorldSpec(result, fixtures, { world });
    const runnable = compiler.isRunnableSpec(spec);
    const fellBack = result.compiler.provider === 'offline_rules' || result.compiler.warnings.some((w) => w.code === 'compiler_fallback');
    const row = {
      id: item.id, prompt: item.prompt,
      provider: result.compiler.provider, model: result.compiler.model, live: result.compiler.live,
      latency_ms: result.compiler.latency_ms, attempts: result.compiler.attempts, usage: result.compiler.usage,
      validation: { ok: result.validation.ok, errors: result.validation.errors },
      execution_path: result.execution_path, geography_fit: result.geography_fit,
      levers: result.interventions.map((i) => ({ lever: i.lever, value: i.value, baseline: i.baseline, requested: i.requested })),
      unsupported_reason: result.unsupported_reason,
      runnable_spec: runnable, spec_id: spec.id, spec_intervention: runnable ? spec.intervention : null,
      warnings: result.compiler.warnings, attempted: result.compiler.attempted || null,
      fell_back: fellBack, expected: item.expect, expectation_met: expectationMet(result, item.expect),
      compiled: result,
    };
    rows.push(row);
    const levers = row.levers.map((l) => `${l.lever}=${l.value}`).join(',') || '—';
    const errors = row.validation.ok ? 'ok' : `errors[${row.validation.errors.map((e) => `${e.path}:${e.code}`).join('; ')}]`;
    say(`[${row.id}] model=${row.model ?? 'none'} latency=${row.latency_ms}ms attempts=${row.attempts} validation=${errors} path=${row.execution_path} levers=${levers} runnable_spec=${runnable ? 'yes' : 'no'} fallback=${fellBack ? 'YES' : 'no'} expected=${row.expectation_met ? 'yes' : 'NO'}`);
    for (const w of row.warnings) say(`    ${w.code}: ${w.message}`);
  }
  const summary = {
    endpoint: provider.endpoint, model: options.model, response_format: options.responseFormat, reasoning_effort: options.reasoningEffort,
    prompts: rows.length, fallbacks: rows.filter((r) => r.fell_back).length, expectation_misses: rows.filter((r) => !r.expectation_met).length,
    runnable_specs: rows.filter((r) => r.runnable_spec).length, total_latency_ms: rows.reduce((s, r) => s + (r.latency_ms || 0), 0),
    total_tokens: rows.reduce((s, r) => s + (r.usage?.total_tokens || 0), 0),
    note: 'Compilation maps a question to sandbox levers; it is not a policy-effect estimate. Speculative prompts stay not estimable.',
  };
  say(`summary: fallbacks=${summary.fallbacks} expectation_misses=${summary.expectation_misses} runnable_specs=${summary.runnable_specs}/${summary.prompts} total_latency=${summary.total_latency_ms}ms tokens=${summary.total_tokens}`);
  if (asJson) process.stdout.write(`${scrub(JSON.stringify({ summary, models: catalogue?.ids ?? null, rows }, null, 2))}\n`);
  if (summary.fallbacks || summary.expectation_misses) process.exitCode = 1;
}

(args.has('--dry-run') ? Promise.resolve().then(dryRun) : live())
  .catch((error) => { process.stderr.write(`${scrub(error && error.message ? error.message : error)}\n`); process.exitCode = 1; });
