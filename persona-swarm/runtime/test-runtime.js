/* Offline tests for the city persona runtime: bundles, prompts, ask(), decide(), memory, passes, replay, evaluation.
 * No model calls, no network. Usage: node --test persona-swarm/runtime/test-runtime.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { runExperiment, validate } = require('../../experiment/runner');
const fixtures = require('../../experiment/fixtures');
const cd = require('./claude-decision');
const orch = require('./orchestrator');
const { runCity, runWorld, specFor, sameDecisions } = require('./run');
const { evaluateRun } = require('./evaluate');
const mapped = require('./mapped');
const { runWorldExperiment } = require('../../experiment/world-runner');
const PEOPLE = require('../../experiment/world-fixtures').population.personas;

const SCENARIOS = ['fare', 'bike'];
const A = cd.loadAgents();
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// A deterministic stand-in for the model: picks a legal answer from the prompt alone.
const fakeCall = async ({ system, user, schema }) => {
  const p = schema.properties;
  const pick = (values) => values[hash(system[2] + user) % values.length];
  const output = p.action ? { action: pick(p.action.enum), reason: 'fake' } : p.choice ? { choice: pick(p.choice.enum), reason: 'fake' }
    : { stance: pick(p.stance.enum), affected: pick(p.affected.enum), reason: 'fake' };
  return { output, meta: { cost_usd: 0.001 } };
};
const provider = (name, extra = {}) => {
  const spec = specFor(name);
  return cd.createClaudeDecisionProvider({ sheets: A.sheets, baseline: spec.environment, places: cd.placesFrom(spec.world.locations), call: fakeCall, warn: () => {}, ...extra });
};

/* ---------- bundles ---------- */

test('100 bundles, 40 deciders, one roster valid against both fixture specs', () => {
  assert.equal(A.bundles.length, 100);
  assert.equal(A.deciders.length, 40);
  for (const name of SCENARIOS) { validate(fixtures[name], A.persons); validate(fixtures[name], A.deciders); }
  const roles = new Set(A.bundles.map((a) => a.role));
  for (const role of roles) assert.ok(A.deciders.some((d) => d.role === role), `no decider for ${role}`);
  const edge = A.data.edge_cases;
  assert.ok(A.deciders.some((d) => d.id === edge.fair_pass_transit_rider && d.role === 'transit_rider' && d.fare_category === 'fair_pass'));
  assert.ok(A.deciders.some((d) => d.id === edge.carless_shop_worker && d.role === 'shop_worker' && !d.has_car));
  assert.equal(new Set(A.bundles.map((a) => a.match_keys.donor_pid)).size, 100, 'donors repeat');
  assert.equal(new Set(A.bundles.map((a) => a.name)).size, 100);
});

