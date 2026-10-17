#!/usr/bin/env node
/* The persona console server (Node, no dependencies). Usage, from the repository root:
 *   node persona-swarm/runtime/server.js [--lan | --host <address>] [--port 4174] [--backend local|token|api|remote|replay]
 *        [--concurrency 32] [--env-file path] [--require-key]        (or: npm --prefix persona-swarm/runtime start)
 * Serves /console and streams (SSE) POST /ask (a poll of up to 100 agents), POST /run/:policy (a live world run of the 40
 * deciders, fare or bloor) and POST /chat (the orchestrator picks one of those and summarises). GET /replay/latest serves
 * the newest save. Every live poll and run is saved to data/city/live/. With no usable backend, or at the plan's limit,
 * the console offers the labelled replay. Beyond loopback every API call needs CONSOLE_ACCESS_KEY as a bearer token. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const cd = require('./claude-decision');
const orch = require('./orchestrator');
const cfg = require('./config');
const { runWorld } = require('./run');
const { evaluateRun } = require('./evaluate');

const REPO = fs.realpathSync(path.resolve(__dirname, '..', '..'));
// The site, served same-origin. Allowlist only; no dotfiles (.env), no traversal, nothing else in the repo.
const STATIC_PREFIXES = ['/experience/', '/experiment/', '/world/', '/demo-ui/', '/data/', '/persona-swarm/data/record/', '/persona-swarm/data/reactions/'];
const STATIC_FILES = ['/persona-swarm/runtime/agents-client.js', '/bloor-bike-demo.md'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

/* The file an allowlisted URL path names, or null. Local config files (*.local.*) are served on loopback only. */
function staticFile(pathname, loopback = true) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes('\0') || p.includes('\\') || p.split('/').some((s) => s === '..' || s.startsWith('.'))) return null;
  if (p.endsWith('/')) p += 'index.html';
  if (!STATIC_FILES.includes(p) && !STATIC_PREFIXES.some((prefix) => p.startsWith(prefix))) return null;
  if (!loopback && path.basename(p).includes('.local.')) return null;
  let real;
  try { real = fs.realpathSync(path.join(REPO, p)); } catch { return null; }
  return real.startsWith(REPO + path.sep) && fs.statSync(real).isFile() ? real : null;
}

const SCENARIO = { fare: 'fare', bloor: 'bike' };
const POLICY_TEXT = { fare: 'Adult TTC fare +$0.50, Fair Pass unchanged', bloor: 'Bloor St W cycle track loses its protection' };
const RUN_LABEL = 'live world run: synthetic agents in a schematic world, not a forecast';
const clock = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

function summaries(bundles) {
  return bundles.map((a) => ({
    id: a.id, name: a.name, role: a.role, mode: a.mode, neighbourhood: a.neighbourhood, fare_category: a.fare_category, has_car: a.has_car,
    has_bike: a.has_bike, decider: a.decider, shop: a.shop?.kind || null, match_keys: { age_band: a.match_keys.age_band, sex: a.match_keys.sex, income_band: a.match_keys.income_band },
    situation: a.situation, relative_profile: (a.persona_sheet.split('Relative profile')[1] || '').split('\n').filter((l) => l.startsWith('- ')),
  }));
}

/* The distribution so far. n is how many were asked; a numeric scale also gets its mean. */
function aggregatePoll(answers, options, n = Object.keys(answers).length) {
  const got = Object.values(answers).filter(Boolean);
  const count = (key, values) => Object.fromEntries(values.map((v) => { const k = got.filter((a) => a[key] === v).length; return [v, { count: k, share: pct(k, got.length) }]; }));
  const scale = options && typeof options[0] === 'number';
  return { asked: n, answered: got.length, no_answer: Object.keys(answers).length - got.length,
    ...(options ? { choices: count('choice', options) } : { stance: count('stance', cd.STANCES), affected: count('affected', cd.AFFECTED) }),
    ...(scale ? { mean: got.length ? Math.round((got.reduce((s, a) => s + a.choice, 0) / got.length) * 100) / 100 : null } : {}) };
}

