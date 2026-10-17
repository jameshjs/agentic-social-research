/* The city persona agents, shaped like experiment/vultr-decision.js. Each call is packaged as in the tuning loop:
 * autoresearch/instructions.md (read, never copied), then the city addendum, then the persona sheet as the system
 * prompt; then the situation and the question or options as the user message. Two entry points:
 *   decide(request)  world actions for experiment/runner.js, the only source of numbers; JSON {action, reason} limited
 *                    to the legal options; on failure null, so the runner's fixture rule decides with a warning.
 *   ask(id, q, opts) a generic poll: with options, {choice, reason}; without, {stance, affected, reason}, a
 *                    survey-style reaction, not a forecast.
 * Backends: local (this machine's claude login), token (CLAUDE_CODE_OAUTH_TOKEN), api (opt-in SDK), none. */
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');                     // persona-swarm/
const AGENTS_FILE = path.join(ROOT, 'data', 'city', 'agents.json');
const AGENT = { model: 'claude-haiku-5-5', effort: 'low' };
// The orchestrator: routing is a simple choice (low effort); the summary writes prose from results (medium). Opus needs
// longer than the agents: its own 120 s timeout, with one retry.
const ORCHESTRATOR = { model: 'claude-opus-5-5', effort: 'medium', timeoutMs: 120000 };
const ROUTER = { ...ORCHESTRATOR, effort: 'low' };
const INSTRUCTIONS = fs.readFileSync(path.join(ROOT, 'autoresearch', 'instructions.md'), 'utf8').trim();
const ADDENDUM = fs.readFileSync(path.join(__dirname, 'city-addendum.md'), 'utf8').trim();
const ROUND = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'record', 'final.json'), 'utf8')).find((r) => r.section === 'meta').instructions_round;
const PROVIDER = `${AGENT.model}:instructions-r${ROUND}`;
const POLL_LABEL = 'survey-style reaction, not a forecast';
const STANCES = ['strongly oppose', 'oppose', 'neutral', 'support', 'strongly support'];
const AFFECTED = ['not at all', 'a little', 'a lot'];
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
// No tools at all (no shell, files or network), no MCP, no skills, no settings or CLAUDE.md, no saved session.
const CLI_FLAGS = ['--tools', '', '--restricted', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands',
  '--setting-sources', 'project', '--no-session-persistence', '--exclude-dynamic-system-prompt-sections', '--output-format', 'json'];
// Haiku 5.5 list prices per token for prompts up to 100K tokens (USD): input, output, 5-minute cache write, cache read.
const PRICE = { input: 0.10e-6, output: 0.50e-6, cache_write: 0.125e-6, cache_read: 0.01e-6 };
const LABEL = { bus: 'the TTC', walk: 'walking', drive: 'driving', bike_bloor: 'cycling along Bloor St W',
  bike_detour: 'cycling on quieter side streets', defer: 'skipping or postponing the trip' };
const DEFAULT_PLACES = { local_shop: 'the neighbourhood shop', plaza: 'the bigger shopping area further away', workplace: 'your workplace' };
const money = (x) => `$${Number(x).toFixed(2)}`;
const flagged = (message, flag) => Object.assign(new Error(message), { [flag]: true });
const LIMIT = /usage limit|limit reached|rate.?limit|too many requests|\b429\b/i;

/* ---------- bundles ---------- */

/* agents.json → bundles, runner persons (without the sheet, so run files stay small) and sheets by id. */
function loadAgents(file = AGENTS_FILE) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const persons = data.agents.map(({ persona_sheet, situation, attribution, model, ...person }) => person);
  return { data, bundles: data.agents, persons, deciders: persons.filter((p) => p.decider), sheets: new Map(data.agents.map((a) => [a.id, a.persona_sheet])) };
}

function placesFrom(locations = []) {
  const places = { ...DEFAULT_PLACES };
  for (const loc of locations) if (!places[loc.id] && loc.label) places[loc.id] = loc.label.toLowerCase();
  return places;
}

/* ---------- decide(): the situation block ---------- */