test('each bundle is labelled, Twin-anchored, without US politics, and its sheet stays out of the runner person', () => {
  for (const a of A.bundles) {
    assert.equal(a.bundle_version, 'agents-v1');
    assert.equal(a.instructions_round, '009');
    assert.deepEqual(a.model, { agent: { model: 'claude-haiku-5-5', effort: 'low' }, orchestrator: { model: 'claude-opus-5-5', effort: 'medium' } });
    assert.match(a.attribution, /Twin-2K-500.*CC BY 4\.0/);
    assert.equal(a.persona_source, 'twin_anchored_v1');
    assert.deepEqual(Object.keys(a.match_keys).sort(), ['age_band', 'donor_pid', 'donor_set', 'income_band', 'sex']);
    if (a.fare_category === 'fair_pass') assert.notEqual(a.match_keys.age_band, '65+');
    assert.match(a.persona_sheet, /Relative profile \(computed from this person's earlier answers, compared with 240 survey respondents\):/);
    assert.match(a.persona_sheet, /\n\nYour situation in Toronto \(where you live now; it replaces the location and money details above\):\n- You live in /);
    assert.doesNotMatch(a.persona_sheet, /In politics today|political views as/);
    if (a.role === 'driver') assert.ok(a.has_car);
    if (a.role === 'cyclist') assert.ok(a.has_bike);
    if (a.shop) assert.doesNotMatch(a.situation.join(' '), new RegExp(a.shop.osm_id));
  }
  assert.ok(A.persons.every((p) => p.persona_sheet === undefined && p.situation === undefined));
});

/* ---------- prompts ---------- */

async function requestWhere(name, test_) {
  const seen = [];
  await runExperiment(specFor(name), { personas: A.deciders, decide: async (r) => { seen.push(r); return null; } });
  return seen.find(test_);
}

test('a decision prompt is instructions.md, the addendum and the sheet, then the situation and options', async () => {
  const request = await requestWhere('fare', (r) => r.tick === 1);
  const { system, user, schema } = cd.buildPrompt(request, A.sheets.get(request.person.id), { baseline: fixtures.fare.environment });
  assert.equal(system[0], fs.readFileSync(path.join(__dirname, '..', 'autoresearch', 'instructions.md'), 'utf8').trim());
  assert.equal(system[1], fs.readFileSync(path.join(__dirname, 'city-addendum.md'), 'utf8').trim());
  assert.equal(system[2], A.sheets.get(request.person.id));
  assert.match(user, /^It is week 1\. This trip: /);
  assert.match(user, /Cash left this week: \$\d+\.\d\d\./);
  assert.match(user, /What changed around you this week: nothing new\./);
  assert.match(user, /Last week, for this trip, you chose: none yet \(this is the first week\)\./);
  for (const o of request.options) assert.match(user, new RegExp(`^- ${o.action}: `, 'm'));
  assert.doesNotMatch(user, /baseline|intervention|seed/i);
  assert.deepEqual(schema.properties.action.enum, request.options.map((o) => o.action));
});

test('the situation states the policy change in dollars and percent, the lane change, and changes around the person', async () => {
  const fare = await requestWhere('fare', (r) => r.environment.adult_fare_cad > fixtures.fare.environment.adult_fare_cad && r.person.fare_category === 'adult' && r.options.some((o) => o.action === 'bus'));
  const text = cd.situation(fare, { baseline: fixtures.fare.environment, lastChoice: 'the TTC' });
  assert.match(text, /Adult TTC fare \$3\.80, up \$0\.50 \(\+15%\) from \$3\.30\./);
  assert.match(text, /Fair Pass fare \$2\.10 \(no change\)\./);
  assert.match(text, /- bus: TTC, 25 min, \$3\.80, to /);
  const bike = await requestWhere('bike', (r) => r.environment.bike_lane_protected === false && r.options.some((o) => o.action === 'bike_bloor'));
  assert.match(cd.situation(bike, { baseline: fixtures.bike.environment }), /Bloor St W cycle track: not protected: cyclists share the road with cars \(it was protected\)\./);
  const errand = { ...fare, shop_hours: 6, trip: { ...fare.person.routine.find((t) => t.purpose === 'errand'), destination: 'plaza' } };
  assert.match(cd.situation(errand, { baseline: fixtures.fare.environment }),
    /What changed around you this week: The neighbourhood shop is open 6 hours a day this week, down from 9, after last week's sales\. Because of that, this trip goes to the bigger shopping area further away instead of the neighbourhood shop\./);
});

test('ask() prompts: options or the default stance, each labelled survey-style', () => {
  const sheet = A.sheets.get('a001');
  const withOptions = cd.askPrompt(sheet, 'Which matters more?', ['Lower fares', 'More service']);
  assert.deepEqual(withOptions.system, [cd.INSTRUCTIONS, cd.ADDENDUM, sheet]);
  assert.match(withOptions.user, /^Which matters more\?\n\nOptions:\n- Lower fares\n- More service\n/);
  assert.deepEqual(withOptions.schema.properties.choice.enum, ['Lower fares', 'More service']);
  assert.deepEqual(cd.readAsk({ choice: 'More service', reason: ' r ' }, withOptions.options), { choice: 'More service', reason: 'r', label: 'survey-style reaction, not a forecast' });
  assert.equal(cd.readAsk({ choice: 'Free cake', reason: 'r' }, withOptions.options), null);
  const open = cd.askPrompt(sheet, 'Raise the fare?');
  assert.deepEqual(open.schema.properties.stance.enum, cd.STANCES);
  assert.deepEqual(open.schema.properties.affected.enum, ['not at all', 'a little', 'a lot']);
  assert.equal(cd.readAsk({ stance: 'support', affected: 'a lot', reason: 'x' }, null).label, 'survey-style reaction, not a forecast');
  assert.equal(cd.readAsk({ stance: 'maybe', affected: 'a lot', reason: 'x' }, null), null);
});

/* ---------- answers, fallback, limits ---------- */

test('only a legal action is accepted', async () => {
  const request = await requestWhere('bike', (r) => r.tick === 1);
  const legal = request.options[0].action;
  assert.deepEqual(cd.readAnswer({ action: legal, reason: ' I  ride. ' }, request), { action: legal, provider: cd.PROVIDER, reason: 'I ride.' });
  assert.equal(cd.readAnswer({ action: 'teleport', reason: 'x' }, request), null);
  assert.equal(cd.readAnswer({ action: legal, reason: 'x'.repeat(999) }, request).reason.length, 280);
});

test('an illegal answer, after one retry, falls back to the fixture rule with a warning', async () => {
  const log = [];
  let calls = 0;
  const decide = provider('bike', { onCall: (c) => log.push(c), call: async () => { calls++; return { output: { action: 'teleport', reason: 'x' }, meta: {} }; } });
  const result = await runExperiment(specFor('bike', 1), { personas: A.deciders.slice(0, 4), decide });
  assert.ok(log.length > 0 && log.every((c) => !c.ok && c.attempts === 2));
  assert.equal(calls, 2 * log.length);
  assert.ok(result.runs.baseline.warnings.every((w) => w.code === 'invalid_agent_action'));
});

test('a plan limit stops all further calls at once, with no retry', async () => {
  let calls = 0;
  const warnings = [];
  const decide = provider('fare', { warn: (m) => warnings.push(m), call: async () => { calls++; throw Object.assign(new Error('agent backend limit reached: usage limit'), { limited: true }); } });
  const request = await requestWhere('fare', (r) => r.tick === 1);
  assert.equal(await decide(request), null);
  assert.equal(await decide.poll('a001', 'q?'), null);
  assert.equal(calls, 1);
  assert.ok(decide.state().limited);
});

test('the CLI backend limit message is recognised', async () => {
  const child = (stdout) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {}; setImmediate(() => { c.stdout.emit('data', stdout); c.emit('close', 0); }); return c; };
  const call = cd.cliBackend({ spawnImpl: () => child(JSON.stringify({ is_error: true, result: 'Claude AI usage limit reached|1792300000' })) });
  await assert.rejects(call({ system: ['a'], user: 'u', schema: {} }), (e) => e.limited === true);
});

test('decide never runs more calls at once than its concurrency', async () => {
  let active = 0, peak = 0;
  const decide = provider('bike', { concurrency: 3, call: async (p) => { peak = Math.max(peak, ++active); await new Promise((r) => setTimeout(r, 5)); active--; return fakeCall(p); } });
  const answers = await Promise.all(Array.from({ length: 10 }, (_, i) => decide.poll(A.bundles[i].id, 'q?')));
  assert.equal(peak, 3);
  assert.ok(answers.every(Boolean));
});

/* ---------- CLI flags, environments, API ---------- */

test('agent and orchestrator calls run with no tools, MCP, skills or settings', () => {
  const args = cd.cliArgs({ ...cd.AGENT, system: ['a', 'b'], user: 'u', schema: { type: 'object' } });
  assert.deepEqual(args.slice(0, 5), ['-p', '--model', 'claude-haiku-5-5', '--effort', 'low']);
  for (const flag of ['--restricted', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'project');
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'a\n\nb');
  assert.ok(!args.includes('--bare'), '--bare would force API-key auth');
  const o = cd.cliArgs({ ...cd.ORCHESTRATOR, system: ['s'], user: 'u', schema: {} });
  assert.deepEqual(o.slice(0, 5), ['-p', '--model', 'claude-opus-5-5', '--effort', 'medium']);
  assert.equal(o[o.indexOf('--tools') + 1], '');
});

test('child environments: local drops API credentials; token mode is PATH, token and an isolated config only', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-not-real';
  const local = cd.cliEnv('local');
  assert.equal(local.ANTHROPIC_API_KEY, undefined);
  assert.equal(local.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  const token = cd.cliEnv('token', { token: 'tok-test-not-real', configDir: path.join(require('node:os').tmpdir(), 'ps-test-config') });
  assert.deepEqual(Object.keys(token).sort(), ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'PATH']);
  assert.equal(token.CLAUDE_CODE_OAUTH_TOKEN, 'tok-test-not-real');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
});

test('the API backend sends one SDK messages.create with effort, schema and a cached sheet, and pre-warms', async () => {
  const seen = [];
  const client = { messages: { create: async (p) => { seen.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"action":"bus","reason":"r"}' }],
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000 } }; } } };
  const call = cd.apiBackend({ client });
  const out = await call({ system: ['instructions', 'addendum', 'sheet'], user: 'situation', schema: { type: 'object' } });
  assert.deepEqual(out.output, { action: 'bus', reason: 'r' });
  assert.equal(seen[0].model, 'claude-haiku-5-5');
  assert.deepEqual(seen[0].output_config, { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } });
  assert.deepEqual(seen[0].system[2], { type: 'text', text: 'sheet', cache_control: { type: 'ephemeral' } });
  assert.ok(Math.abs(out.meta.cost_usd - (1000 * 0.10e-6 + 100 * 0.50e-6 + 2000 * 0.01e-6)) < 1e-12);
  await call.prewarm(['instructions', 'addendum', 'sheet']);
  assert.equal(seen[1].max_tokens, 0);
  assert.deepEqual(seen[1].system[2].cache_control, { type: 'ephemeral' });
  assert.throws(() => cd.apiBackend({ apiKey: '' }), /No ANTHROPIC_API_KEY/);
});

