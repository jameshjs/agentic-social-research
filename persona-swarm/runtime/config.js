/* Console server configuration and startup checks. Everything comes from persona-swarm/.env or flags, so the server can
 * move from this laptop to a hosted machine by changing the host, port and AGENT_BACKEND only.
 *   AGENT_BACKEND  local (this machine's claude login, the default) | token (CLAUDE_CODE_OAUTH_TOKEN) | api (opt-in
 *                  ANTHROPIC_API_KEY) | remote (forward to AGENT_SERVER_URL with CONSOLE_ACCESS_KEY) | replay (saved runs only)
 *   CONSOLE_HOST, CONSOLE_PORT, AGENT_CONCURRENCY, CONSOLE_CORS_ORIGINS; --lan, --host, --port, --backend,
 *   --concurrency, --env-file and --require-key override them.
 * A server bound beyond loopback (or run with --require-key) requires CONSOLE_ACCESS_KEY on every API call, and so does
 * any cross-origin call from an allowed site. The key is read fresh on each request so it can be rotated. */
'use strict';
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cliEnv, readDotEnv } = require('./claude-decision');

const ROOT = path.resolve(__dirname, '..');
const LIVE_DIR = path.join(ROOT, 'data', 'city', 'live');
const BACKENDS = ['local', 'token', 'api', 'remote', 'replay'];
const isLoopback = (host) => ['127.0.0.1', 'localhost', '::1'].includes(host);
const fingerprint = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 8);

function lanAddress(interfaces = os.networkInterfaces()) {
  const all = Object.entries(interfaces).flatMap(([name, list]) => (list || []).map((i) => ({ name, ...i })))
    .filter((i) => i.family === 'IPv4' && !i.internal);
  return (all.find((i) => /^en\d|^eth\d|^wl/.test(i.name)) || all[0])?.address || null;
}

const flag = (argv, name) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
// --env-file lets a second server (a teammate's, in a test) run beside this one with its own settings.
const envFile = (argv = []) => flag(argv, '--env-file') || path.join(ROOT, '.env');

function loadConfig(argv = [], env = readDotEnv(envFile(argv))) {
  const value = (name) => flag(argv, name);
  const lan = argv.includes('--lan');
  return {
    backend: value('--backend') || env.AGENT_BACKEND || 'local',
    envFile: envFile(argv),
    lan,
    host: lan ? lanAddress() : value('--host') || env.CONSOLE_HOST || '127.0.0.1',
    port: Number(value('--port') || env.CONSOLE_PORT || 4174),
    concurrency: Number(value('--concurrency') || env.AGENT_CONCURRENCY || 32),   // fastest stable setting measured on 17 Oct
    remoteUrl: (env.AGENT_SERVER_URL || '').replace(/\/$/, ''),
    requireKey: argv.includes('--require-key') || env.CONSOLE_REQUIRE_KEY === '1',
    corsOrigins: (env.CONSOLE_CORS_ORIGINS || 'http://127.0.0.1:4173,http://localhost:4173').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/* `claude auth status` for the backend's own environment. It prints JSON with loggedIn and authMethod. */
function authStatus(mode, token) {
  const cwd = path.join(os.tmpdir(), 'persona-swarm-empty');
  fs.mkdirSync(cwd, { recursive: true });
  const r = spawnSync('claude', ['auth', 'status', '--json'], { cwd, env: cliEnv(mode, { token }), encoding: 'utf8', timeout: 20000 });
  if (r.error) return { error: r.error.code === 'ENOENT' ? 'the claude CLI is not installed' : r.error.message };
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || r.stdout || 'no output').trim().slice(0, 200) }; }
}