function createServer(config, deps = {}) {
  const env = deps.env || (() => cd.readDotEnv(config.envFile || cfg.envFile()));
  const liveDir = deps.liveDir || cfg.LIVE_DIR;
  const agents = deps.agents || cd.loadAgents();
  const roster = summaries(agents.bundles);
  const people = agents.bundles.map(({ persona_sheet, ...a }) => a);
  const byId = new Map(people.map((p) => [p.id, p]));
  // What a card shows about an agent, sent with each answer.
  const agentCard = (id) => {
    const p = byId.get(id);
    return { id, name: p.name, role: p.role, mode: p.mode, neighbourhood: p.neighbourhood, fare_category: p.fare_category, has_car: p.has_car, has_bike: p.has_bike,
      age_band: p.match_keys.age_band, sex: p.match_keys.sex, income_band: p.match_keys.income_band, decider: p.decider, shop: p.shop?.kind || null };
  };
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  let call = deps.call;
  if (!call && ['local', 'token', 'api'].includes(config.backend)) {
    const e = env();
    call = cd.makeBackend(config.backend, { token: e.CLAUDE_CODE_OAUTH_TOKEN, apiKey: e.ANTHROPIC_API_KEY });
  }
  const requireKey = deps.requireKey ?? (!cfg.isLoopback(config.host) || Boolean(config.requireKey));
  // Same server: the exact origin, or (on a loopback server) localhost / 127.0.0.1 / [::1] on the same port.
  const bare = (h) => h.replace(/^\[|\]$/g, '');
  function sameServer(origin, hostHeader) {
    try {
      const o = new URL(origin), h = new URL(`http://${hostHeader}`);
      return o.origin === h.origin || (cfg.isLoopback(config.host) && cfg.isLoopback(bare(o.hostname)) && cfg.isLoopback(bare(h.hostname)) && o.port === h.port);
    } catch { return false; }
  }
  const corsOrigins = config.corsOrigins || [];
  const state = { limited: null, usage: {} };

  /* ---------- saves and replay ---------- */
  function save(record, file) {
    fs.mkdirSync(liveDir, { recursive: true });
    const name = file || `${record.saved_at.replace(/[:.]/g, '-')}-${record.kind}${record.policy ? `-${record.policy}` : ''}.json`;
    fs.writeFileSync(path.join(liveDir, name), `${JSON.stringify(record)}\n`);
    return name;
  }
  function latestSave(kind, policy) {
    const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => path.join(dir, f)) : []);
    const match = (f) => (!kind || f.includes(`-${kind}`)) && (!policy || f.endsWith(`-${policy}.json`));
    const files = [...list(liveDir), ...list(path.join(liveDir, 'samples'))];
    const file = files.find(match) || files.find((f) => !kind || f.includes(`-${kind}`)) || files[0];
    if (!file) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { label: `replay of a live run at ${clock(record.saved_at)}`, file: path.relative(cfg.ROOT, file), sample: file.includes(`${path.sep}samples${path.sep}`), record };
  }

  /* ---------- live poll and live world run ---------- */
  async function livePoll(send, { question, options, ids, concurrency, filter = null, via = 'ask' }) {
    const opts = cd.normalizeOptions(options);                // integers (a 1-5 scale) stay numbers
    const started = Date.now();
    const rows = [];
    const provider = cd.createClaudeDecisionProvider({ sheets: agents.sheets, call, concurrency, warn: () => {}, onCall: (c) => rows.push(c) });
    send('start', { kind: 'poll', question, options: opts, ids, label: cd.POLL_LABEL, concurrency, backend: config.backend });
    const answers = {};
    await Promise.all(ids.map(async (id) => {
      const a = await provider.poll(id, question, opts);
      answers[id] = a;
      send('answer', { id, agent: agentCard(id), answer: a, elapsed_s: (Date.now() - started) / 1000, tally: aggregatePoll(answers, opts, ids.length) });
      if (!a && provider.state().limited && !state.limited) { state.limited = provider.state().limited; send('limit', { message: 'agent backend limit reached', replay: Boolean(latestSave()) }); }
    }));
    const live = rows.filter((r) => !r.skipped);
    const lat = live.map((r) => r.latency_ms).filter(Number.isFinite).sort((a, b) => a - b);
    const record = { kind: 'poll', saved_at: new Date().toISOString(), backend: config.backend, via, question, options: opts, filter, ids, label: cd.POLL_LABEL,
      model: cd.AGENT, answers, aggregate: aggregatePoll(answers, opts),
      timings: { wall_s: (Date.now() - started) / 1000, concurrency, calls: live.length, failed: live.filter((r) => !r.ok).length,
        p50_ms: lat[Math.floor((lat.length - 1) / 2)] ?? null, p95_ms: lat[Math.ceil(lat.length * 0.95) - 1] ?? null },
      cost_usd: Math.round(live.reduce((s, r) => s + (r.cost_usd || 0), 0) * 10000) / 10000 };
    record.file = save(record);
    send('done', { aggregate: record.aggregate, timings: record.timings, cost_usd: record.cost_usd, file: record.file });
    return record;
  }

  async function liveRun(send, policy, { concurrency, via = 'run' }) {
    const ids = people.filter((p) => p.decider).map((p) => p.id);
    send('start', { kind: 'run', policy, policy_text: POLICY_TEXT[policy], deciders: ids, label: RUN_LABEL, concurrency, backend: config.backend });
    const { result, meta, calls } = await runWorld(SCENARIO[policy], { call, concurrency, onCall: (row) => send('decision', row),
      onWeek: (week, m) => send('tick', { week, baseline: m.baseline, intervention: m.intervention }) });
    if (meta.limited && !state.limited) { state.limited = 'agent backend limit reached'; send('limit', { message: state.limited, replay: Boolean(latestSave('run', policy)) }); }
    const evaluation = await evaluateRun(result, { ...meta, call_log: calls });
    const record = { kind: 'run', policy, policy_text: POLICY_TEXT[policy], saved_at: new Date().toISOString(), backend: config.backend, via, label: RUN_LABEL, meta,
      totals: { baseline: result.runs.baseline.metrics.totals, intervention: result.runs.intervention.metrics.totals },
      checks: { feasible_action_rate: evaluation.feasible_action_rate, fallback_rate: evaluation.fallback_rate, changed_decisions: evaluation.changed_decisions,
        consistency: { same_choice_set: evaluation.consistency.same_choice_set, choice_set_changed: evaluation.consistency.choice_set_changed },
        fare_elasticity: evaluation.fare_elasticity, bloor_cyclists: evaluation.bloor_cyclists, variety: evaluation.variety, calls: evaluation.calls },
      sample_changes: evaluation.sample_changes, decisions: Object.fromEntries(['baseline', 'intervention'].map((arm) => [arm, result.runs[arm].decisions])),
      result };
    record.file = save(record);
    send('done', { totals: record.totals, checks: record.checks, sample_changes: record.sample_changes, meta, file: record.file, result });
    return record;
  }

  /* Opus can take tens of seconds: tell the page it is still working, every 5 s. */
  async function heartbeat(send, stage, work) {
    const started = Date.now();
    send('status', { stage, message: `${stage}…`, elapsed_s: 0 });
    const timer = setInterval(() => send('status', { stage, message: `still ${stage}…`, elapsed_s: Math.round((Date.now() - started) / 1000) }), deps.heartbeatMs || 5000);
    try { return await work; } finally { clearInterval(timer); }
  }

  async function chat(send, { message, concurrency, modes }) {
    let plan;
    try { plan = await heartbeat(send, 'planning', orch.plan(message, people, call, { modes })); } catch (e) {
      if (/limit/i.test(e.message)) { state.limited = e.message; send('limit', { message: 'agent backend limit reached', replay: Boolean(latestSave()) }); return; }
      send('error', { message: `orchestrator: ${e.message}` }); return;
    }
    send('plan', plan);
    if (plan.mode === 'reply') { send('reply', { text: plan.reply }); return; }
    let record, data;
    if (plan.mode === 'poll') {
      const ids = orch.selectAgents(people, plan.filter).map((a) => a.id);
      if (!ids.length) { send('reply', { text: 'No agents match that selection.' }); return; }
      record = await livePoll(send, { question: plan.question, options: plan.options, ids, concurrency, filter: plan.filter, via: 'chat' });
      data = pollData(record);
    } else {
      record = await liveRun(send, plan.policy, { concurrency, via: 'chat' });
      data = { policy: POLICY_TEXT[plan.policy], label: RUN_LABEL, deciders: 40, totals: record.totals, changed_decisions: record.checks.changed_decisions.count,
        transitions: record.checks.changed_decisions.transitions, fare_elasticity: record.checks.fare_elasticity && { value: record.checks.fare_elasticity.agents.elasticity, verdict: record.checks.fare_elasticity.verdict, papers_range: record.checks.fare_elasticity.range },
        bloor_cyclists: record.checks.bloor_cyclists?.agents, sample_reasons: record.sample_changes };
    }
    await addSummary(send, message, record, data, { plan });
  }

  const pollData = (record) => ({ question: record.question, options: record.options, label: cd.POLL_LABEL, aggregate: record.aggregate,
    sample_reasons: record.ids.filter((id) => record.answers[id]).slice(0, 12).map((id) => ({ agent: id, role: byId.get(id).role, ...record.answers[id] })) });

  /* The orchestrator's prose from the real results, number-checked, added to the save. */
  async function addSummary(send, request, record, data, extra = {}) {
    try {
      const summary = await heartbeat(send, 'summarising', orch.summarise(request, data, call));
      send('summary', record.kind === 'poll' ? { ...summary, distribution: record.aggregate } : summary);
      Object.assign(record, { summary, request, ...extra });
      save(record, record.file);
    } catch (e) { send('error', { message: `summary: ${e.message}` }); }
  }

  /* ---------- HTTP ---------- */
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const sse = (res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    return (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e5) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
  });

  async function forward(req, res, url, body) {
    try {
      const r = await fetchImpl(`${config.remoteUrl}${url.pathname}${url.search}`, { method: req.method, body: req.method === 'POST' ? body : undefined,
        headers: { authorization: `Bearer ${env().CONSOLE_ACCESS_KEY || ''}`, 'content-type': 'application/json' } });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-cache' });
      if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
    } catch (e) {
      const local = url.pathname === '/replay/latest' ? latestSave(url.searchParams.get('kind'), url.searchParams.get('policy')) : null;
      if (local) json(res, 200, local); else json(res, 502, { error: `remote agent server unreachable: ${e.message}`, replay: Boolean(latestSave()) });
    }
  }

  function account(req, url, fp) {
    state.usage[fp] = (state.usage[fp] || 0) + 1;
    fs.mkdirSync(liveDir, { recursive: true });
    // No secrets: the key's fingerprint, the caller's address, the endpoint and the running count.
    fs.appendFileSync(path.join(liveDir, 'access.log'), `${new Date().toISOString()} key=${fp} from=${req.socket.remoteAddress} ${req.method} ${url.pathname} n=${state.usage[fp]}\n`);
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://console');
    // The main path is same-origin: this server also serves the site. A page on another allowed origin (python
    // http.server on :4173) may call in too, but such cross-origin calls always need the key.
    const origin = req.headers.origin;
    const crossOrigin = Boolean(origin) && !sameServer(origin, req.headers.host);
    if (crossOrigin && corsOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(crossOrigin && corsOrigins.includes(origin) ? 204 : 403); res.end(); return; }
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(302, { location: '/experience/' }); res.end(); return; }
    if (req.method === 'GET' && /^\/(experience|experiment|world|demo-ui|data)$/.test(url.pathname)) { res.writeHead(302, { location: `${url.pathname}/` }); res.end(); return; }
    if (req.method === 'GET' && (url.pathname === '/console' || url.pathname === '/agents-client.js')) {
      const html = url.pathname === '/console';
      res.writeHead(200, { 'content-type': html ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(fs.readFileSync(path.join(__dirname, html ? 'console.html' : 'agents-client.js')));
      return;
    }
    if (req.method === 'GET' && !url.pathname.match(/^\/(health|agents|usage|replay\/latest|saves\/.*)$/)) {
      const file = staticFile(url.pathname, cfg.isLoopback(config.host));
      if (!file) { json(res, 404, { error: 'not found' }); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (requireKey || crossOrigin) {
      const fp = cfg.checkKey(req.headers.authorization, env());
      if (!fp) { json(res, 401, { error: 'access key required', requires_key: true }); return; }
      account(req, url, fp);
    }
    let body = '';
    try { body = req.method === 'POST' ? await readBody(req) : ''; } catch (e) { json(res, 413, { error: e.message }); return; }
    const params = (() => { try { return body ? JSON.parse(body) : {}; } catch { return null; } })();
    if (params === null) { json(res, 400, { error: 'invalid JSON' }); return; }
    const concurrency = Math.min(64, Math.max(1, Number(params.concurrency) || config.concurrency));
    const remoteRoute = config.backend === 'remote' && (req.method === 'POST' || ['/health', '/replay/latest'].includes(url.pathname) || url.pathname.startsWith('/saves/'));

    if (req.method === 'GET' && url.pathname === '/agents') { json(res, 200, { agents: roster, bundle_version: agents.data.bundle_version, attribution: agents.data.attribution }); return; }
    if (req.method === 'GET' && url.pathname === '/usage') { json(res, 200, { requests_by_key: state.usage }); return; }
    if (remoteRoute) { await forward(req, res, url, body); return; }
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, backend: config.backend, agent_model: cd.AGENT, orchestrator_model: cd.ORCHESTRATOR, agents: roster.length,
        deciders: roster.filter((a) => a.decider).length, concurrency: config.concurrency, limited: Boolean(state.limited), requires_key: requireKey });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/replay/latest') {
      const r = latestSave(url.searchParams.get('kind'), url.searchParams.get('policy'));
      if (r) json(res, 200, r); else json(res, 404, { error: 'no saved run' });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/saves/')) {
      // Plain save names only, looked up in the live folder and its samples: no paths. ?part=result gives the RunResult.
      const name = url.pathname.slice('/saves/'.length);
      const file = /^[\w.-]+\.json$/.test(name) && [path.join(liveDir, name), path.join(liveDir, 'samples', name)].find((f) => fs.existsSync(f));
      if (!file) { json(res, 404, { error: 'no such save' }); return; }
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      json(res, 200, url.searchParams.get('part') === 'result' ? record.result ?? null : record);
      return;
    }
    const routes = { '/ask': 'poll', '/chat': 'chat', '/run/fare': 'run', '/run/bloor': 'run', '/run/bike': 'run' };
    if (req.method !== 'POST' || !routes[url.pathname]) { json(res, 404, { error: 'not found' }); return; }
    const policy = url.pathname.startsWith('/run/') ? url.pathname.slice(5).replace(/^bike$/, 'bloor') : null;   // bike: the fixture's name
    const send = sse(res);
    try {
      if (config.backend === 'replay' || !call || state.limited) {
        const r = latestSave(routes[url.pathname] === 'chat' ? null : routes[url.pathname], policy);
        if (state.limited) send('limit', { message: 'agent backend limit reached', replay: Boolean(r) });
        if (r) send('replay', r); else send('error', { message: 'no saved run to replay' });
      } else if (url.pathname === '/ask') {
        if (!params.question) send('error', { message: 'a question is required' });
        else {
          const typed = String(params.question);
          let question = typed, options = params.options, filter = params.filter || null;
          if (params.orchestrate) {                             // the orchestrator turns typed text into a neutral poll
            try {
              const plan = await heartbeat(send, 'planning', orch.plan(typed, people, call, { modes: ['poll'] }));
              send('plan', plan);
              question = plan.question || typed;
              if (!(Array.isArray(options) && options.length)) options = plan.options;
              if (!filter) filter = plan.filter;
            } catch (e) { send('plan', { mode: 'poll', question: typed, options: options || [], note: `Asked as typed (orchestrator unavailable: ${e.message.slice(0, 120)})`, fallback: true }); }
          }
          const ids = Array.isArray(params.ids) && params.ids.length ? params.ids.filter((id) => agents.sheets.has(id)) : orch.selectAgents(people, filter).map((a) => a.id);
          if (!ids.length) send('error', { message: 'No agents match that selection.' });
          else {
            const record = await livePoll(send, { question, options, ids, concurrency, filter });
            if (params.summarise) await addSummary(send, typed, record, pollData(record));
          }
        }
      } else if (policy) await liveRun(send, policy, { concurrency });
      else if (!params.message) send('error', { message: 'a message is required' });
      else {
        // modes limits what the orchestrator may choose, e.g. ['poll', 'reply'] so a page never starts a world run.
        const modes = Array.isArray(params.modes) && params.modes.length ? params.modes.filter((m) => ['poll', 'run', 'reply'].includes(m)) : undefined;
        if (modes && !modes.length) send('error', { message: "modes must include 'poll', 'run' or 'reply'" });
        else await chat(send, { message: String(params.message), concurrency, modes });
      }
    } catch (e) { send('error', { message: e.message }); }
    res.end();
  }

  return Object.assign(http.createServer((req, res) => {
    handler(req, res).catch((e) => { try { json(res, 500, { error: e.message }); } catch { res.end(); } });
  }), { state, latestSave, save });
}

async function main() {
  const argv = process.argv.slice(2);
  const env = cd.readDotEnv(cfg.envFile(argv));
  const config = cfg.loadConfig(argv, env);
  const check = await cfg.checkStartup(config, env);
  if (!check.ok) { process.stderr.write(`persona console: refusing to start: ${check.error}\n`); process.exitCode = 1; return; }
  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    const url = `http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${server.address().port}/console`;
    process.stdout.write(`persona console: backend ${config.backend} (${check.detail}); ${cd.loadAgents().bundles.length} agents, 40 deciders; concurrency ${config.concurrency}\n`);
    process.stdout.write(`open ${url}${cfg.isLoopback(config.host) ? '' : '  (share this URL and the access key with teammates; the key is in persona-swarm/.env)'}`
      + `${config.requireKey ? '  (access key required)' : ''}\n`);
  });
}

if (require.main === module) main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });

module.exports = { createServer, aggregatePoll, summaries, staticFile };