/* ---------- memory, passes, replay ---------- */

test('memory gives each person last week\'s choice for the trip, per arm', () => {
  const req = (tick, person) => ({ tick, person: { id: person, routine: [{ id: 'work' }] }, trip: { id: 'work' } });
  const m = cd.createRunMemory({ personIds: ['a', 'b'], resolve: (arm, week, person) => (person === 'b' ? 'walk' : null) });
  assert.equal(m.lastChoice(req(1, 'a')), 'none yet (this is the first week)'); m.record(req(1, 'a'), { action: 'bus' });
  assert.equal(m.lastChoice(req(1, 'b')), 'none yet (this is the first week)'); m.record(req(1, 'b'), null);
  assert.equal(m.lastChoice(req(2, 'a')), 'the TTC'); m.record(req(2, 'a'), { action: 'drive' });
  assert.equal(m.lastChoice(req(2, 'b')), 'walking', 'a fallback resolves to the fixture rule\'s choice');
  assert.equal(m.lastChoice(req(2, 'a')), 'the TTC');
  assert.equal(m.arm, 1);
});

for (const name of SCENARIOS) {
  test(`${name}: 40 deciders over 4 weeks: concurrent passes equal the sequential run, one call per (request, history), exact replay`, async () => {
    const spec = specFor(name);
    const sequential = await runExperiment(spec, { personas: A.deciders, decide: provider(name) });
    const seen = new Map();
    const decide = provider(name, { call: async (p) => { const k = p.system[2] + p.user; seen.set(k, (seen.get(k) || 0) + 1); return fakeCall(p); } });
    const weeks = [];
    const { result, passes } = await runCity(spec, { personas: A.deciders, ask: decide.ask, onSettled: (r, upTo) => { weeks.push(upTo); } });
    assert.equal(JSON.stringify(result), JSON.stringify(sequential));
    assert.ok([...seen.values()].every((n) => n === 1));
    assert.ok(passes <= spec.ticks * 2 + 1, `${passes} passes`);
    assert.equal(weeks.at(-1), 4);
    assert.deepEqual(weeks, [...weeks].sort((a, b) => a - b), 'weeks settle in order');
    const again = await runExperiment(spec, { seed: result.seed, personas: result.personas, replay_decisions: result.decision_replay });
    assert.ok(sameDecisions(result, again));
  });
}