function change(label, now, was) {
  if (was === undefined || now === was) return `${label} ${money(now)}${was === undefined ? '' : ' (no change)'}`;
  const diff = now - was;
  const pct = Math.round((diff / was) * 100);
  return `${label} ${money(now)}, ${diff > 0 ? 'up' : 'down'} ${money(Math.abs(diff))} (${pct > 0 ? '+' : ''}${pct}%) from ${money(was)}`;
}

function optionText(option, env, places) {
  if (option.action === 'defer') return '- defer: skip or postpone this trip this week';
  const cost = option.cost_cad ? `, ${money(option.cost_cad)}` : ', no cost';
  const to = option.destination ? `, to ${places[option.destination] || option.destination.replace(/_/g, ' ')}` : '';
  const how = {
    bus: 'TTC', walk: 'walk', drive: 'drive',
    bike_bloor: `cycle along Bloor St W ${env.bike_lane_protected ? 'in the protected cycle track' : 'with no protected lane, sharing the road with cars'}`,
    bike_detour: 'cycle on quieter side streets',
  }[option.action] || option.action.replace(/_/g, ' ');
  return `- ${option.action}: ${how}, ${option.minutes} min${cost}${to}`;
}

/* The trip, cash, the price or road change against the baseline, what changed around the person during the run (from
 * the request, which the runner builds from committed events), their own last choice, then each legal option. */
function situation(request, { baseline, places = DEFAULT_PLACES, lastChoice = 'none yet (this is the first week)' } = {}) {
  const { tick, trip, person, environment: env, options, shop_hours, cash_cad } = request;
  const base = baseline || {};
  const purpose = trip.purpose === 'commute' ? (trip.destination === 'local_shop' ? 'the trip to the shop where you work' : 'the trip to work') : 'shopping';
  const lane = (p) => (p ? 'protected' : 'not protected: cyclists share the road with cars');
  const usual = (person.routine || []).find((t) => t.id === trip.id);
  const around = [];
  if (base.shop_hours !== undefined && shop_hours !== base.shop_hours) {
    around.push(`The neighbourhood shop is open ${shop_hours} hours a day this week, ${shop_hours < base.shop_hours ? 'down' : 'up'} from ${base.shop_hours}, after last week's sales.`);
  }
  if (usual && usual.destination !== trip.destination) {
    around.push(`Because of that, this trip goes to ${places[trip.destination] || trip.destination} instead of ${places[usual.destination] || usual.destination}.`);
  }
  return [
    `It is week ${tick}. This trip: ${purpose}, to ${places[trip.destination] || trip.destination}, ${trip.distance_km} km from home.`,
    `Cash left this week: ${money(cash_cad)}.`,
    'Compared with usual:',
    `- ${change('Adult TTC fare', env.adult_fare_cad, base.adult_fare_cad)}.`,
    `- ${change('Fair Pass fare', env.fair_pass_fare_cad, base.fair_pass_fare_cad)}.`,
    `- Bloor St W cycle track: ${lane(env.bike_lane_protected)}${base.bike_lane_protected === undefined ? '' : env.bike_lane_protected === base.bike_lane_protected ? ' (no change)' : ` (it was ${lane(base.bike_lane_protected).split(':')[0]})`}.`,
    `What changed around you this week: ${around.length ? around.join(' ') : 'nothing new.'}`,
    `Last week, for this trip, you chose: ${lastChoice}.`,
    '',
    'Your options for this trip:',
    ...options.map((o) => optionText(o, env, places)),
    '',
    'Which option do you take for this trip?',
  ].join('\n');
}

function schemaFor(request) {
  return { type: 'object', additionalProperties: false, required: ['action', 'reason'],
    properties: { action: { type: 'string', enum: request.options.map((o) => o.action) }, reason: { type: 'string' } } };
}

function buildPrompt(request, sheet, opts = {}) {
  if (!sheet) throw new Error(`No persona sheet for ${request.person.id}`);
  return { system: [INSTRUCTIONS, ADDENDUM, sheet], user: situation(request, opts), schema: schemaFor(request) };
}

