/* Offline tests for the console server: startup checks per backend, exposure and access keys, key rotation and the
 * secret-free access log, replay mode, and remote-mode forwarding to a stub server. Servers bind to 127.0.0.1 only.
 * No model calls. Usage: node --test persona-swarm/runtime/test-server.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const cfg = require('./config');
const { createServer, aggregatePoll } = require('./server');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ps-console-'));
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => server.close(resolve));
async function events(res) {
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map((chunk) => ({ event: /^event: (.*)$/m.exec(chunk)[1], data: JSON.parse(/^data: (.*)$/m.exec(chunk)[1]) }));
}
const sample = { kind: 'poll', saved_at: '2026-10-17T15:04:00.000Z', question: 'q?', options: null, ids: ['a001'], answers: { a001: { stance: 'support', affected: 'a lot', reason: 'r', label: 'survey-style reaction, not a forecast' } }, aggregate: {} };

/* ---------- startup checks ---------- */

test('config: localhost by default; --lan and --host come from flags or .env', () => {
  const c = cfg.loadConfig([], {});
  assert.deepEqual([c.backend, c.host, c.port, c.concurrency], ['local', '127.0.0.1', 4174, 32]);
  const e = cfg.loadConfig(['--host', '100.64.0.7', '--port', '5000', '--backend', 'remote'], { AGENT_CONCURRENCY: '32' });
  assert.deepEqual([e.backend, e.host, e.port, e.concurrency], ['remote', '100.64.0.7', 5000, 32]);
  assert.equal(cfg.lanAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }), '192.168.1.20');
});

test('startup: exposure beyond loopback needs an access key', async () => {
  const lan = await cfg.checkStartup({ backend: 'replay', host: '192.168.1.20', lan: true, concurrency: 16 }, {}, { saves: () => true });
  assert.match(lan.error, /needs CONSOLE_ACCESS_KEY/);
  const ok = await cfg.checkStartup({ backend: 'replay', host: '192.168.1.20', lan: true, concurrency: 16 }, { CONSOLE_ACCESS_KEY: 'k' }, { saves: () => true });
  assert.ok(ok.ok);
  const nolan = await cfg.checkStartup({ backend: 'replay', host: null, lan: true, concurrency: 16 }, { CONSOLE_ACCESS_KEY: 'k' }, { saves: () => true });
  assert.match(nolan.error, /no LAN address/);
});

test('startup: local and token require an OAuth login and refuse API-key auth', async () => {
  const base = { host: '127.0.0.1', concurrency: 16 };
  const statusOf = (s) => () => s;
  assert.ok((await cfg.checkStartup({ ...base, backend: 'local' }, {}, { status: statusOf({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) })).ok);
  assert.equal((await cfg.checkStartup({ ...base, backend: 'local' }, {}, { status: statusOf({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }) })).detail, 'claude.ai, max plan');
  assert.match((await cfg.checkStartup({ ...base, backend: 'local' }, {}, { status: statusOf({ loggedIn: false }) })).error, /not logged in/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'local' }, {}, { status: statusOf({ loggedIn: true, authMethod: 'api_key' }) })).error, /never bill to the API silently/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'local' }, {}, { status: statusOf({ error: 'the claude CLI is not installed' }) })).error, /not installed/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'token' }, {}, {})).error, /needs CLAUDE_CODE_OAUTH_TOKEN/);
  let seen;
  const tok = await cfg.checkStartup({ ...base, backend: 'token' }, { CLAUDE_CODE_OAUTH_TOKEN: 'tok-test-not-real' }, { status: (mode, token) => { seen = [mode, token]; return { loggedIn: true, authMethod: 'oauth_token' }; } });
  assert.ok(tok.ok);
  assert.deepEqual(seen, ['token', 'tok-test-not-real']);
  assert.doesNotMatch(JSON.stringify(tok), /tok-test-not-real/, 'the token is never printed');
});