test('runWorld streams decisions with their arm and each week once it settles', async () => {
  const weeks = [], rows = [];
  const { result, meta } = await runWorld('fare', { call: fakeCall, ticks: 2, onCall: (r) => rows.push(r), onWeek: (w, m) => weeks.push([w, m.baseline.tick, m.intervention.tick]) });
  assert.deepEqual(weeks, [[1, 1, 1], [2, 2, 2]]);
  assert.ok(rows.every((r) => ['both', 'baseline', 'policy'].includes(r.arm) && r.action));
  assert.equal(meta.deciders, 40);
  assert.equal(result.personas.length, 40);
  assert.match(result.population.source, /^agents-v1/);
  assert.ok(new Set(result.assumptions.map((a) => a.id)).has('external_agent_choice'));
});

/* ---------- orchestrator ---------- */

test('the orchestrator plan schema, filters and number check', async () => {
  const people = A.bundles.map(({ persona_sheet, ...a }) => a);
  const schema = orch.planSchema(people);
  assert.deepEqual(schema.properties.mode.enum, ['poll', 'run', 'reply']);
  assert.ok(schema.properties.filter.properties.roles.items.enum.includes('cyclist'));
  assert.equal(orch.selectAgents(people, {}).length, 100);
  const cyclists = orch.selectAgents(people, { roles: ['cyclist'] });
  assert.ok(cyclists.length && cyclists.every((a) => a.role === 'cyclist'));
  const young = orch.selectAgents(people, { age_bands: ['18-29'], income_bands: ['Less than $30,000'] });
  assert.ok(young.every((a) => a.match_keys.age_band === '18-29' && a.match_keys.income_band === 'Less than $30,000'));
  assert.ok(orch.validPlan({ mode: 'run', policy: 'fare', options: [] }));
  assert.ok(!orch.validPlan({ mode: 'poll', question: 'q', options: ['only one'] }));
  let seen;
  const plan = await orch.plan('ask the cyclists', people, async (prompt, model) => { seen = { prompt, model };
    return { output: { mode: 'poll', question: 'Q?', options: [], policy: '', reply: '', note: 'n', filter: { roles: ['cyclist'], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } } }; });
  assert.equal(plan.mode, 'poll');
  assert.deepEqual(seen.model, { model: 'claude-opus-5-5', effort: 'low', timeoutMs: 120000 }, 'routing runs at low effort with its own timeout');
  assert.deepEqual(orch.verifyNumbers('12 of 40 agents (30%)', { a: 12, b: 40, c: '30%' }), { numbers_verified: true, unverified: [] });
  assert.deepEqual(orch.verifyNumbers('about 55 agents', { a: 12 }), { numbers_verified: false, unverified: ['55'] });
});