const tidy = (reason) => String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 280) || 'No reason given.';
function readAnswer(output, request) {
  if (!output || typeof output.action !== 'string' || !request.options.some((o) => o.action === output.action)) return null;
  return { action: output.action, provider: PROVIDER, reason: tidy(output.reason) };
}

/* ---------- ask(): a generic poll ---------- */

/* Options as given: all integers (a numeric scale such as 1-5) stay numbers; anything else becomes text. */
function normalizeOptions(options) {
  if (!Array.isArray(options) || !options.length) return null;
  return options.every((o) => Number.isInteger(o)) ? options : options.map(String);
}
const isScale = (opts) => opts && typeof opts[0] === 'number';
const isFive = (opts) => JSON.stringify(opts) === '[1,2,3,4,5]';
// The 1-5 scale, labelled so its direction can't be misread: it rates the change itself, not the thing it changes.
const FIVE_LABELS = { 1: 'strongly oppose this change', 2: 'oppose', 3: 'neutral / mixed', 4: 'support', 5: 'strongly support this change' };

function askPrompt(sheet, question, options) {
  if (!sheet) throw new Error('No persona sheet');
  const opts = normalizeOptions(options);
  const user = !opts
    ? `${question}\n\nSay where you stand (${STANCES.join(', ')}), how much it would affect you (${AFFECTED.join(', ')}), and give a one-sentence reason.`
    : isFive(opts)
      ? `${question}\n\nRate this change:\n${opts.map((o) => `${o} = ${FIVE_LABELS[o]}`).join('\n')}\n\nChoose exactly one number and give a one-sentence reason.`
      : `${question}\n\nOptions:\n${opts.map((o) => `- ${o}`).join('\n')}\n\n${isScale(opts) ? 'Choose exactly one number' : 'Choose exactly one option, as written,'} and give a one-sentence reason.`;
  const schema = opts
    ? { type: 'object', additionalProperties: false, required: ['choice', 'reason'],
      properties: { choice: isScale(opts) ? { type: 'integer', enum: opts } : { type: 'string', enum: opts }, reason: { type: 'string' } } }
    : { type: 'object', additionalProperties: false, required: ['stance', 'affected', 'reason'],
      properties: { stance: { type: 'string', enum: STANCES }, affected: { type: 'string', enum: AFFECTED }, reason: { type: 'string' } } };
  return { system: [INSTRUCTIONS, ADDENDUM, sheet], user, schema, options: opts };
}

/* A cheap check that a reason agrees with its rating: keyword cues only, no model call. A cue just after a negation
 * ("don't support", "won't help") counts for the other side. "check" means the cues all point against the chosen side;
 * the agent's choice is never changed. */