test('startup: api, remote and replay refuse unusable setups clearly', async () => {
  const base = { host: '127.0.0.1', concurrency: 16 };
  assert.match((await cfg.checkStartup({ ...base, backend: 'api' }, {}, {})).error, /needs ANTHROPIC_API_KEY/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'api' }, { ANTHROPIC_API_KEY: 'k' }, { sdk: () => false })).error, /npm install/);
  assert.ok((await cfg.checkStartup({ ...base, backend: 'api' }, { ANTHROPIC_API_KEY: 'k' }, { sdk: () => true })).ok);
  assert.match((await cfg.checkStartup({ ...base, backend: 'remote', remoteUrl: '' }, {}, {})).error, /needs AGENT_SERVER_URL and CONSOLE_ACCESS_KEY/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'replay' }, {}, { saves: () => false })).error, /needs a saved run/);
  assert.match((await cfg.checkStartup({ ...base, backend: 'magic' }, {}, {})).error, /must be one of/);
});

/* ---------- the server ---------- */

test('replay mode serves the latest save, labelled, and makes no model calls', async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'samples'));
  fs.writeFileSync(path.join(dir, 'samples', '2026-10-17T15-04-00-000Z-poll.json'), JSON.stringify(sample));
  const server = createServer({ backend: 'replay', host: '127.0.0.1', concurrency: 16 }, { liveDir: dir, env: () => ({}) });
  const base = await listen(server);
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.deepEqual([health.ok, health.backend, health.agents, health.deciders, health.requires_key], [false, 'replay', 100, 40, false]);
    const evs = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'anything?' }) }));
    assert.equal(evs[0].event, 'replay');
    assert.match(evs[0].data.label, /^replay of a live run at \d\d:\d\d$/);
    assert.equal(evs[0].data.sample, true);
    const latest = await (await fetch(`${base}/replay/latest`)).json();
    assert.equal(latest.record.question, 'q?');
    const page = await fetch(`${base}/console`);
    assert.match(await page.text(), /<title>Persona console<\/title>/);
  } finally { await close(server); }
});

test('beyond loopback every API call needs the current access key; rotation and a secret-free log', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'p.json'), JSON.stringify(sample));
  let key = 'key-one-not-real';
  const server = createServer({ backend: 'replay', host: '192.168.1.20', concurrency: 16 }, { liveDir: dir, env: () => ({ CONSOLE_ACCESS_KEY: key }) });
  const base = await listen(server);
  const get = (k) => fetch(`${base}/health`, { headers: k ? { authorization: `Bearer ${k}` } : {} });
  try {
    assert.equal((await get()).status, 401);
    assert.equal((await get('wrong-key')).status, 401);
    assert.equal((await get('key-one-not-real')).status, 200);
    assert.equal((await fetch(`${base}/console`)).status, 200, 'the page itself loads, then asks for the key');
    key = 'key-two-not-real';                                            // rotated in .env, no restart
    assert.equal((await get('key-one-not-real')).status, 401);
    assert.equal((await get('key-two-not-real')).status, 200);
    const log = fs.readFileSync(path.join(dir, 'access.log'), 'utf8');
    assert.match(log, new RegExp(`key=${cfg.fingerprint('key-one-not-real')} from=127\\.0\\.0\\.1 GET /health n=1`));
    assert.match(log, new RegExp(`key=${cfg.fingerprint('key-two-not-real')} .*n=1`));
    assert.doesNotMatch(log, /key-one-not-real|key-two-not-real/);
  } finally { await close(server); }
});

test('remote mode forwards /ask, /run and /chat with the access key and streams the answer back', async () => {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ backend: 'token' })); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: start\ndata: {"kind":"poll"}\n\n');
      res.end('event: done\ndata: {"ok":true}\n\n');
    });
  });
  const upstreamUrl = await listen(upstream);
  const env = { CONSOLE_ACCESS_KEY: 'shared-key-not-real', AGENT_SERVER_URL: upstreamUrl };
  const check = await cfg.checkStartup({ backend: 'remote', host: '127.0.0.1', concurrency: 16, remoteUrl: upstreamUrl }, env);
  assert.ok(check.ok, check.error);
  assert.match(check.detail, /its backend: token/);
  const server = createServer({ backend: 'remote', host: '127.0.0.1', concurrency: 16, remoteUrl: upstreamUrl }, { liveDir: tmp(), env: () => env });
  const base = await listen(server);
  try {
    const evs = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'q?' }) }));
    assert.deepEqual(evs.map((e) => e.event), ['start', 'done']);
    await events(await fetch(`${base}/run/fare`, { method: 'POST', body: '{}' }));
    await events(await fetch(`${base}/chat`, { method: 'POST', body: JSON.stringify({ message: 'hi' }) }));
    const posts = seen.filter((s) => s.method === 'POST');
    assert.deepEqual(posts.map((s) => s.url), ['/ask', '/run/fare', '/chat']);
    assert.ok(posts.every((s) => s.auth === 'Bearer shared-key-not-real'));
    assert.equal(JSON.parse(posts[0].body).question, 'q?');
    const agents = await (await fetch(`${base}/agents`)).json();
    assert.equal(agents.agents.length, 100, 'the roster is served locally');
    assert.ok(agents.agents.every((a) => a.persona_sheet === undefined));
  } finally { await close(server); await close(upstream); }
});

