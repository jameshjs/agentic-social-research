#!/usr/bin/env node
/* Counterfactual engine API + allowlisted static site. Zero dependencies (Node 22).
 *
 *   node api/server.js --port 8080 --host 127.0.0.1
 *
 * Static: only the paths in STATIC_RULES / STATIC_FILES; dotfiles, `..`, `.env`
 * and `.git` are always 404. API (JSON, same-origin only, no CORS headers):
 *   GET  /api/health
 *   POST /api/compile  {prompt}                          → {compiled, spec}
 *   GET  /api/clef/:scenario                             → experiment/vultr-runs/clef-world-<scenario>.json
 *   POST /api/run      {scenario, seed?, overrides?} | {spec}  → {result, served_by}
 *   POST /api/sweep    {scenario, assumption_id, values} → {rows, elapsed_ms, host}
 * Paired runs execute in a pool of two warmed worker threads (hard 30 s timeout).
 * VULTR_INFERENCE_API_KEY is read from the environment, sent only to
 * api.vultrinference.com by experiment/vultr-compiler.js, and never logged. */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

const ROOT = path.resolve(__dirname, '..');
const HEADLINE = ['completed_trips', 'transit_trips', 'bike_trips', 'bloor_bike_trips', 'car_trips', 'walk_trips', 'deferred_trips',
  'line2_rides', 'bloor_shared_cycling_m', 'local_shop_visits', 'shop_sales_cad', 'errands_elsewhere', 'fare_revenue_cad',
  'household_fare_spend_cad', 'household_transport_spend_cad', 'shops_reduced_hours'];

function summarize(result) {
  const tick = result.scenario.ticks;
  const at = (run) => {
    const p = run.metrics.by_tick.find((x) => x.tick === tick) || {};
    return Object.fromEntries(HEADLINE.map((k) => [k, p[k] ?? null]));
  };
  return {
    study_id: result.study_id, schema_version: result.schema_version, seed: result.seed, tick,
    p4: { baseline: at(result.runs.baseline), intervention: at(result.runs.intervention) },
    changed_decisions: result.changed_decisions.length,
    rejected_actions: result.runs.baseline.game_master.rejected_actions + result.runs.intervention.game_master.rejected_actions,
    events: result.runs.baseline.events.length + result.runs.intervention.events.length,
  };
}

/* ---------- worker thread: one paired run per message ---------- */
if (!isMainThread) {
  const { runWorldExperiment } = require('../experiment/world-runner');
  const world = require('../data/world/bloor_spadina_bathurst.json');
  // Warm-up: the first sandbox per world fits the calibrated background traffic (several seconds on
  // one vCPU). Do it once at worker start, with both prepared policies, so no visitor waits for it.
  const fixtures = require('../experiment/world-fixtures');
  const warm = (async () => {
    try { for (const spec of [fixtures.fare, fixtures.bike]) await runWorldExperiment(spec, { world, seed: 42 }); } catch { /* a real request reports any error */ }
  })();
  parentPort.on('message', async (task) => {
    await warm;
    const started = performance.now();
    try {
      const result = await runWorldExperiment(task.spec, { world, seed: task.seed, overrides: task.overrides });
      parentPort.postMessage({ id: task.id, ok: true, json: JSON.stringify(result), summary: summarize(result), compute_ms: Math.round(performance.now() - started) });
    } catch (error) {
      parentPort.postMessage({ id: task.id, ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) });
    }
  });
}