test('the orchestrator and agent timeouts are independent', async () => {
  // A CLI that answers after 150 ms: too slow for a 50 ms agent timeout, fine for a longer orchestrator timeout.
  const slowChild = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    setTimeout(() => { c.stdout.emit('data', JSON.stringify({ structured_output: { summary: 'ok' } })); c.emit('close', 0); }, 150); return c; };
  const call = cd.cliBackend({ timeoutMs: 50, spawnImpl: slowChild });
  await assert.rejects(call({ system: ['s'], user: 'u', schema: {} }, cd.AGENT), (e) => e.timeout === true && /50 ms/.test(e.message));
  assert.deepEqual((await call({ system: ['s'], user: 'u', schema: {} }, { ...cd.ORCHESTRATOR, timeoutMs: 400 })).output, { summary: 'ok' });
  assert.equal(cd.ORCHESTRATOR.timeoutMs, 120000);
  assert.equal(cd.ROUTER.timeoutMs, 120000);
  assert.equal(cd.AGENT.timeoutMs, undefined, 'agents keep the backend default (30 s)');
  assert.deepEqual([cd.ROUTER.effort, cd.ORCHESTRATOR.effort], ['low', 'medium']);
});

test('the orchestrator retries a timed-out call once, but never a plan limit', async () => {
  const people = A.bundles.map(({ persona_sheet, ...a }) => a);
  const reply = { mode: 'poll', question: 'Q?', options: [], policy: '', reply: '', note: 'n',
    filter: { roles: [], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } };
  const opts = [];
  let n = 0;
  const flaky = async (prompt, o) => { opts.push(o); if (++n === 1) throw Object.assign(new Error('claude CLI timed out after 120000 ms'), { timeout: true }); return { output: reply }; };
  assert.equal((await orch.plan('q', people, flaky)).question, 'Q?');
  assert.equal(n, 2);
  assert.ok(opts.every((o) => o.effort === 'low' && o.timeoutMs === 120000));
  const summaryOpts = [];
  await orch.summarise('q', { a: 1 }, async (prompt, o) => { summaryOpts.push(o); return { output: { summary: '1' } }; });
  assert.deepEqual(summaryOpts, [{ model: 'claude-opus-5-5', effort: 'medium', timeoutMs: 120000 }]);
  let m = 0;
  await assert.rejects(orch.plan('q', people, async () => { m++; throw Object.assign(new Error('agent backend limit reached'), { limited: true }); }), /limit/);
  assert.equal(m, 1);
});