test('remote mode: the agent server stopping mid-poll ends the stream with an error, and a refused key is named', async () => {
  let refuse = false;
  const upstream = http.createServer((req, res) => {
    if (refuse) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"access key required","requires_key":true}'); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('event: start\ndata: {"kind":"poll"}\n\n');
    setTimeout(() => res.destroy(), 20);                                   // the agent server dies mid-poll
  });
  const upstreamUrl = await listen(upstream);
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '2026-10-17T15-04-00-000Z-poll.json'), JSON.stringify(sample));
  const server = createServer({ backend: 'remote', host: '127.0.0.1', concurrency: 16, remoteUrl: upstreamUrl }, { liveDir: dir, env: () => ({ CONSOLE_ACCESS_KEY: 'k' }) });
  const base = await listen(server);
  try {
    const evs = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'q?' }) }));
    assert.deepEqual(evs.map((e) => e.event), ['start', 'error']);
    assert.match(evs[1].data.message, /agent server stopped responding/);
    assert.equal(evs[1].data.replay, true);
    refuse = true;
    const r = await fetch(`${base}/health`);                               // this server is still up
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /refused this server's access key: check CONSOLE_ACCESS_KEY/);
  } finally { await close(server); upstream.closeAllConnections(); await close(upstream); }
});

test('a plan limit from the CLI: one call, a limit event, then replays with no further calls', async () => {
  const { EventEmitter } = require('node:events');
  const cd = require('./claude-decision');
  let spawns = 0;
  const child = () => {
    spawns++;
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    setImmediate(() => { c.stdout.emit('data', JSON.stringify({ is_error: true, result: 'Claude AI usage limit reached|1792300000' })); c.emit('close', 0); });
    return c;
  };
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '2026-10-17T15-04-00-000Z-poll.json'), JSON.stringify(sample));
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 1 }, { liveDir: dir, env: () => ({}), call: cd.cliBackend({ spawnImpl: child }) });
  const base = await listen(server);
  try {
    const first = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'q?', options: [1, 2, 3, 4, 5], ids: ['a001', 'a002', 'a003'], summarise: false }) }));
    assert.ok(first.some((e) => e.event === 'limit' && e.data.message === 'agent backend limit reached'));
    assert.equal(spawns, 1, 'no retry and no further calls after the limit');
    const next = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'again?' }) }));
    assert.deepEqual(next.map((e) => e.event), ['limit', 'replay']);
    assert.equal(spawns, 1);
    assert.equal((await (await fetch(`${base}/health`)).json()).ok, false, 'the site shows its offline state');
  } finally { await close(server); }
});

test('remote mode with the remote down: a 502 for live calls, a local save for replay', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '2026-10-17T15-04-00-000Z-poll.json'), JSON.stringify(sample));
  const server = createServer({ backend: 'remote', host: '127.0.0.1', concurrency: 16, remoteUrl: 'http://127.0.0.1:9' }, { liveDir: dir, env: () => ({ CONSOLE_ACCESS_KEY: 'k' }) });
  const base = await listen(server);
  try {
    const r = await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'q?' }) });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).replay, true);
    const latest = await (await fetch(`${base}/replay/latest`)).json();
    assert.match(latest.label, /^replay of a live run at/);
  } finally { await close(server); }
});