/* ---------- static allowlist ---------- */
const STATIC_RULES = [
  { prefix: '/experience/', exts: null },
  { prefix: '/experiment/', exts: ['.js', '.json'] },
  { prefix: '/world/', exts: ['.js', '.html'] },
  { prefix: '/demo-ui/', exts: null },
  { prefix: '/data/', exts: null },
  { prefix: '/persona-swarm/data/record/', exts: ['.json'] },
  { prefix: '/persona-swarm/data/reactions/', exts: ['.json'] },
  { prefix: '/pitch/', exts: ['.html', '.png', '.jpg', '.svg', '.md'] },
];
const STATIC_FILES = new Set(['/persona-swarm/runtime/agents-client.js', '/bloor-bike-demo.md', '/bike-lane-papers.md', '/papers.md', '/demo-data.md', '/prd.md']);
const DIR_REDIRECTS = new Set(['/experience', '/demo-ui', '/pitch']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.geojson', '.md', '.txt', '.csv', '.svg']);
const SHORT_CACHE = new Set(['.html', '.js', '.mjs', '.css']);
const REAL_ROOT = fs.realpathSync(ROOT);

const unsafeSegment = (s) => s === '..' || s === '.' || s.startsWith('.') || /[\\\0]/.test(s);

/** Map a raw request path to an allowlisted file under ROOT, or null. */
function resolveStatic(rawPath) {
  if (/[\\\0]/.test(rawPath) || rawPath.split('/').some((s) => s === '..' || s === '.')) return null;
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.split('/').some(unsafeSegment)) return null;
  let rel = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  rel = rel.replace(/\/{2,}/g, '/');
  const ext = path.extname(rel).toLowerCase();
  if (!MIME[ext]) return null;
  const rule = STATIC_FILES.has(rel) ? { exts: null } : STATIC_RULES.find((r) => rel.startsWith(r.prefix));
  if (!rule || (rule.exts && !rule.exts.includes(ext))) return null;
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  let real;
  try { real = fs.realpathSync(abs); } catch { return null; }
  if (!real.startsWith(REAL_ROOT + path.sep)) return null;
  // A symlink must not lead out of the allowlist (e.g. to .env).
  const realRel = `/${path.relative(REAL_ROOT, real).split(path.sep).join('/')}`;
  if (realRel.split('/').some((s) => s && unsafeSegment(s))) return null;
  if (!STATIC_FILES.has(realRel) && !STATIC_RULES.some((r) => realRel.startsWith(r.prefix) && (!r.exts || r.exts.includes(path.extname(realRel).toLowerCase())))) return null;
  return { abs: real, ext };
}

function createFileCache(maxBytes = 96 * 1024 * 1024) {
  const cache = new Map();
  let total = 0;
  return function load(abs, ext) {
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    const hit = cache.get(abs);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    const body = fs.readFileSync(abs);
    const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 20);
    const entry = { mtimeMs: st.mtimeMs, size: st.size, body, etag: `"${hash}"`, gz: null, gzEtag: `"${hash}-gz"` };
    if (COMPRESSIBLE.has(ext) && body.length > 512) entry.gz = zlib.gzipSync(body, { level: 9 });
    if (hit) total -= hit.body.length + (hit.gz ? hit.gz.length : 0);
    total += body.length + (entry.gz ? entry.gz.length : 0);
    cache.set(abs, entry);
    for (const [k, v] of cache) { if (total <= maxBytes) break; total -= v.body.length + (v.gz ? v.gz.length : 0); cache.delete(k); }
    return entry;
  };
}

/* ---------- security headers ---------- */
const CSP = [
  "default-src 'self'",
  // demo-ui and world/preview use inline scripts; demo-ui loads Three.js r128 from these two CDNs.
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // The landing globe (experience/globe-intro.js) reads map tiles, glyphs and sprites from OpenFreeMap.
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': CSP,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/* ---------- small utilities ---------- */
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = (text, n = 10) => crypto.createHash('sha256').update(text).digest('hex').slice(0, n);
const clone = (x) => JSON.parse(JSON.stringify(x));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') out.port = Number(argv[++i]);
    else if (argv[i] === '--host') out.host = argv[++i];
  }
  return out;
}

function readVersion() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    try { return JSON.parse(text); } catch { return { git_sha: text.split(/\s+/)[0] || null, dirty: /dirty/.test(text) }; }
  } catch { return { git_sha: null, dirty: null, note: 'no VERSION file (local checkout)' }; }
}