const FOR = /\b(support\w*|in favou?r|good (idea|thing|change|move)|great|welcome\w*|glad|happy|benefit\w*|helps?|helpful|makes sense|love|approve|agree|worth it|better|improve\w*|safer|finally|pleased)\b/g;
const AGAINST = /\b(oppos\w*|against|bad (idea|thing|change|move)|hurts?|harm\w*|unfair|worse|can'?t afford|waste\w*|burden\w*|costly|too expensive|hate|dislike|disagree|not worth|unnecessary|pointless|dangerous|unsafe)\b/g;
function cues(reason) {
  const text = ` ${String(reason || '').toLowerCase().replace(/’/g, "'")}`;
  const negated = (i) => /(\bnot|\bnever|\bno|n't)\s+(\w+\s+){0,2}$/.test(text.slice(Math.max(0, i - 40), i));
  let pro = 0, con = 0;
  for (const m of text.matchAll(FOR)) if (negated(m.index)) con++; else pro++;
  for (const m of text.matchAll(AGAINST)) if (negated(m.index)) pro++; else con++;
  return { pro, con };
}
function consistency(lean, reason) {
  const { pro, con } = cues(reason);
  return (lean < 0 && pro > 0 && con === 0) || (lean > 0 && con > 0 && pro === 0) ? 'check' : 'ok';
}

function readAsk(output, options) {
  if (!output) return null;
  if (options) {
    const choice = isScale(options) && typeof output.choice === 'string' && /^\d+$/.test(output.choice) ? Number(output.choice) : output.choice;
    if (!options.includes(choice)) return null;
    const answer = { choice, reason: tidy(output.reason), label: POLL_LABEL };
    return isFive(options) ? { ...answer, consistency: consistency(Math.sign(choice - 3), answer.reason) } : answer;
  }
  if (!STANCES.includes(output.stance) || !AFFECTED.includes(output.affected)) return null;
  const reason = tidy(output.reason);
  return { stance: output.stance, affected: output.affected, reason, label: POLL_LABEL, consistency: consistency(Math.sign(STANCES.indexOf(output.stance) - 2), reason) };
}

/* ---------- memory: what this person chose for this trip last week, in this arm ---------- */

/* The runner asks baseline weeks 1..T, then intervention weeks 1..T, people and trips in order, so a step back in
 * (week, person, trip) starts the next arm. Before the policy the two arms are identical and the runner reuses the
 * baseline's answers without calling decide, so a missing intervention entry falls back to the baseline's. A fallback
 * (null) answer's real choice came from the fixture rule; resolve(arm, week, person, trip) can supply it. */
function createRunMemory({ personIds, resolve } = {}) {
  const index = new Map(personIds.map((id, i) => [id, i]));
  const seen = new Map();
  let last = null;
  let arm = 0;
  const key = (a, week, r) => `${a}|${week}|${r.person.id}|${r.trip.id}`;
  return {
    get arm() { return arm; },
    lastChoice(request) {
      const pos = [request.tick, index.get(request.person.id) ?? -1, request.person.routine.findIndex((t) => t.id === request.trip.id)];
      const after = last && (pos[0] > last[0] || (pos[0] === last[0] && (pos[1] > last[1] || (pos[1] === last[1] && pos[2] > last[2]))));
      if (last && !after) arm++;
      last = pos;
      if (request.tick === 1) return 'none yet (this is the first week)';
      const from = seen.has(key(arm, request.tick - 1, request)) ? arm : 0;
      const action = seen.get(key(from, request.tick - 1, request)) ?? resolve?.(from, request.tick - 1, request.person.id, request.trip.id);
      return action ? LABEL[action] || action : 'not recorded';
    },
    record(request, answer) { seen.set(key(arm, request.tick, request), answer ? answer.action : null); },
  };
}

/* ---------- backends ---------- */

function readDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
}

/* The child environment for `claude -p`. local: this machine's login, with any API key removed so calls never move to
 * API billing. token: only PATH, the token and an isolated config dir, so the machine's own login isn't used. */
function cliEnv(mode = 'local', { token, configDir = path.join(os.tmpdir(), 'persona-swarm-claude-config') } = {}) {
  if (mode === 'token') {
    fs.mkdirSync(configDir, { recursive: true });
    return { PATH: process.env.PATH, CLAUDE_CODE_OAUTH_TOKEN: token, CLAUDE_CONFIG_DIR: configDir };
  }
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

function cliArgs({ model, effort, system, user, schema }) {
  return ['-p', '--model', model, '--effort', effort, ...CLI_FLAGS, '--system-prompt', system.join('\n\n'), '--json-schema', JSON.stringify(schema), user];
}

function cliBackend({ mode = 'local', token, command = 'claude', timeoutMs = 30000, spawnImpl = spawn } = {}) {
  const cwd = path.join(os.tmpdir(), 'persona-swarm-empty');
  fs.mkdirSync(cwd, { recursive: true });
  // timeoutMs is per backend (the agents' 30 s); a call may set its own (the orchestrator's 120 s).
  return function call(prompt, { model = AGENT.model, effort = AGENT.effort, timeoutMs: limit = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawnImpl(command, cliArgs({ model, effort, ...prompt }), { cwd, env: cliEnv(mode, { token }), stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Object.assign(new Error(`claude CLI timed out after ${limit} ms`), { timeout: true })); }, limit);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e.code === 'ENOENT' ? flagged(`claude CLI not found (${e.message})`, 'unavailable') : e); });
      child.on('close', () => {
        clearTimeout(timer);
        let d;
        try { d = JSON.parse(out); } catch {
          const text = (err || out).slice(0, 200);
          return reject(LIMIT.test(text) ? flagged(`agent backend limit reached: ${text}`, 'limited') : new Error(`claude CLI returned no JSON: ${text}`));
        }
        const meta = { cost_usd: d.total_cost_usd ?? null, duration_ms: d.duration_ms ?? null, usage: d.usage ?? null };
        if (d.is_error || d.structured_output == null) {
          const text = String(d.result).slice(0, 200);
          return reject(Object.assign(LIMIT.test(text) ? flagged(`agent backend limit reached: ${text}`, 'limited') : new Error(`claude CLI error: ${text}`), { meta }));
        }
        resolve({ output: d.structured_output, meta });
      });
    });
  };
}