test('a live poll streams every answer, aggregates, and auto-saves', async () => {
  const dir = tmp();
  const call = async () => ({ output: { stance: 'support', affected: 'a little', reason: 'fake' }, meta: { cost_usd: 0.001 } });
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 16 }, { liveDir: dir, env: () => ({}), call });
  const base = await listen(server);
  try {
    const evs = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'Raise the fare?', filter: { roles: ['cyclist'] } }) }));
    const answers = evs.filter((e) => e.event === 'answer');
    const start = evs.find((e) => e.event === 'start').data;
    assert.equal(answers.length, start.ids.length);
    assert.equal(start.label, 'survey-style reaction, not a forecast');
    const done = evs.at(-1);
    assert.equal(done.event, 'done');
    assert.equal(done.data.aggregate.stance.support.count, start.ids.length);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, done.data.file), 'utf8'));
    assert.equal(saved.kind, 'poll');
    assert.equal(Object.keys(saved.answers).length, start.ids.length);
  } finally { await close(server); }
});

test('agents-client.js streams a poll; the experience site may call cross-origin, only with the key', async () => {
  const client = require('./agents-client');
  const call = async () => ({ output: { choice: 'Yes', reason: 'fake' }, meta: {} });
  const config = { backend: 'local', host: '127.0.0.1', concurrency: 32, corsOrigins: ['http://127.0.0.1:4173'] };
  const server = createServer(config, { liveDir: tmp(), env: () => ({ CONSOLE_ACCESS_KEY: 'site-key-not-real' }), call });
  const base = await listen(server);
  try {
    const pre = await fetch(`${base}/ask`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:4173' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173');
    assert.equal((await fetch(`${base}/ask`, { method: 'OPTIONS', headers: { origin: 'http://evil.example' } })).status, 403);
    const noKey = await fetch(`${base}/health`, { headers: { origin: 'http://127.0.0.1:4173' } });
    assert.equal(noKey.status, 401, 'cross-origin calls need the key even on loopback');
    assert.equal((await fetch(`${base}/health`)).status, 200, 'same-machine, same-origin calls on loopback do not');
    client.configure({ url: base });                                     // the ready-made client: a URL, never a key
    assert.deepEqual(client.config(), { url: base, key: '' });
    const answers = [];
    const done = await client.askAgents('Better buses or lower fares?', { options: ['Yes', 'No'], ids: ['a001', 'a002', 'a003'], summarise: false, onAnswer: (a) => answers.push(a) });
    assert.deepEqual(answers.map((a) => a.answer.choice), ['Yes', 'Yes', 'Yes']);
    assert.deepEqual(answers.map((a) => a.agent.id).sort(), ['a001', 'a002', 'a003']);
    assert.ok(answers.every((a) => a.agent.name && a.agent.role));
    assert.equal(done.aggregate.choices.Yes.count, 3);
    assert.deepEqual([(await client.health()).ok, (await client.health()).agents], [true, 100]);
    const node = client.create({ serverUrl: base, accessKey: 'site-key-not-real' });           // a Node caller may hold a key
    assert.equal((await node.health()).backend, 'local');
    const js = await fetch(`${base}/agents-client.js`);
    assert.match(js.headers.get('content-type'), /javascript/);
  } finally { await close(server); }
});

test('runPolicy resolves the saved experiment.v1 RunResult; bike is an alias of bloor; saves take plain names only', async () => {
  const client = require('./agents-client');
  const dir = tmp();
  const result = { schema_version: 'experiment.v1', study_id: 'bloor-bike-removal-experiment-v1' };
  fs.writeFileSync(path.join(dir, '2026-10-17T15-32-10-313Z-run-bloor.json'), JSON.stringify({ kind: 'run', policy: 'bloor', saved_at: '2026-10-17T15:32:10.313Z', result }));
  const server = createServer({ backend: 'replay', host: '127.0.0.1', concurrency: 32 }, { liveDir: dir, env: () => ({}) });
  const base = await listen(server);
  try {
    const site = client.create({ serverUrl: base });
    assert.deepEqual(await site.runPolicy('bike'), result);
    assert.deepEqual(await (await fetch(`${base}/saves/2026-10-17T15-32-10-313Z-run-bloor.json?part=result`)).json(), result);
    assert.equal((await fetch(`${base}/saves/..%2F..%2Fagents.json`)).status, 404);
    assert.equal((await fetch(`${base}/saves/nope.json`)).status, 404);
  } finally { await close(server); }
});