/* Token bucket per key; refills `perMinute` tokens per minute up to `perMinute`. */
function createBuckets(perMinute) {
  const buckets = new Map();
  return function take(key, now = Date.now()) {
    let b = buckets.get(key);
    if (!b) { b = { tokens: perMinute, at: now }; buckets.set(key, b); }
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
    b.at = now;
    if (buckets.size > 10000) for (const [k, v] of buckets) { if (now - v.at > 120000) buckets.delete(k); }
    if (b.tokens < 1) return { ok: false, retry_after_s: Math.ceil(((1 - b.tokens) / perMinute) * 60) };
    b.tokens -= 1;
    return { ok: true };
  };
}

function lru(max) {
  const map = new Map();
  return {
    get(k) { if (!map.has(k)) return undefined; const v = map.get(k); map.delete(k); map.set(k, v); return v; },
    set(k, v) { map.delete(k); map.set(k, v); while (map.size > max) map.delete(map.keys().next().value); },
    get size() { return map.size; },
  };
}

/* Two worker threads, a bounded queue and a hard per-task deadline. */
function createPool({ size = 2, timeoutMs = 10000, maxQueue = 16 } = {}) {
  const slots = [];
  const queue = [];
  let seq = 0, closed = false;
  function spawn() {
    const slot = { worker: new Worker(__filename), task: null };
    slot.worker.on('message', (msg) => {
      const task = slot.task;
      if (!task || task.id !== msg.id) return;
      slot.task = null;
      clearTimeout(task.timer);
      if (msg.ok) task.resolve(msg);
      else task.reject(new HttpError(422, msg.error));
      pump();
    });
    slot.worker.on('error', () => replace(slot, new HttpError(500, 'Run worker failed')));
    slot.worker.on('exit', () => { if (!closed && slots.includes(slot)) replace(slot, new HttpError(500, 'Run worker exited')); });
    return slot;
  }
  function replace(slot, error) {
    const i = slots.indexOf(slot);
    if (i < 0) return;
    const task = slot.task;
    slot.task = null;
    slots.splice(i, 1);
    slot.worker.removeAllListeners('exit');
    slot.worker.terminate().catch(() => {});
    if (task) { clearTimeout(task.timer); task.reject(error); }
    if (!closed) slots.push(spawn());
    pump();
  }
  function pump() {
    if (closed) return;
    while (slots.length < size) slots.push(spawn());
    for (const slot of slots) {
      if (slot.task || !queue.length) continue;
      const task = queue.shift();
      slot.task = task;
      task.slot = slot;
      slot.worker.postMessage({ id: task.id, spec: task.spec, seed: task.seed, overrides: task.overrides });
    }
  }
  function run(spec, seed, overrides) {
    if (closed) return Promise.reject(new HttpError(503, 'Server is shutting down'));
    if (queue.length >= maxQueue) return Promise.reject(new HttpError(503, 'Run queue is full; retry shortly'));
    return new Promise((resolve, reject) => {
      const task = { id: ++seq, spec, seed, overrides, resolve, reject, slot: null };
      task.timer = setTimeout(() => {
        const qi = queue.indexOf(task);
        if (qi >= 0) { queue.splice(qi, 1); reject(new HttpError(503, `Run waited more than ${timeoutMs} ms for a worker`)); return; }
        if (task.slot && task.slot.task === task) replace(task.slot, new HttpError(504, `Run exceeded ${timeoutMs} ms and was stopped`));
      }, timeoutMs);
      queue.push(task);
      pump();
    });
  }
  async function close() {
    closed = true;
    for (const t of queue.splice(0)) { clearTimeout(t.timer); t.reject(new HttpError(503, 'Server is shutting down')); }
    await Promise.all(slots.splice(0).map((s) => s.worker.terminate().catch(() => {})));
  }
  return { run, close, get busy() { return slots.filter((s) => s.task).length; }, get queued() { return queue.length; } };
}