/* ---------- evaluation ---------- */

test('the evaluation reports rates, consistency, elasticity, Bloor responses and variety', async () => {
  const fare = (await runCity(specFor('fare'), { personas: A.deciders, ask: provider('fare').ask })).result;
  const e = await evaluateRun(fare, { backend: 'fake', model: 'm', effort: 'low', cost_usd: 0.02, wall_s: 1, passes: 9, call_log: [{ ok: true, latency_ms: 100 }, { ok: false, latency_ms: 300 }] });
  assert.equal(e.feasible_action_rate, 1);
  const paid = (arm) => fare.runs[arm].events.filter((x) => x.action === 'pay_fare' && x.tick >= 2).length;
  assert.equal(e.fare_elasticity.agents.elasticity, Math.round((((paid('intervention') - paid('baseline')) / paid('baseline')) / (0.5 / 3.3)) * 100) / 100);
  assert.ok(['in range', 'out of range'].includes(e.fare_elasticity.verdict));
  assert.ok(e.consistency.same_choice_set.pairs > 0, 'drivers and walkers face the same options in both arms');
  assert.equal(e.variety.fixture_rule.situations, e.variety.agents.situations);
  const bike = await evaluateRun((await runCity(specFor('bike'), { personas: A.deciders, ask: provider('bike').ask })).result);
  const b = bike.bloor_cyclists.agents;
  assert.ok(b.cyclist_trips > 0 && Math.abs(b.stay + b.reroute + b.switch_mode + b.defer - 1) < 0.01);
});

/* ---------- the mapped world: the 19 fixture people as persona agents ---------- */