test('a live /run streams weeks and saves a RunResult the client can fetch', async () => {
  const client = require('./agents-client');
  const dir = tmp();
  const call = async ({ schema }) => ({ output: { action: schema.properties.action.enum[0], reason: 'fake' }, meta: {} });
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 32 }, { liveDir: dir, env: () => ({}), call });
  const base = await listen(server);
  try {
    const weeks = [];
    const result = await client.create({ serverUrl: base }).runPolicy('fare', { onTick: (t) => weeks.push(t.week) });
    assert.deepEqual(weeks, [1, 2, 3, 4]);
    assert.equal(result.schema_version, 'experiment.v1');
    assert.equal(result.study_id, 'ttc-fare-experiment-v1');
    assert.equal(result.personas.length, 40);
  } finally { await close(server); }
});

test('--require-key enforces the key on loopback; config reads --env-file', () => {
  const dir = tmp();
  const file = path.join(dir, 'teammate.env');
  fs.writeFileSync(file, 'AGENT_BACKEND=remote\nAGENT_SERVER_URL=http://127.0.0.1:4174/\nCONSOLE_ACCESS_KEY=k\n');
  const c = cfg.loadConfig(['--env-file', file, '--port', '4176']);
  assert.deepEqual([c.backend, c.remoteUrl, c.port, c.envFile, c.requireKey, c.concurrency], ['remote', 'http://127.0.0.1:4174', 4176, file, false, 32]);
  assert.ok(cfg.loadConfig(['--require-key'], {}).requireKey);
});