/* ---------- the server ---------- */
function createServer(options = {}) {
  const env = options.env || process.env;
  const log = options.log || ((line) => process.stdout.write(`${line}\n`));
  const compiler = require('../experiment/scenario-compiler');
  const { createVultrCompilerProvider, resolveCompilerOptions } = require('../experiment/vultr-compiler');
  const { SENSITIVITY_IDS } = require('../experiment/world-runner');
  const fixtures = require('../experiment/world-fixtures');
  const world = require('../data/world/bloor_spadina_bathurst.json');

  const apiKey = env.VULTR_INFERENCE_API_KEY || '';
  const compilerModel = resolveCompilerOptions(env).model;
  const identity = { host: env.COUNTERFACTUAL_HOST || 'local', region: env.COUNTERFACTUAL_REGION || null, plan: env.COUNTERFACTUAL_PLAN || null };
  const limits = {
    compilePerMinute: options.compilePerMinute ?? 6,
    runPerMinute: options.runPerMinute ?? 30,
    sweepPerMinute: options.sweepPerMinute ?? 6,
    liveCompilesPerDay: options.liveCompilesPerDay ?? 200,
    liveCompileInFlight: options.liveCompileInFlight ?? 4,
    runTimeoutMs: options.runTimeoutMs ?? 30000,   // covers the one-time warm-up on a cold 1-vCPU worker
    runConcurrency: options.runConcurrency ?? 2,
  };
  const startedAt = new Date().toISOString();
  const version = readVersion();
  const loadFile = createFileCache();
  const pool = createPool({ size: limits.runConcurrency, timeoutMs: limits.runTimeoutMs });
  const runCache = lru(options.runCacheSize ?? 24);
  const inflightRuns = new Map();
  const compiledSpecs = lru(128);
  const compileCache = lru(128);
  const buckets = { compile: createBuckets(limits.compilePerMinute), run: createBuckets(limits.runPerMinute), sweep: createBuckets(limits.sweepPerMinute) };
  const daily = { day: '', live: 0 };
  let liveInFlight = 0;
  const provider = apiKey ? createVultrCompilerProvider({ apiKey, model: compilerModel, timeoutMs: 20000, maxRetries: 1 }) : null;
  const sensitivity = Object.fromEntries((fixtures.fare.assumptions || []).filter((a) => SENSITIVITY_IDS.includes(a.id)).map((a) => [a.id, a]));
  const levers = compiler.leverTable(world);

  const clientIp = (req) => {
    const remote = req.socket.remoteAddress || '';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    const xff = req.headers['x-forwarded-for'];
    if (loopback && typeof xff === 'string' && xff.trim()) return xff.split(',').pop().trim();   // Caddy on this host appends the client IP
    return remote;
  };

  function send(req, res, status, body, headers = {}) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const accepts = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const finish = (payload, encoded) => {
      res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Length': payload.length, Vary: 'Accept-Encoding', ...(encoded ? { 'Content-Encoding': 'gzip' } : {}), ...headers });
      res.bytesSent = req.method === 'HEAD' ? 0 : payload.length;
      res.end(req.method === 'HEAD' ? undefined : payload);
    };
    if (accepts && buf.length > 1024) zlib.gzip(buf, { level: 5 }, (err, gz) => finish(err ? buf : gz, !err));
    else finish(buf, false);
  }
  const sendJson = (req, res, status, value, headers = {}) => send(req, res, status, typeof value === 'string' ? value : JSON.stringify(value),
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

  function serveFile(req, res, file, cacheControl) {
    const entry = loadFile(file.abs, file.ext);
    if (!entry) return false;
    const gzip = entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const etag = gzip ? entry.gzEtag : entry.etag;
    const headers = {
      ...SECURITY_HEADERS, 'Content-Type': MIME[file.ext], ETag: etag, Vary: 'Accept-Encoding',
      'Cache-Control': cacheControl || (SHORT_CACHE.has(file.ext) ? 'public, max-age=60' : 'public, max-age=300'),
    };
    const inm = req.headers['if-none-match'];
    if (inm && inm.split(',').map((s) => s.trim().replace(/^W\//, '')).some((t) => t === entry.etag || t === entry.gzEtag || t === '*')) {
      res.writeHead(304, headers); res.end(); return true;
    }
    const body = gzip ? entry.gz : entry.body;
    res.writeHead(200, { ...headers, 'Content-Length': body.length, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
    res.bytesSent = req.method === 'HEAD' ? 0 : body.length;
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  function readJson(req, maxBytes) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers['content-type'] || '');
      if (!/^application\/json\b/i.test(type)) { reject(new HttpError(415, 'Send Content-Type: application/json')); req.resume(); return; }
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) { reject(new HttpError(413, `Body exceeds ${maxBytes} bytes`)); req.resume(); return; }
      const chunks = [];
      let size = 0, done = false;
      req.on('data', (c) => {
        if (done) return;
        size += c.length;
        if (size > maxBytes) { done = true; reject(new HttpError(413, `Body exceeds ${maxBytes} bytes`)); req.resume(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        done = true;
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
          if (!isPlainObject(value)) throw new Error('not an object');
          resolve(value);
        } catch { reject(new HttpError(400, 'Body must be a JSON object')); }
      });
      req.on('error', () => { if (!done) { done = true; reject(new HttpError(400, 'Request body error')); } });
    });
  }

  function limit(kind, req) {
    const r = buckets[kind](clientIp(req));
    if (!r.ok) throw new HttpError(429, `Too many ${kind} requests; retry in ${r.retry_after_s} s`, { headers: { 'Retry-After': String(r.retry_after_s) } });
  }

  function liveBudget() {
    const day = new Date().toISOString().slice(0, 10);
    if (daily.day !== day) { daily.day = day; daily.live = 0; }
    return daily;
  }

  /* ----- /api/compile ----- */
  async function compile(req) {
    limit('compile', req);
    const body = await readJson(req, 4096);
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw new HttpError(400, 'prompt must be a non-empty string');
    if (body.prompt.length > 280) throw new HttpError(400, 'prompt must be at most 280 characters');
    const prompt = body.prompt;
    const cacheKey = compiler.normalizeText(compiler.sanitizePrompt(prompt));
    const cached = compileCache.get(cacheKey);
    if (cached) return { ...cached, served_by: { ...identity, cached: true, elapsed_ms: 0 } };
    const started = Date.now();
    let compiled;
    const budget = liveBudget();
    if (!provider) {
      compiled = await compiler.compileHypothesis(prompt, { world });
    } else if (budget.live >= limits.liveCompilesPerDay) {
      compiled = compiler.offlineCompile(prompt, { world, warnings: [{ code: 'live_quota_exhausted', message: `The shared daily budget of ${limits.liveCompilesPerDay} live compiles is used up; deterministic offline rules were used.` }] });
    } else if (liveInFlight >= limits.liveCompileInFlight) {
      compiled = compiler.offlineCompile(prompt, { world, warnings: [{ code: 'live_compiler_busy', message: 'All live compiler slots are busy; deterministic offline rules were used.' }] });
    } else {
      budget.live++;
      liveInFlight++;
      try { compiled = await compiler.compileHypothesis(prompt, { provider, world }); } finally { liveInFlight--; }
    }
    let spec;
    try { spec = compiler.toWorldSpec(compiled, fixtures, { world }); } catch (error) {
      spec = { execution_path: 'speculative', runnable: false, not_estimable: true, question: compiled.question, reason: `Spec rejected by backend validation: ${String(error.message).slice(0, 200)}` };
    }
    if (compiler.isRunnableSpec(spec)) compiledSpecs.set(spec.id, spec);
    const out = { compiled, spec };
    if (compiled.compiler.live || !provider) compileCache.set(cacheKey, out);   // never cache a quota/busy fallback
    return { ...out, served_by: { ...identity, cached: false, elapsed_ms: Date.now() - started } };
  }

  /* ----- run inputs ----- */
  function checkOverrides(overrides) {
    if (overrides === undefined || overrides === null) return {};
    if (!isPlainObject(overrides)) throw new HttpError(400, 'overrides must be an object');
    const out = {};
    for (const [k, v] of Object.entries(overrides)) {
      const a = sensitivity[k];
      if (!a) throw new HttpError(400, `Unknown assumption ${String(k).slice(0, 60)}; allowed: ${Object.keys(sensitivity).join(', ')}`);
      if (typeof a.value === 'boolean') { if (typeof v !== 'boolean') throw new HttpError(400, `${k} must be true or false`); }
      else if (!Number.isFinite(v) || v < a.low || v > a.high) throw new HttpError(400, `${k} must be a number in the fixture range ${a.low}–${a.high} ${a.unit || ''}`.trim());
      out[k] = v;
    }
    return out;
  }
  function checkSeed(seed) {
    if (seed === undefined || seed === null) return 42;
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new HttpError(400, 'seed must be an integer 0–2147483647');
    return seed;
  }
  /* A client-supplied spec is never trusted: only its intervention is read, re-validated
   * against the world's lever table, and applied to the shared server-side base. */
  function specFromClient(raw) {
    if (!isPlainObject(raw)) throw new HttpError(400, 'spec must be an object');
    if (typeof raw.id === 'string') { const known = compiledSpecs.get(raw.id); if (known) return known; }
    if (raw.execution_path !== 'known_operators') throw new HttpError(422, 'Only a runnable (known_operators) spec can run; speculative hypotheses are not estimable');
    if (!Array.isArray(raw.intervention) || !raw.intervention.length || raw.intervention.length > 7) throw new HttpError(400, 'spec.intervention must list 1–7 changes');
    const base = clone(fixtures.fare);
    for (const k of ['id', 'scenario_id', 'question', 'intervention', 'policy_source_ids']) delete base[k];
    const intervention = raw.intervention.map((c, i) => {
      if (!isPlainObject(c)) throw new HttpError(400, `intervention[${i}] must be an object`);
      if (c.operator === 'change_cost' && c.lever === 'adult_fare_cad') {
        const problem = Number.isFinite(c.delta_cad) ? compiler.checkLeverValue(levers.adult_fare_cad, Math.round((base.environment.adult_fare_cad + c.delta_cad) * 100) / 100) : { message: 'needs a finite delta_cad' };
        if (problem) throw new HttpError(400, `intervention[${i}] adult fare ${problem.message}`);
        return { operator: 'change_cost', target: 'adult_transit_ride', delta_cad: c.delta_cad, unit: 'CAD', lever: 'adult_fare_cad' };
      }
      if (c.operator === 'set_lever' && typeof c.lever === 'string' && levers[c.lever] && c.lever !== 'adult_fare_cad') {
        const problem = compiler.checkLeverValue(levers[c.lever], c.value);
        if (problem) throw new HttpError(400, `intervention[${i}] ${c.lever} ${problem.message}`);
        return { operator: 'set_lever', target: c.lever, value: c.value, lever: c.lever };
      }
      throw new HttpError(400, `intervention[${i}] uses an unsupported operator or lever`);
    });
    const question = typeof raw.question === 'string' ? raw.question.replace(/\s+/g, ' ').trim().slice(0, 280) : '';
    return {
      ...base, id: `bloor-section-client-${sha(JSON.stringify(intervention))}`, scenario_id: 'compiled', question, intervention,
      policy_source_ids: ['bloor_world'], execution_path: 'known_operators',
      compiler: { provider: 'client_supplied', live: false, note: 'Not in this server’s compile cache; levers were re-validated server-side.' },
    };
  }

  async function execute(spec, seed, overrides) {
    const key = JSON.stringify([spec.id, sha(JSON.stringify(spec.intervention), 16), seed, overrides]);
    const runId = `${spec.id}@${seed}#${sha(key, 8)}`;
    const hit = runCache.get(key);
    if (hit) return { ...hit, run_id: runId, cached: true, elapsed_ms: 0 };
    if (inflightRuns.has(key)) { const r = await inflightRuns.get(key); return { ...r, run_id: runId, cached: true }; }
    const started = Date.now();
    const p = pool.run(spec, seed, overrides).then((msg) => ({ json: msg.json, summary: msg.summary, compute_ms: msg.compute_ms }));
    inflightRuns.set(key, p);
    try {
      const r = await p;
      runCache.set(key, r);
      return { ...r, run_id: runId, cached: false, elapsed_ms: Date.now() - started };
    } finally { inflightRuns.delete(key); }
  }

  /* ----- /api/run ----- */
  async function run(req, res) {
    limit('run', req);
    const body = await readJson(req, 256 * 1024);
    let spec;
    if (body.scenario !== undefined) {
      if (body.spec !== undefined) throw new HttpError(400, 'Send scenario or spec, not both');
      if (!['fare', 'bike'].includes(body.scenario)) throw new HttpError(400, 'scenario must be fare or bike');
      spec = fixtures[body.scenario];
    } else if (body.spec !== undefined) spec = specFromClient(body.spec);
    else throw new HttpError(400, 'Send {scenario} or {spec}');
    const seed = checkSeed(body.seed);
    const overrides = checkOverrides(body.overrides);
    const started = Date.now();
    const r = await execute(spec, seed, overrides);
    const servedBy = { ...identity, elapsed_ms: Date.now() - started, compute_ms: r.compute_ms, cached: r.cached, run_id: r.run_id, workers: limits.runConcurrency };
    sendJson(req, res, 200, `{"result":${r.json},"served_by":${JSON.stringify(servedBy)}}`);
  }

  /* ----- /api/sweep ----- */
  async function sweep(req) {
    limit('sweep', req);
    const body = await readJson(req, 4096);
    if (!['fare', 'bike'].includes(body.scenario)) throw new HttpError(400, 'scenario must be fare or bike');
    const a = sensitivity[body.assumption_id];
    if (!a) throw new HttpError(400, `assumption_id must be one of ${Object.keys(sensitivity).join(', ')}`);
    if (!Array.isArray(body.values) || !body.values.length || body.values.length > 5) throw new HttpError(400, 'values must list 1–5 values');
    const seed = checkSeed(body.seed);
    const values = body.values.map((v) => checkOverrides({ [a.id]: v })[a.id]);
    const spec = fixtures[body.scenario];
    const started = Date.now();
    const rows = [];
    for (const value of values) {
      const t0 = Date.now();
      const r = await execute(spec, seed, { [a.id]: value });
      rows.push({ value, run_id: r.run_id, elapsed_ms: Date.now() - t0, compute_ms: r.compute_ms, cached: r.cached,
        changed_decisions: r.summary.changed_decisions, rejected_actions: r.summary.rejected_actions, p4: r.summary.p4 });
    }
    return {
      scenario: body.scenario, study_id: spec.id, seed, assumption_id: a.id, unit: a.unit || null, fixture_value: a.value, range: [a.low, a.high],
      p4_tick: spec.ticks, rows, elapsed_ms: Date.now() - started, host: identity.host, region: identity.region,
      note: 'Each row is one paired run with a single assumption overridden; the spread is a scenario range, not a confidence interval.',
    };
  }

  function health() {
    const budget = liveBudget();
    return {
      ok: true, service: 'counterfactual-engine', ...identity, started_at: startedAt,
      git_sha: version.git_sha ?? null, git_dirty: version.dirty ?? null, deployed_at: version.deployed_at ?? null,
      inference: { configured: Boolean(apiKey), compiler_model: compilerModel, decision_model: 'clef',
        live_compiles_today: budget.live, live_compiles_per_day: limits.liveCompilesPerDay },
      runs: { workers: limits.runConcurrency, busy: pool.busy, queued: pool.queued, cached: runCache.size, timeout_ms: limits.runTimeoutMs },
    };
  }

  // Same-origin by default. The one exception: a page served from a developer's own machine
  // (Steven's agent server on :4174, python http.server on :4173) may call this engine, so a
  // teammate's localhost demo still runs its paired worlds on Vultr. Any other origin gets 403.
  const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
  const originAllowed = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (LOCAL_ORIGIN.test(origin)) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  };

  async function handle(req, res) {
    const rawPath = (req.url || '/').split('?')[0];
    if (rawPath.startsWith('/api/')) {
      if (!originAllowed(req)) throw new HttpError(403, 'Cross-origin requests are not allowed');
      const origin = req.headers.origin;
      if (origin && LOCAL_ORIGIN.test(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin, Accept-Encoding');
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { ...SECURITY_HEADERS, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', 'Content-Length': 0 });
          res.end();
          return undefined;
        }
      }
      if (req.method === 'OPTIONS') throw new HttpError(403, 'Cross-origin requests are not allowed');
      if (rawPath === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) return sendJson(req, res, 200, health());
      if (rawPath === '/api/compile' && req.method === 'POST') return sendJson(req, res, 200, await compile(req));
      if (rawPath === '/api/run' && req.method === 'POST') return run(req, res);
      if (rawPath === '/api/sweep' && req.method === 'POST') return sendJson(req, res, 200, await sweep(req));
      const clef = rawPath.match(/^\/api\/clef\/(fare|bike)$/);
      if (clef && (req.method === 'GET' || req.method === 'HEAD')) {
        const abs = path.join(ROOT, 'experiment', 'vultr-runs', `clef-world-${clef[1]}.json`);
        if (fs.existsSync(abs) && serveFile(req, res, { abs, ext: '.json' }, 'public, max-age=60')) return undefined;
        throw new HttpError(404, `No Clef second opinion saved for ${clef[1]}`);
      }
      if (/^\/api\/(health|compile|run|sweep|clef\/(fare|bike))$/.test(rawPath)) throw new HttpError(405, 'Method not allowed');
      throw new HttpError(404, 'Not found');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    if (rawPath === '/') { res.writeHead(302, { ...SECURITY_HEADERS, Location: '/experience/', 'Content-Length': 0 }); res.end(); return undefined; }
    if (DIR_REDIRECTS.has(rawPath)) { res.writeHead(301, { ...SECURITY_HEADERS, Location: `${rawPath}/`, 'Content-Length': 0 }); res.end(); return undefined; }
    const file = resolveStatic(rawPath);
    if (file && serveFile(req, res, file)) return undefined;
    throw new HttpError(404, 'Not found');
  }

  const server = http.createServer((req, res) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const p = (req.url || '/').split('?')[0].slice(0, 200).replace(/[^\x20-\x7e]/g, '?');
      log(`${new Date().toISOString()} ${req.method} ${p} ${res.statusCode} ${res.bytesSent ?? 0}B ${ms.toFixed(1)}ms ip#${sha(clientIp(req), 8)}`);
    });
    handle(req, res).catch((error) => {
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Internal error';
      if (!(error instanceof HttpError)) log(`error ${String(error && error.message ? error.message : error).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 200)}`);
      if (req.url && req.url.startsWith('/api/')) sendJson(req, res, status, { error: message }, error.extra?.headers || {});
      else send(req, res, status, status === 404 ? 'Not found\n' : `${message}\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...(error.extra?.headers || {}) });
    });
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.keepAliveTimeout = 5000;
  const close = server.close.bind(server);
  server.close = (cb) => { pool.close(); return close(cb); };
  server.pool = pool;
  return server;
}

module.exports = { createServer, resolveStatic, createBuckets, createPool, summarize, CSP };

if (isMainThread && require.main === module) {
  const { port = 8080, host = '127.0.0.1' } = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(port) || port < 0 || port > 65535) { process.stderr.write('Usage: node api/server.js --port 8080 --host 127.0.0.1\n'); process.exit(2); }
  const server = createServer();
  server.listen(port, host, () => process.stdout.write(`counterfactual-engine listening on http://${host}:${server.address().port} (inference ${process.env.VULTR_INFERENCE_API_KEY ? 'configured' : 'not configured'})\n`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