const sdkInstalled = () => { try { require.resolve('@anthropic-ai/sdk', { paths: [__dirname] }); return true; } catch { return false; } };
const savesExist = (dir = LIVE_DIR) => [dir, path.join(dir, 'samples')].some((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.json')));

/* Refuse an unusable backend or exposure with a clear message. Prints the mode and auth method, never a secret. */
async function checkStartup(config, env, deps = {}) {
  const { status = authStatus, fetchImpl = globalThis.fetch, sdk = sdkInstalled, saves = savesExist } = deps;
  const fail = (error) => ({ ok: false, error });
  if (!BACKENDS.includes(config.backend)) return fail(`AGENT_BACKEND must be one of ${BACKENDS.join(', ')} (got "${config.backend}")`);
  if (config.lan && !config.host) return fail('--lan: no LAN address found on this machine');
  if (!isLoopback(config.host) && !env.CONSOLE_ACCESS_KEY) return fail(`binding to ${config.host} needs CONSOLE_ACCESS_KEY in persona-swarm/.env`);
  if (config.requireKey && !env.CONSOLE_ACCESS_KEY) return fail('--require-key needs CONSOLE_ACCESS_KEY in persona-swarm/.env');
  if (!(config.concurrency >= 1 && config.concurrency <= 64)) return fail('AGENT_CONCURRENCY must be between 1 and 64');
  const login = (mode, token) => {
    const s = status(mode, token);
    if (s.error) return fail(`claude auth status failed: ${s.error}`);
    if (!s.loggedIn) return fail(mode === 'token' ? 'CLAUDE_CODE_OAUTH_TOKEN was not accepted by claude auth status' : 'this machine is not logged in to claude (run: claude auth login)');
    if (/api.?key/i.test(String(s.authMethod))) return fail(`claude auth status reports ${s.authMethod}; refusing so agent calls never bill to the API silently (use AGENT_BACKEND=api for that)`);
    return { ok: true, detail: `${s.authMethod}${s.subscriptionType ? `, ${s.subscriptionType} plan` : ''}` };
  };
  switch (config.backend) {
    case 'local': return login('local');
    case 'token': return env.CLAUDE_CODE_OAUTH_TOKEN ? login('token', env.CLAUDE_CODE_OAUTH_TOKEN) : fail('AGENT_BACKEND=token needs CLAUDE_CODE_OAUTH_TOKEN in persona-swarm/.env (create it with: claude setup-token)');
    case 'api':
      if (!env.ANTHROPIC_API_KEY) return fail('AGENT_BACKEND=api needs ANTHROPIC_API_KEY in persona-swarm/.env');
      return sdk() ? { ok: true, detail: 'Anthropic API (billed per token)' } : fail('AGENT_BACKEND=api needs the SDK: run npm install in persona-swarm/runtime');
    case 'remote': {
      if (!config.remoteUrl || !env.CONSOLE_ACCESS_KEY) return fail('AGENT_BACKEND=remote needs AGENT_SERVER_URL and CONSOLE_ACCESS_KEY in persona-swarm/.env');
      try {
        const r = await fetchImpl(`${config.remoteUrl}/health`, { headers: { authorization: `Bearer ${env.CONSOLE_ACCESS_KEY}` }, signal: AbortSignal.timeout(5000) });
        if (r.status === 401) return fail(`${config.remoteUrl} refused the access key`);
        if (!r.ok) return fail(`${config.remoteUrl}/health answered HTTP ${r.status}`);
        const h = await r.json();
        return { ok: true, detail: `forwarding to ${config.remoteUrl} (its backend: ${h.backend})` };
      } catch (e) { return fail(`cannot reach ${config.remoteUrl}: ${e.message}`); }
    }
    default: return saves() ? { ok: true, detail: 'saved runs only, no model access' } : fail('AGENT_BACKEND=replay needs a saved run in persona-swarm/data/city/live/ or live/samples/');
  }
}

/* Bearer check against the current CONSOLE_ACCESS_KEY (re-read each time, so it can be rotated in .env). */
function checkKey(header, env = readDotEnv()) {
  const key = env.CONSOLE_ACCESS_KEY;
  const given = /^Bearer (.+)$/.exec(header || '')?.[1] || '';
  if (!key || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) return null;
  return fingerprint(key);
}

module.exports = { ROOT, LIVE_DIR, BACKENDS, isLoopback, fingerprint, lanAddress, envFile, loadConfig, authStatus, sdkInstalled, savesExist, checkStartup, checkKey };