const rawGet = (base, rawPath) => new Promise((resolve, reject) => {     // sends the path as written, unnormalised
  const u = new URL(base);
  http.get({ host: u.hostname, port: u.port, path: rawPath }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
});

test('the server serves the site from an allowlist only: no traversal, no dotfiles, no Twin data', async () => {
  const server = createServer({ backend: 'replay', host: '127.0.0.1', concurrency: 32 }, { liveDir: tmp(), env: () => ({}) });
  const base = await listen(server);
  try {
    const root = await fetch(`${base}/`, { redirect: 'manual' });
    assert.deepEqual([root.status, root.headers.get('location')], [302, '/experience/']);
    const page = await fetch(`${base}/experience/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    for (const ok of ['/experiment/runner.js', '/demo-ui/sim.js', '/data/world/bloor_spadina_bathurst.json', '/persona-swarm/runtime/agents-client.js',
      '/persona-swarm/data/record/final.json', '/world/sandbox.js']) assert.equal((await fetch(base + ok)).status, 200, ok);
    for (const bad of ['/persona-swarm/.env', '/persona-swarm/data/twin/respondents.jsonl', '/persona-swarm/runtime/server.js', '/persona-swarm/data/city/agents.json',
      '/experience/.gitignore', '/.git/config', '/package.json', '/persona-swarm/autoresearch/instructions.md']) assert.equal((await fetch(base + bad)).status, 404, bad);
    for (const raw of ['/experience/../persona-swarm/.env', '/experience/%2e%2e/persona-swarm/.env', '/experience/..%2fpersona-swarm%2f.env', '/data/../../etc/passwd',
      '/experience/%00index.html']) assert.equal(await rawGet(base, raw), 404, raw);
  } finally { await close(server); }
});

test('local config files are served on loopback only', () => {
  const { staticFile } = require('./server');
  const name = 'config.test.local.json';
  const file = path.join(__dirname, '..', 'data', 'record', name);
  fs.writeFileSync(file, '{}\n');
  try {
    assert.ok(staticFile(`/persona-swarm/data/record/${name}`, true));
    assert.equal(staticFile(`/persona-swarm/data/record/${name}`, false), null);
  } finally { fs.unlinkSync(file); }
});

test('an orchestrated poll: plan, answers with the agent\'s card, done, verified summary', async () => {
  const call = async ({ schema }) => {
    const p = schema.properties;
    if (p.mode) return { output: { mode: 'poll', question: 'Should the adult TTC fare rise by 50 cents?', options: [], policy: '', reply: '', note: 'Asking everyone.',
      filter: { roles: ['transit_rider'], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } }, meta: {} };
    if (p.summary) return { output: { summary: 'Of 16 agents, 16 answered.' }, meta: {} };
    return { output: { stance: 'oppose', affected: 'a little', reason: 'fake' }, meta: {} };
  };
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 32 }, { liveDir: tmp(), env: () => ({}), call });
  const base = await listen(server);
  try {
    const client = require('./agents-client').create({ serverUrl: base });
    const seen = { plan: null, answers: [], summary: null };
    const done = await client.askAgents('What if fares went up?', { onPlan: (p) => { seen.plan = p; }, onAnswer: (a) => seen.answers.push(a), onSummary: (s) => { seen.summary = s; } });
    assert.equal(seen.plan.question, 'Should the adult TTC fare rise by 50 cents?');
    assert.equal(seen.answers.length, 16);
    const a = seen.answers[0];
    assert.deepEqual(Object.keys(a).sort(), ['agent', 'answer', 'elapsed_s', 'id', 'tally']);
    for (const k of ['id', 'name', 'role', 'fare_category', 'has_car', 'has_bike', 'age_band', 'income_band']) assert.ok(k in a.agent, k);
    assert.equal(a.agent.role, 'transit_rider');
    assert.deepEqual(a.answer, { stance: 'oppose', affected: 'a little', reason: 'fake', label: 'survey-style reaction, not a forecast', consistency: 'ok' });
    assert.equal(done.aggregate.answered, 16);
    assert.deepEqual(seen.summary, { summary: 'Of 16 agents, 16 answered.', numbers_verified: true, unverified: [], distribution: done.aggregate });
  } finally { await close(server); }
});

test('same-origin calls need no key locally, including localhost and 127.0.0.1 on the same port', async () => {
  const server = createServer({ backend: 'replay', host: '127.0.0.1', concurrency: 32, corsOrigins: ['http://127.0.0.1:4173'] }, { liveDir: tmp(), env: () => ({ CONSOLE_ACCESS_KEY: 'k-not-real' }) });
  const base = await listen(server);
  const port = new URL(base).port;
  try {
    assert.equal((await fetch(`${base}/health`, { headers: { origin: `http://127.0.0.1:${port}` } })).status, 200);
    assert.equal((await fetch(`${base}/health`, { headers: { origin: `http://localhost:${port}` } })).status, 200);
    assert.equal((await fetch(`${base}/health`, { headers: { origin: 'http://localhost:9999' } })).status, 401, 'another port is another site');
  } finally { await close(server); }
});

test('a slow plan streams "still planning…" heartbeats before the poll', async () => {
  const call = async ({ schema }) => {
    const p = schema.properties;
    if (p.mode) {
      await new Promise((r) => setTimeout(r, 80));
      return { output: { mode: 'poll', question: 'Q?', options: [], policy: '', reply: '', note: 'n',
        filter: { roles: ['cyclist'], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } }, meta: {} };
    }
    return { output: { stance: 'neutral', affected: 'a little', reason: 'fake' }, meta: {} };
  };
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 32 }, { liveDir: tmp(), env: () => ({}), call, heartbeatMs: 20 });
  const base = await listen(server);
  try {
    const evs = await events(await fetch(`${base}/ask`, { method: 'POST', body: JSON.stringify({ question: 'congestion charge?', orchestrate: true }) }));
    const names = evs.map((e) => e.event);
    const statuses = evs.filter((e) => e.event === 'status').map((e) => e.data);
    assert.equal(statuses[0].message, 'planning…');
    assert.ok(statuses.some((s) => s.message === 'still planning…'), 'a heartbeat while Opus plans');
    assert.ok(names.indexOf('plan') > names.indexOf('status') && names.indexOf('start') > names.indexOf('plan'));
  } finally { await close(server); }
});

test('a poll with no filter and no orchestrator asks all 100; chat modes keep the orchestrator off world runs', async () => {
  const seenModes = [];
  const call = async ({ schema }) => {
    const p = schema.properties;
    if (p.mode) { seenModes.push(p.mode.enum); return { output: { mode: 'reply', question: '', options: [], policy: '', reply: 'Runs are not enabled here.', note: 'n',
      filter: { roles: [], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } }, meta: {} }; }
    if (p.summary) return { output: { summary: 'ok' }, meta: {} };
    return { output: { choice: 3, reason: 'fake' }, meta: {} };
  };
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 64 }, { liveDir: tmp(), env: () => ({}), call });
  const base = await listen(server);
  try {
    const client = require('./agents-client').create({ serverUrl: base });
    const done = await client.askAgents('Congestion charge?', { options: [1, 2, 3, 4, 5], orchestrate: false, summarise: false });
    assert.equal(done.aggregate.asked, 100);
    const events_ = [];
    await client.chat('run the Bloor change', { modes: ['poll', 'reply'], onEvent: (e) => events_.push(e) });
    assert.deepEqual(seenModes.at(-1), ['poll', 'reply'], 'the orchestrator cannot choose a run');
    assert.ok(!events_.includes('decision') && events_.includes('reply'));
    const bad = await events(await fetch(`${base}/chat`, { method: 'POST', body: JSON.stringify({ message: 'hi', modes: ['teleport'] }) }));
    assert.equal(bad[0].event, 'error');
  } finally { await close(server); }
});