test('mapped: each of the 19 fixture people gets a distinct, seeded Twin donor of the same fare category and income band', () => {
  const donors = mapped.matchDonors(PEOPLE, A.bundles);
  assert.equal(donors.size, 19);
  assert.equal(new Set([...donors.values()].map((b) => b.id)).size, 19);
  for (const p of PEOPLE) {
    assert.equal(donors.get(p.id).fare_category, p.fare_category, p.id);
    assert.equal(donors.get(p.id).match_keys.income_band, mapped.bandOf(p), p.id);
  }
  assert.deepEqual([...mapped.matchDonors(PEOPLE, A.bundles)].map(([id, b]) => [id, b.id]), [...donors].map(([id, b]) => [id, b.id]));
  const nadia = PEOPLE.find((p) => p.id === 'nadia'), donor = donors.get('nadia');
  const sheet = mapped.mappedSheet(nadia, donor, { osm_n310146977: 'Bulk Barn' });
  const head = '\nYour situation in Toronto';
  assert.equal(sheet.slice(0, sheet.lastIndexOf(head)), donor.persona_sheet.slice(0, donor.persona_sheet.lastIndexOf(head)), 'the Twin answers stay as tuned');
  const situation = sheet.slice(sheet.lastIndexOf(head));
  assert.equal(sheet.split(head).length, 2);
  // The fare line may repeat: donors are matched on fare category.
  assert.ok(donor.situation.filter((line) => !line.includes('TTC fare')).every((line) => !situation.includes(line)), "the donor bundle's own situation is replaced");
  for (const text of ['You live on Lippincott St', 'Fair Pass discount', 'shopping at Bulk Barn about 18:40']) assert.ok(situation.includes(text), text);
  assert.doesNotMatch(situation, /sensitivity|preference/);
});

test('mapped: persona agents choose every trip of both policies from legal options; same seed, same run; replay is exact', async () => {
  for (const scenario of mapped.SCENARIOS) {
    const rows = [], prompts = [];
    const call = async (prompt) => { prompts.push(prompt); return fakeCall(prompt); };
    const { result, meta } = await mapped.runMapped(scenario, { call, agents: A, onCall: (r) => rows.push(r) });
    assert.equal(result.schema_version, 'experiment.v2');
    assert.equal(meta.people, 19);
    assert.equal(meta.fallback_warnings, 0);
    assert.equal(meta.agent_decisions, meta.decisions);
    const choices = ['baseline', 'intervention'].flatMap((arm) => result.runs[arm].events.filter((e) => e.action === 'choose_trip'));
    assert.equal(new Set(choices.map((e) => e.actor)).size, 19);
    for (const e of choices) {
      assert.equal(e.provider, 'persona_agent', e.id);
      assert.ok(e.options.some((o) => o.action === e.chosen), `${e.id} chose a legal option`);
      assert.deepEqual(e.assumption_ids, ['external_agent_choice']);
    }
    const p = prompts.find((x) => x.user.includes(scenario === 'fare' ? 'Adult TTC fare $3.80, up $0.50 (+15%) from $3.30' : 'removed: cyclists share the road with cars (it was protected)'));
    assert.ok(p, 'the policy change is stated');
    assert.deepEqual(p.system.slice(0, 2), [cd.INSTRUCTIONS, cd.ADDENDUM]);
    assert.ok(p.schema.properties.action.enum.includes('defer'));
    // Each call's previous choice is the person's own decision for that trip the day before, in its arm.
    const made = new Map(['baseline', 'intervention'].flatMap((arm) => result.runs[arm].decisions.map((d) => [`${arm}|${d.tick}|${d.actor}|${d.trip_id}`, d.action])));
    for (const r of rows.filter((x) => x.tick > 1)) assert.equal(r.last_choice, mapped.LABEL[made.get(`${r.arm === 'policy' ? 'intervention' : 'baseline'}|${r.tick - 1}|${r.person}|${r.trip}`)], `${r.person} ${r.tick}`);
    assert.deepEqual((await mapped.runMapped(scenario, { call: fakeCall, agents: A })).result, result);
    assert.deepEqual(await mapped.replayMapped(result), result);
  }
});

