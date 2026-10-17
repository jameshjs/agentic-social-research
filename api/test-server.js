/* node --test api/test-server.js — offline: no API key, ephemeral port. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { createServer, resolveStatic } = require('./server');
const { PREPARED_PROMPTS } = require('../experiment/scenario-compiler');

function listen(options = {}) {
  const server = createServer({ env: {}, log: () => {}, ...options });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* Raw request: the path is sent exactly as given (no URL normalisation). */
function request(server, method, rawPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path: rawPath,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
        const text = buf.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json, raw: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let server;
test.before(async () => { server = await listen(); });
test.after(() => new Promise((resolve) => server.close(resolve)));

test('allowlisted static paths are served with correct types', async () => {
  const cases = [
    ['/experience/', 200, /text\/html/],
    ['/experience/app.js', 200, /text\/javascript/],
    ['/experience/styles.css', 200, /text\/css/],
    ['/experiment/world-runner.js', 200, /text\/javascript/],
    ['/experiment/sample-world-fare.json', 200, /application\/json/],
    ['/world/preview.html', 200, /text\/html/],
    ['/world/sandbox.js', 200, /text\/javascript/],
    ['/demo-ui/', 200, /text\/html/],
    ['/data/world/bloor_spadina_bathurst.json', 200, /application\/json/],
    ['/persona-swarm/data/record/final.json', 200, /application\/json/],
    ['/persona-swarm/runtime/agents-client.js', 200, /text\/javascript/],
    ['/bloor-bike-demo.md', 200, /text\/markdown/],
    ['/prd.md', 200, /text\/markdown/],
  ];
  for (const [p, status, type] of cases) {
    const r = await request(server, 'GET', p);
    assert.equal(r.status, status, p);
    assert.match(r.headers['content-type'], type, p);
  }
});

test('everything outside the allowlist is 404', async () => {
  for (const p of ['/README.md', '/AGENTS.md', '/VULTR.md', '/experiment/README.md', '/world/README.md', '/world/build/', '/persona-swarm/runtime/server.js',
    '/persona-swarm/runtime/config.js', '/persona-swarm/data/city/agents.json', '/ops/vultr.js', '/api/server.js', '/package.json', '/CLAUDE.md', '/experience/missing.js']) {
    assert.equal((await request(server, 'GET', p)).status, 404, p);
  }
});

test('traversal, encoded traversal and dotfiles are rejected', async () => {
  for (const p of ['/.env', '/%2e%2e/', '/%2e%2e/.env', '/experience/../.env', '/experience/%2e%2e/.env', '/experience/..%2f.env', '/experience/%2e%2e%2f%2e%2e%2f.env',
    '/.git/config', '/.git/HEAD', '/experience/.env', '/data/../.env', '/experience/%5c..%5c.env', '/experience/%00.js', '/.claude/settings.json',
    '/persona-swarm/.env.example', '/experience/%E0%A4%A.js', '/experience//../.env']) {
    const r = await request(server, 'GET', p);
    assert.equal(r.status, 404, p);
    assert.ok(!/VULTR|API_KEY/.test(r.text), `${p} leaked content`);
  }
  assert.equal(resolveStatic('/experience/../.env'), null);
  assert.equal(resolveStatic('/%2e%2e/.env'), null);
  assert.ok(resolveStatic('/experience/index.html'));
});

test('redirects, gzip, ETag revalidation and security headers', async () => {
  const root = await request(server, 'GET', '/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.location, '/experience/');
  assert.equal((await request(server, 'GET', '/experience')).headers.location, '/experience/');
  const js = await request(server, 'GET', '/experience/app.js', { headers: { 'Accept-Encoding': 'gzip, br' } });
  assert.equal(js.headers['content-encoding'], 'gzip');
  assert.ok(js.headers.etag);
  assert.match(js.headers['cache-control'], /max-age=60/);
  assert.equal(js.headers['x-content-type-options'], 'nosniff');
  assert.ok(js.headers['referrer-policy']);
  assert.match(js.headers['content-security-policy'], /script-src 'self' 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/cdn\.jsdelivr\.net/);
  assert.match(js.headers['content-security-policy'], /fonts\.googleapis\.com/);
  const again = await request(server, 'GET', '/experience/app.js', { headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': js.headers.etag } });
  assert.equal(again.status, 304);
  const plain = await request(server, 'GET', '/experience/app.js');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.notEqual(plain.headers.etag, js.headers.etag);
  const head = await request(server, 'HEAD', '/experience/');
  assert.equal(head.status, 200);
  assert.equal(head.raw.length, 0);
  assert.equal((await request(server, 'POST', '/experience/')).status, 405);
});

test('health reports the service and unconfigured inference', async () => {
  const r = await request(server, 'GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.service, 'counterfactual-engine');
  assert.equal(r.json.inference.configured, false);
  assert.equal(r.json.inference.decision_model, 'clef');
  assert.equal(r.json.inference.compiler_model, 'glm-5.3-flash');
  assert.ok(r.json.started_at);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('compile without a key uses offline rules and returns the prepared fare lever', async () => {
  const r = await request(server, 'POST', '/api/compile', { body: { prompt: PREPARED_PROMPTS.fare[0] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.compiled.compiler.live, false);
  assert.equal(r.json.compiled.compiler.provider, 'offline_rules');
  assert.equal(r.json.compiled.execution_path, 'known_operators');
  assert.deepEqual(r.json.compiled.interventions.map((i) => [i.lever, i.value]), [['adult_fare_cad', 3.8]]);
  assert.equal(r.json.spec.execution_path, 'known_operators');
  assert.equal(r.json.spec.intervention[0].lever, 'adult_fare_cad');
  assert.equal(r.json.spec.intervention[0].delta_cad, 0.5);
  const speculative = await request(server, 'POST', '/api/compile', { body: { prompt: 'What if Ontario raised the minimum wage by 10%?' } });
  assert.equal(speculative.json.spec.execution_path, 'speculative');
  assert.equal(speculative.json.spec.runnable, false);
});

test('compile validates length, content type and body size', async () => {
  const s = await listen({ compilePerMinute: 100 });
  try {
    assert.equal((await request(s, 'POST', '/api/compile', { body: { prompt: 'x'.repeat(281) } })).status, 400);
    assert.equal((await request(s, 'POST', '/api/compile', { body: { prompt: '' } })).status, 400);
    assert.equal((await request(s, 'POST', '/api/compile', { body: 'prompt=hi', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status, 415);
    assert.equal((await request(s, 'POST', '/api/compile', { body: { prompt: 'hi', pad: 'y'.repeat(5000) } })).status, 413);
    assert.equal((await request(s, 'POST', '/api/compile', { body: '{not json' })).status, 400);
    assert.equal((await request(s, 'GET', '/api/compile')).status, 405);
    assert.equal((await request(s, 'POST', '/api/compile', { body: { prompt: 'hi' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  } finally { await new Promise((resolve) => s.close(resolve)); }
});

test('run returns a paired experiment.v2 result with no rejected actions, then serves it from cache', async () => {
  const r = await request(server, 'POST', '/api/run', { body: { scenario: 'fare' }, headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.equal(r.headers['content-encoding'], 'gzip');
  const { result, served_by: servedBy } = r.json;
  assert.equal(result.schema_version, 'experiment.v2');
  assert.equal(result.runs.baseline.game_master.rejected_actions, 0);
  assert.equal(result.runs.intervention.game_master.rejected_actions, 0);
  assert.equal(servedBy.cached, false);
  assert.ok(Number.isFinite(servedBy.elapsed_ms));
  const again = await request(server, 'POST', '/api/run', { body: { scenario: 'fare' } });
  assert.equal(again.json.served_by.cached, true);
  assert.equal(again.json.served_by.run_id, servedBy.run_id);
  const bike = await request(server, 'POST', '/api/run', { body: { scenario: 'bike', seed: 7, overrides: { shop_staffing_response: false } } });
  assert.equal(bike.status, 200);
  assert.equal(bike.json.result.seed, 7);
  assert.equal(bike.json.result.assumption_values.shop_staffing_response, false);
});

test('run accepts a compiled spec and re-validates a client-supplied one', async () => {
  const compiled = await request(server, 'POST', '/api/compile', { body: { prompt: 'What if Line 2 trains came half as often?' } });
  assert.equal(compiled.status, 200);
  const r = await request(server, 'POST', '/api/run', { body: { spec: compiled.json.spec } });
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.equal(r.json.result.schema_version, 'experiment.v2');
  assert.equal(r.json.result.runs.intervention.game_master.rejected_actions, 0);
  const forged = { ...compiled.json.spec, id: 'not-in-cache', population: { personas: [] }, intervention: [{ operator: 'set_lever', lever: 'bloor_cycle_track', value: 'painted' }] };
  const ok = await request(server, 'POST', '/api/run', { body: { spec: forged } });
  assert.equal(ok.status, 200, ok.text.slice(0, 300));
  assert.equal(ok.json.result.population.count, 19);
  const bad = [
    { spec: { ...forged, intervention: [{ operator: 'set_lever', lever: 'bloor_cycle_track', value: 'moat' }] } },
    { spec: { ...forged, intervention: [{ operator: 'run_code', lever: 'x' }] } },
    { spec: { ...forged, intervention: [{ operator: 'change_cost', lever: 'adult_fare_cad', delta_cad: 50 }] } },
    { spec: { ...forged, execution_path: 'speculative' } },
    { scenario: 'fare', overrides: { cost_weight: 99 } },
    { scenario: 'fare', overrides: { unknown: 1 } },
    { scenario: 'fare', seed: 1.5 },
    { scenario: 'transit' },
  ];
  for (const body of bad) assert.ok([400, 422].includes((await request(server, 'POST', '/api/run', { body })).status), JSON.stringify(body).slice(0, 120));
});

test('sweep returns one row per value over the fixture sensitivity range', async () => {
  const r = await request(server, 'POST', '/api/sweep', { body: { scenario: 'bike', assumption_id: 'unprotected_cycling_discomfort_per_km', values: [1.5, 4, 6] } });
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.equal(r.json.rows.length, 3);
  for (const row of r.json.rows) {
    assert.ok(row.run_id);
    assert.ok(Number.isFinite(row.elapsed_ms));
    assert.equal(row.rejected_actions, 0);
    assert.ok(Number.isFinite(row.p4.baseline.bloor_bike_trips));
    assert.ok(Number.isFinite(row.p4.intervention.bloor_bike_trips));
  }
  assert.equal(new Set(r.json.rows.map((row) => row.run_id)).size, 3);
  assert.ok(r.json.host);
  assert.equal((await request(server, 'POST', '/api/sweep', { body: { scenario: 'bike', assumption_id: 'cost_weight', values: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8] } })).status, 400);
  assert.equal((await request(server, 'POST', '/api/sweep', { body: { scenario: 'bike', assumption_id: 'cost_weight', values: [2] } })).status, 400);
  assert.equal((await request(server, 'POST', '/api/sweep', { body: { scenario: 'bike', assumption_id: 'synthetic_population', values: [1] } })).status, 400);
});

test('Clef second opinion endpoint serves saved files only', async () => {
  const r = await request(server, 'GET', '/api/clef/fare');
  if (r.status === 200) assert.equal(r.json.schema, 'clef-second-opinion.v1');
  else assert.equal(r.status, 404);
  assert.equal((await request(server, 'GET', '/api/clef/..%2f..%2f.env')).status, 404);
  assert.equal((await request(server, 'GET', '/api/clef/both')).status, 404);
});

test('compile is rate limited per client IP', async () => {
  const s = await listen({ compilePerMinute: 2 });
  try {
    const body = { prompt: 'What if the protected Bloor cycle track were removed?' };
    assert.equal((await request(s, 'POST', '/api/compile', { body })).status, 200);
    assert.equal((await request(s, 'POST', '/api/compile', { body })).status, 200);
    const limited = await request(s, 'POST', '/api/compile', { body });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers['retry-after']) >= 1);
    // Another client behind the same local reverse proxy has its own bucket.
    assert.equal((await request(s, 'POST', '/api/compile', { body, headers: { 'X-Forwarded-For': '203.0.113.9' } })).status, 200);
  } finally { await new Promise((resolve) => s.close(resolve)); }
});

test('a run that exceeds the deadline is stopped and reported', async () => {
  const s = await listen({ runTimeoutMs: 1 });
  try {
    const r = await request(s, 'POST', '/api/run', { body: { scenario: 'bike', seed: 99 } });
    assert.ok([503, 504].includes(r.status), String(r.status));
    assert.match(r.json.error, /ms/);
  } finally { await new Promise((resolve) => s.close(resolve)); }
});