test('a poll-only chat drafts one policy proposal that all 100 agents rate on the forced 1-5 options', async () => {
  const proposal = 'From 1 May 2027, drivers pay $15 to enter downtown Toronto south of Bloor St on weekdays from 7 am to 7 pm.';
  let planPrompt;
  const questions = new Set();
  const call = async ({ schema, user }) => {
    const p = schema.properties;
    if (p.mode) {
      planPrompt = { user, schema };
      return { output: { proposal, mode: 'poll', question: 'ignored', options: ['Yes', 'No'], policy: '', reply: '', note: 'Drafting a policy.',
        filter: { roles: ['cyclist'], age_bands: [], income_bands: [], sex: [], neighbourhoods: [], fare_category: '', has_car: '', has_bike: '' } }, meta: {} };
    }
    if (p.summary) return { output: { summary: 'ok' }, meta: {} };
    questions.add(user.split('\n')[0]);
    return { output: { choice: 2, reason: 'fake' }, meta: {} };
  };
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 64 }, { liveDir: tmp(), env: () => ({}), call });
  const base = await listen(server);
  try {
    const client = require('./agents-client').create({ serverUrl: base });
    let plan, start;
    const answers = [];
    const done = await client.chat('congestion charge', { modes: ['poll'], options: [1, 2, 3, 4, 5],
      onPlan: (p) => { plan = p; }, onStart: (s) => { start = s; }, onAnswer: (a) => answers.push(a) });
    assert.deepEqual(planPrompt.schema.properties.mode.enum, ['poll']);
    assert.ok(planPrompt.schema.required.includes('proposal'));
    assert.match(planPrompt.user, /never its expected effects/);
    assert.equal(plan.policy, proposal, 'the drafted proposal is plan.policy');
    assert.deepEqual(plan.options, [1, 2, 3, 4, 5], 'forced options override the orchestrator\'s');
    assert.equal(plan.filter, null);
    assert.equal(plan.note, 'I drafted one policy proposal; all 100 agents will rate it.');
    assert.equal(start.ids.length, 100, 'all 100 are asked');
    assert.deepEqual(start.options, [1, 2, 3, 4, 5]);
    assert.deepEqual([...questions], [`Proposed policy: ${proposal} Where do you stand on it?`]);
    assert.ok(answers.every((a) => a.answer.choice === 2));
    assert.equal(done.aggregate.asked, 100);
  } finally { await close(server); }
});

test('a reason that contradicts its rating is flagged "check"; the choice never changes', () => {
  const cd = require('./claude-decision');
  const five = [1, 2, 3, 4, 5];
  const read = (choice, reason) => cd.readAsk({ choice, reason }, five);
  // The real case: a driver praised the lane removal but chose 2.
  const driver = read(2, 'Removing the lane is a welcome change that frees up room for my car and helps traffic.');
  assert.deepEqual([driver.choice, driver.consistency], [2, 'check']);
  assert.equal(read(4, 'Removing the lane is a welcome change that frees up room for my car.').consistency, 'ok');
  assert.equal(read(2, "I don't support this; it would hurt the cyclists I ride with.").consistency, 'ok', 'negation flips the cue');
  assert.equal(read(5, 'This is unfair and will hurt local shops.').consistency, 'check');
  assert.equal(read(5, "It won't hurt me and it makes sense.").consistency, 'ok');
  assert.equal(read(3, 'It helps some people and hurts others.').consistency, 'ok', 'neutral is never flagged');
  assert.equal(read(1, 'I drive every day.').consistency, 'ok', 'no cues, no flag');
  assert.equal(read(2, 'It would help drivers but hurt the shops I rely on.').consistency, 'ok', 'mixed cues are not a clear contradiction');
  assert.equal(cd.readAsk({ stance: 'strongly oppose', affected: 'a lot', reason: 'Great idea, finally.' }, null).consistency, 'check');
  assert.equal(cd.readAsk({ choice: 'Yes', reason: 'Great idea.' }, ['Yes', 'No']).consistency, undefined, 'free-text options carry no direction');
  const agg = aggregatePoll({ a: driver, b: read(4, 'helps') }, five, 2);
  assert.equal(agg.to_check, 1);
});