test('mapped: fare and bike share one baseline; an unchanged request reuses its answer, a changed one is asked again', async () => {
  // Answers depend on a counter, not on the prompt, so equal answers below come from reuse, not from a deterministic stub.
  let n = 0;
  const prompts = [];
  const call = async (prompt) => { prompts.push(prompt); const e = prompt.schema.properties.action.enum; n++; return { output: { action: e[n % e.length], reason: `answer ${n}` }, meta: {} }; };
  const answers = new Map(), rows = { fare: [], bike: [] }, runs = {};
  for (const scenario of mapped.SCENARIOS) runs[scenario] = await mapped.runMapped(scenario, { call, agents: A, answers, onCall: (r) => rows[scenario].push(r) });
  const { fare, bike } = runs;
  assert.deepEqual(bike.result.runs.baseline.decisions, fare.result.runs.baseline.decisions);
  assert.deepEqual(bike.result.runs.baseline.metrics, fare.result.runs.baseline.metrics);
  assert.ok(rows.bike.length > 0 && rows.bike.every((r) => r.arm === 'policy'), 'bike asks only what its policy changed');
  assert.equal(new Set(prompts.map((p) => cd.sha256(JSON.stringify(p)))).size, prompts.length, 'no prompt is asked twice');
  // Each person sees only the levers they face: their own fare with a Line 2 option, the cycle track with a bike or car option.
  for (const { system, user } of prompts) {
    const fair = system[2].includes('You pay the Fair Pass discount TTC fare.');
    assert.equal(user.includes(fair ? 'Fair Pass fare $' : 'Adult TTC fare $'), user.includes('\n- transit:'));
    assert.ok(!user.includes(fair ? 'Adult TTC fare' : 'Fair Pass fare'));
    assert.equal(user.includes('Bloor St W cycle track between'), /\n- (bike_\w+|drive):/.test(user));
  }
  const fairPass = new Set(PEOPLE.filter((p) => p.fare_category === 'fair_pass').map((p) => p.id));
  const faces = { fare: (e) => !fairPass.has(e.actor) && e.options.some((o) => o.action === 'transit'), bike: (e) => e.options.some((o) => /^(bike_|drive$)/.test(o.action)) };
  for (const scenario of mapped.SCENARIOS) {
    const { result, meta } = runs[scenario];
    const choices = (arm) => result.runs[arm].events.filter((e) => e.action === 'choose_trip' && e.tick >= result.scenario.policy_start);
    const key = (e) => `${e.tick}|${e.actor}|${e.trip_id}`;
    const base = new Map(choices('baseline').map((e) => [key(e), e]));
    const asked = new Set(rows[scenario].filter((r) => r.arm === 'policy').map((r) => `${r.tick}|${r.person}|${r.trip}`));
    const facing = choices('intervention').filter(faces[scenario]);
    assert.ok(facing.length > 0 && meta.reused_answers > 0, scenario);
    for (const e of facing) assert.ok(asked.has(key(e)), `${scenario}: ${e.actor} day ${e.tick} faces the change and is asked`);
    for (const e of choices('intervention').filter((x) => !asked.has(key(x)))) {
      assert.deepEqual([e.chosen, e.reason], [base.get(key(e)).chosen, base.get(key(e)).reason], `${scenario}: ${key(e)} keeps the baseline answer`);
    }
  }
});

test('mapped: an illegal or missing answer leaves the fixture rule to decide, with a warning', async () => {
  const plain = await runWorldExperiment(mapped.mappedSpec('fare'), { world: mapped.WORLD });
  for (const call of [async () => ({ output: { action: 'teleport', reason: 'x' }, meta: {} }), async () => ({ output: null, meta: {} })]) {
    const { result, meta } = await mapped.runMapped('fare', { call, agents: A });
    assert.equal(meta.agent_decisions, 0);
    assert.equal(meta.fallback_warnings, meta.decisions);
    for (const arm of ['baseline', 'intervention']) {
      assert.deepEqual(result.runs[arm].events, plain.runs[arm].events);
      assert.deepEqual(result.runs[arm].decisions, plain.runs[arm].decisions);
    }
  }
});

test('mapped: committed mapped samples replay exactly from their decisions, with no model calls', async () => {
  const dir = path.join(__dirname, '..', 'data', 'city', 'live', 'samples');
  for (const f of fs.readdirSync(dir).filter((x) => x.includes('-mapped-'))) {
    const { result, meta } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(meta.fallback_warnings, 0, f);
    assert.equal(meta.agent_decisions, meta.decisions, f);
    assert.ok(sameDecisions(result, await mapped.replayMapped(result)), f);
  }
});