/* Opt-in: the Anthropic API through @anthropic-ai/sdk (npm install in persona-swarm/runtime), key from persona-swarm/.env,
 * never exported. The sheet block is cached per agent; prewarm() writes each cache once before a poll. */
function apiBackend({ apiKey = readDotEnv().ANTHROPIC_API_KEY, client, timeoutMs = 60000 } = {}) {
  if (!client) {
    if (!apiKey) throw flagged('No ANTHROPIC_API_KEY in persona-swarm/.env', 'unavailable');
    let sdk;
    try { sdk = require('@anthropic-ai/sdk'); } catch { throw flagged('@anthropic-ai/sdk is not installed: run npm install in persona-swarm/runtime', 'unavailable'); }
    const Anthropic = sdk.default || sdk;
    client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }
  const system = (blocks) => blocks.map((text, i) => (i === blocks.length - 1 ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text }));
  async function call({ system: blocks, user, schema }, { model = AGENT.model, effort = AGENT.effort, timeoutMs: limit } = {}) {
    const started = Date.now();
    let r;
    try {
      r = await client.messages.create({ model, max_tokens: 16000, system: system(blocks), messages: [{ role: 'user', content: user }],
        output_config: { effort, format: { type: 'json_schema', schema } } }, limit ? { timeout: limit } : undefined);
    } catch (e) { throw e?.status === 429 ? flagged('agent backend limit reached: API rate limit', 'limited') : e; }
    const u = r.usage || {};
    const meta = { duration_ms: Date.now() - started, usage: u,
      cost_usd: (u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
        + (u.cache_creation_input_tokens || 0) * PRICE.cache_write + (u.cache_read_input_tokens || 0) * PRICE.cache_read };
    if (r.stop_reason !== 'end_turn') throw Object.assign(new Error(`Anthropic API stop_reason ${r.stop_reason}`), { meta });
    return { output: JSON.parse((r.content || []).find((b) => b.type === 'text')?.text), meta };
  }
  call.prewarm = (blocks, { model = AGENT.model, effort = AGENT.effort } = {}) =>
    client.messages.create({ model, max_tokens: 0, system: system(blocks), messages: [{ role: 'user', content: 'ready' }], output_config: { effort } });
  return call;
}

function makeBackend(mode, { token, apiKey, timeoutMs, spawnImpl, client } = {}) {
  if (mode === 'local' || mode === 'token') return cliBackend({ mode, token, timeoutMs, spawnImpl });
  if (mode === 'api') return apiBackend({ apiKey, client, timeoutMs });
  throw flagged(`backend ${mode}: no model calls`, 'unavailable');
}

/* ---------- the provider ---------- */

/* Returns decide(request) for runExperiment(spec, { personas, decide }), with its own per-arm memory (decide.reset()
 * before another run). decide.ask(request, lastChoice) is one world call, for run.js's passes; decide.poll(id, question,
 * options) is one ask() call; decide.state() says whether the backend is down or at its limit. */