test('the client defaults to same-origin', () => {
  const client = require('./agents-client');
  assert.equal(client.create({}).config().url, '');
  assert.equal(client.create({ serverUrl: 'http://127.0.0.1:4174/' }).config().url, 'http://127.0.0.1:4174');
});

test('poll aggregation counts choices or stances', () => {
  const a = aggregatePoll({ a: { choice: 'x' }, b: { choice: 'y' }, c: null }, ['x', 'y']);
  assert.deepEqual(a, { asked: 3, answered: 2, no_answer: 1, choices: { x: { count: 1, share: '50%' }, y: { count: 1, share: '50%' } } });
  const s = aggregatePoll({ a: { choice: 4 }, b: { choice: 5 } }, [1, 2, 3, 4, 5], 100);
  assert.deepEqual([s.asked, s.answered, s.choices[4].count, s.choices[5].count, s.choices[1].count, s.mean], [100, 2, 1, 1, 0, 4.5]);
});

test('a 1-5 poll: numeric choices, a running tally on every answer, the distribution with the summary', async () => {
  const cd = require('./claude-decision');
  const p = cd.askPrompt(cd.loadAgents().sheets.get('a001'), 'Congestion charge?', [1, 2, 3, 4, 5]);
  assert.deepEqual(p.schema.properties.choice, { type: 'integer', enum: [1, 2, 3, 4, 5] });
  assert.match(p.user, /Rate this change:\n1 = strongly oppose this change\n2 = oppose\n3 = neutral \/ mixed\n4 = support\n5 = strongly support this change\n/);
  assert.deepEqual(cd.readAsk({ choice: 4, reason: 'r' }, [1, 2, 3, 4, 5]).choice, 4);
  assert.equal(cd.readAsk({ choice: '4', reason: 'r' }, [1, 2, 3, 4, 5]).choice, 4, 'a numeric string is read as its number');
  assert.equal(cd.readAsk({ choice: 6, reason: 'r' }, [1, 2, 3, 4, 5]), null);
  assert.deepEqual(cd.normalizeOptions(['1', 2]), ['1', '2'], 'mixed options are text');

  const call = async ({ schema, system }) => {
    if (schema.properties.summary) return { output: { summary: 'Of 16 agents, 16 answered.' }, meta: {} };
    if (schema.properties.mode) throw new Error('not used: options are given');
    return { output: { choice: system[2].length % 2 ? 2 : 4, reason: 'fake' }, meta: {} };
  };
  const server = createServer({ backend: 'local', host: '127.0.0.1', concurrency: 32 }, { liveDir: tmp(), env: () => ({}), call });
  const base = await listen(server);
  try {
    const client = require('./agents-client').create({ serverUrl: base });
    const answers = [];
    let summary;
    const done = await client.askAgents('Congestion charge downtown?', { options: [1, 2, 3, 4, 5], filter: { roles: ['transit_rider'] }, orchestrate: false,
      onAnswer: (a) => answers.push(a), onSummary: (s) => { summary = s; } });
    assert.equal(answers.length, 16);
    assert.ok(answers.every((a) => Number.isInteger(a.answer.choice) && [2, 4].includes(a.answer.choice)));
    assert.deepEqual(answers.map((a) => a.tally.answered), Array.from({ length: 16 }, (_, i) => i + 1), 'the tally runs with each answer');
    assert.ok(answers.every((a) => a.tally.asked === 16));
    const last = answers.at(-1).tally;
    assert.equal(last.choices[2].count + last.choices[4].count, 16);
    assert.deepEqual(done.aggregate, last);
    assert.equal(typeof done.aggregate.mean, 'number');
    assert.deepEqual(summary.distribution, done.aggregate);
    assert.equal(summary.numbers_verified, true);
  } finally { await close(server); }
});