function createClaudeDecisionProvider({ sheets, baseline, places, personIds, backend = 'local', token, apiKey, concurrency = 16, retries = 1,
  timeoutMs = 30000, onCall = () => {}, warn = (m) => process.stderr.write(`${m}\n`), call } = {}) {
  let down = null;
  let limited = null;
  if (!call) { try { call = makeBackend(backend, { token, apiKey, timeoutMs }); } catch (e) { down = e.message; } }
  if (down) warn(`persona agents: ${down}; the runner's fixture rule decides instead`);
  let active = 0;
  let cap = concurrency;
  const queue = [];
  const slot = () => new Promise((resolve) => { if (active < cap) { active++; resolve(); } else queue.push(resolve); });
  const release = () => { const next = queue.shift(); if (next) next(); else active--; };

  async function attempt(prompt, read, info) {
    if (down || limited) { onCall({ ...info, ok: false, skipped: true, limited: Boolean(limited), error: down || limited }); return null; }
    await slot();
    const started = Date.now();
    let cost = 0, error, meta = {};
    try {
      for (let n = 1; n <= 1 + retries && !down && !limited; n++) {      // retry a timeout, error or illegal answer once
        try {
          const res = await call(prompt, info.model ? { model: info.model, effort: info.effort } : undefined);
          meta = res.meta || {};
          cost += meta.cost_usd || 0;
          const answer = read(res.output);
          if (answer) { onCall({ ...info, ok: true, answer, attempts: n, latency_ms: Date.now() - started, ...meta, cost_usd: cost }); return answer; }
          error = `illegal or malformed answer: ${JSON.stringify(res.output).slice(0, 120)}`;
        } catch (e) {
          meta = e.meta || {};
          cost += meta.cost_usd || 0;
          error = e.message;
          if (e.unavailable) { down = e.message; warn(`persona agents: ${e.message}`); }
          if (e.limited) { limited = e.message; warn('persona agents: agent backend limit reached; no further calls until restart'); }   // never retried
        }
      }
      onCall({ ...info, ok: false, limited: Boolean(limited), attempts: 1 + retries, latency_ms: Date.now() - started, ...meta, cost_usd: cost || undefined, error });
      return null;
    } finally { release(); }
  }

  function ask(request, lastChoice) {
    let prompt;
    try { prompt = buildPrompt(request, sheets.get(request.person.id), { baseline, places, lastChoice }); }
    catch (e) { onCall({ request, lastChoice, ok: false, error: e.message }); return Promise.resolve(null); }
    return attempt(prompt, (output) => readAnswer(output, request), { request, lastChoice });
  }

  function poll(id, question, options) {
    let prompt;
    try { prompt = askPrompt(sheets.get(id), question, options); } catch (e) { onCall({ id, ok: false, error: e.message }); return Promise.resolve(null); }
    return attempt(prompt, (output) => readAsk(output, prompt.options), { id, question });
  }

  const ids = personIds || [...sheets.keys()];
  let memory = createRunMemory({ personIds: ids });
  async function decide(request) {
    const lastChoice = memory.lastChoice(request);
    const answer = await ask(request, lastChoice);
    memory.record(request, answer);
    return answer;
  }
  decide.ask = ask;
  decide.poll = poll;
  decide.reset = () => { memory = createRunMemory({ personIds: ids }); };
  decide.setConcurrency = (n) => { cap = n; };
  decide.state = () => ({ down, limited });
  decide.call = (prompt, opts) => (down || limited ? Promise.reject(new Error(down || limited)) : call(prompt, opts));
  return decide;
}

module.exports = { AGENT, ORCHESTRATOR, ROUTER, PROVIDER, ROUND, INSTRUCTIONS, ADDENDUM, PRICE, LABEL, STANCES, AFFECTED, POLL_LABEL, CLI_FLAGS, AGENTS_FILE, sha256,
  loadAgents, placesFrom, situation, schemaFor, buildPrompt, readAnswer, normalizeOptions, askPrompt, readAsk, consistency, FIVE_LABELS, createRunMemory, readDotEnv, cliEnv, cliArgs,
  cliBackend, apiBackend, makeBackend, createClaudeDecisionProvider };
