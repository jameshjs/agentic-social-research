# City persona runtime

100 persona agents, shared by both policies, answer polls; 40 of them make the trip decisions in Meet's paired experiment
([`experiment/runner.js`](../experiment/runner.js), unchanged). Each agent is a Twin-2K-500 respondent's real given
answers, packaged exactly as tuned (round 9), placed in a synthetic Toronto role. A local Node server streams everything
to a console page, and a dependency-free client lets other pages use it.

## Commands

From the repository root:

```bash
npm --prefix persona-swarm/runtime start            # the site and the agents: http://127.0.0.1:4174/experience/ (and /console)
npm --prefix persona-swarm/runtime start -- --lan   # share on the LAN (needs CONSOLE_ACCESS_KEY)
npm --prefix persona-swarm/runtime test             # 38 offline tests, no model calls
python3 persona-swarm/runtime/build_agents.py       # rebuild data/city/agents.json (needs data/twin; not needed at runtime)
node persona-swarm/runtime/run.js both --backend local   # CLI world runs → data/city/run-<scenario>.json (git-ignored)
node persona-swarm/runtime/evaluate.js both         # evaluate those CLI runs
```

Server flags:
- `--backend local|token|api|remote|replay`
- `--host <address>`, `--lan`
- `--port 4174`
- `--concurrency 32`
- `--env-file <path>`
- `--require-key`

## Files

| File | Role |
|---|---|
| `runtime/build_agents.py` | Builds the 100 bundles. Reuses `autoresearch/formats.py`. |
| `data/city/agents.json` | The bundles (committed, 10 MB) |
| `runtime/claude-decision.js` | The agent: prompts, `decide()`, `ask()` (as `poll`), memory, CLI and SDK backends, the limit stop |
| `runtime/city-addendum.md` | The city addendum, the same for decisions and polls |
| `runtime/orchestrator.js` | The Opus 5.5 router and summariser, with the number check |
| `runtime/run.js` | World runs: concurrent passes over the unchanged runner, per-week settling |
| `runtime/evaluate.js` | Rates, consistency, fare elasticity, Bloor shares, variety, latency, cost |
| `runtime/server.js`, `runtime/config.js` | The HTTP/SSE server, backends, startup checks, access key, CORS, saves, replay, remote forwarding |
| `runtime/console.html` | The console page |
| `runtime/agents-client.js` | The drop-in client for other pages |
| `data/city/live/` | Auto-saves of every live poll and run, and `access.log` (git-ignored) |
| `data/city/live/samples/` | 3 committed saves for replay on a fresh checkout |

## Contract

**Bundles.** Each entry in `agents.json` has:
- `bundle_version: "agents-v1"`, `instructions_round: "009"`, `model`, and the CC BY 4.0 attribution;
- `match_keys` (income band, and the donor's age band, sex, pid and set);
- the runner fields (`role`, `routine`, money, access, fare category, sensitivities, `mode_preference`);
- `situation`, the Toronto block;
- `persona_sheet`, which is `formats.render(pid, 'full_relative')` without the US party and ideology answers, plus the
  Toronto block;
- `decider`.

The runner person never carries the sheet; it is looked up by `id`.

**Roster.**
- Modes come from the 25 Jun 2025 counts at both section ends: drivers 47, cyclists 11, walkers 14 and TTC riders 16,
  plus 4 shop owners and 8 shop workers at real Bloor businesses, named by type only.
- Neighbourhood, low income (giving Fair Pass and the band), car and bike are each drawn from their own census
  marginal.
- Donors are 100 distinct Twin respondents in the same income band; Fair Pass holders get donors under 65.
- The 40 deciders are stratified by role, plus edge cases: a Fair Pass TTC rider (a010) and a carless shop worker
  (a044).
- Both fixture specs accept all 100 and the 40.

**Prompt.** The system prompt is `instructions.md` (read, never copied), then the addendum, then the persona sheet. The
user message is one of:
- `decide`: week, trip, cash, the fare or lane change against the baseline in $ and %, what changed around the person
  this run (shop hours, a redirected trip), last week's choice for this trip, then each legal option with its time and
  cost;
- `ask`: the question and any options.

**Models.**
- Agents: Haiku 5.5 at low effort. Orchestrator: Opus 5.5 at medium effort.
- `claude -p` always runs with `--tools "" --restricted --strict-mcp-config --mcp-config '{"mcpServers":{}}'
  --disable-slash-commands --setting-sources project --no-session-persistence`: no shell, files, network, MCP or
  skills.

**Outputs.**
- `decide` returns `{action, provider, reason}` from the legal options. A timeout (30 s), error or illegal answer is
  retried once; after that it returns `null`, and the runner's fixture rule decides with a warning.
- `ask` returns `{choice, reason}` with options, or `{stance (5-point), affected (not at all / a little / a lot),
  reason}`, labelled "survey-style reaction, not a forecast".
- At the plan's limit, all agent calls stop at once with no retry, and the console shows "agent backend limit reached"
  and offers the replay.

**Server** (127.0.0.1:4174 by default; SSE responses):

| Endpoint | Does |
|---|---|
| `GET /` → `/experience/`; static allowlist | The site, same-origin: `/experience/`, `/experiment/`, `/world/`, `/demo-ui/`, `/data/`, `/persona-swarm/data/record/` and `/reactions/`, `/persona-swarm/runtime/agents-client.js`, `/bloor-bike-demo.md`. No dotfiles, no `..`, nothing else. `*.local.*` files are served on loopback only. |
| `GET /console`, `GET /agents-client.js` | The developer page and the client (no key) |
| `GET /health`, `GET /agents` | Backend, models, roster summaries (no sheets). `ok` is true only while live agents can answer (false in replay mode or after the limit) |
| `POST /ask` `{question, options?, filter?, ids?, concurrency?, orchestrate?, summarise?}` | With `orchestrate`, Opus turns typed text into one neutral poll. Events: `plan`, `start`, `answer` (`{id, agent: {id, name, role, mode, neighbourhood, fare_category, has_car, has_bike, age_band, sex, income_band, decider, shop}, answer}`), `limit`, `done`, then `summary` |
| `POST /run/fare`, `/run/bloor` (alias `/run/bike`) | Events: `start`, `decision` (per call, with its arm), `tick` (per settled week, both arms' metrics), `done` (event-derived totals, checks, and the full experiment.v1 `result`) |
| `POST /chat` `{message}` | Opus picks a poll (it writes the question and options, and picks agents by role or attribute), a run, or a reply. It then streams as above, plus `plan` and `summary`. |
| `GET /replay/latest?kind=&policy=`, `GET /saves/<file>[?part=result]` | The newest save, labelled "replay of a live run at HH:MM", and any save or its RunResult |
| `GET /usage` | Requests per key fingerprint |

**Backends** (`AGENT_BACKEND` in `persona-swarm/.env`):

| Mode | Uses | Startup check |
|---|---|---|
| `local` (default) | This machine's `claude` login; `ANTHROPIC_API_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` are removed from the child's env | `claude auth status` must show an OAuth login. API-key auth is refused, so the API is never billed silently. |
| `token` | `CLAUDE_CODE_OAUTH_TOKEN`. The child env holds only `PATH`, the token and an isolated `CLAUDE_CONFIG_DIR`. | As above, run in that env. The token is never printed or logged. |
| `api` | `ANTHROPIC_API_KEY` through `@anthropic-ai/sdk` (opt-in `npm install`), with the sheet cached per agent and a pre-warm | The key is set and the SDK is installed |
| `remote` | Forwards `/ask`, `/run`, `/chat`, `/health`, `/replay` and `/saves` to `AGENT_SERVER_URL` with `CONSOLE_ACCESS_KEY` as a bearer token. If the remote stops mid-stream, the stream ends with an `error` event; a refused key returns 502 naming `.env` | The remote's `/health` accepts the key |
| `replay` | Saved runs only, no model access | A save or sample exists |

**Access.**
- On a local server, same-origin calls (the site it serves, or localhost and 127.0.0.1 on the same port) need no key,
  so the browser never carries one.
- A server bound beyond loopback (`--lan`, `--host`), or started with `--require-key`, needs `CONSOLE_ACCESS_KEY` on
  every API call. So does any cross-origin call from an allowed site (`CONSOLE_CORS_ORIGINS`, default the python
  http.server on :4173, an optional extra).
- The key is re-read from `.env` on every request, so editing it rotates it without touching the token.
- `access.log` records the time, the key's fingerprint, the caller's address, the endpoint and a running count, with
  no secrets.

**Client** (`agents-client.js`, no dependencies; same-origin by default):
- `AgentsClient.create({serverUrl = ''})`, or the ready-made `PersonaAgents` (`configure({url})` or
  `window.PERSONA_AGENTS = {url}` to point elsewhere). Browsers never hold a key; `accessKey` exists for Node callers
  only.
- `askAgents(question, {options, filter, orchestrate = true, summarise = true, onPlan, onAnswer, onSummary, onDone, …})`
  resolves with the poll's `done`.
- `runPolicy('fare'|'bloor'|'bike', {onTick, onDecision, onDone, …})` resolves with the `experiment.v1` RunResult.
- Also `chat`, `health`, `agents` and `latestReplay`.

## Live checks (17 Oct, this laptop, `local` backend, Max plan)

| Check | Result |
|---|---|
| 1. Bundles generate | **Pass.** 100 bundles, 40 deciders, 100 distinct donors. Both specs validate. |
| 2. Server starts, `/console` opens | **Pass.** Startup check: claude.ai login, Max plan. |
| 3. Typed question → 100 streamed answers | **Pass.** 100 of 100 every time, 0 failed. 16 in parallel: 37.1 s (cold cache, $0.83). 32: 19.3 s ($0.08). 48: 21.1 s ($0.09, p95 11.8 s). **The default is 32.** Summaries' numbers were all found in the results. |
| 4a. "run the fare change" | **Pass.** 560 calls in 105.8 s, 0 failed, 0 fallbacks, $0.94. 7 of 240 decisions changed (5 walk→drive). Elasticity 0, **out of range** (papers: −0.2 to −0.6; fixture rule −0.17). Variety 4.0 (fixture rule 4.0). Same choice set → same action 98%. |
| 4b. "run the Bloor change" | **Pass.** 560 calls in 104.1 s, 0 failed, $0.62. 44 of 240 changed. Of Bloor riders' trips: 14% stay, 50% reroute, 36% switch, 0% defer (fixture rule: 38% respond), so towards the brief's rerouting case. Variety 4.13 (fixture rule 4.38). Same choice set → same action 97%. |
| 5. Backend off → replay | **Pass.** A `replay` server opens on "replay of a live run at 11:32"; typed requests also get the labelled replay. |
| Remote mode | **Pass.** A teammate server on :4176 (`remote`) sent "Ask the cyclists…" to the agent server on :4174 (`--require-key`). 11 of 11 answered in 7.0 s. With no key, 401. `access.log` shows the fingerprint only. |

These are face-validity checks on synthetic people in a schematic world, not forecasts. Never tune to the elasticity
range.

## Run on Steven's plan

1. Run `claude setup-token` on the machine that will run the agents. Put the value in `persona-swarm/.env` as
   `CLAUDE_CODE_OAUTH_TOKEN`, and set `AGENT_BACKEND=token`. Never commit, paste or share it.
2. Turn off extra usage on the account, so reaching the plan's limit stops the agents instead of billing.
3. Set a `CONSOLE_ACCESS_KEY`, start the server, and give teammates the URL and the key, never the token.

**Reaching the server:**
- **Same LAN:** start with `--lan`. It binds to the laptop's LAN address and prints the URL to share.
- **Tailscale:** teammates join Steven's tailnet. Start with `--host <Steven's Tailscale IP>` and share
  `http://<that IP or MagicDNS name>:4174`. The key is still required.
- **Hosted later:** run the same command on the host and change teammates' `AGENT_SERVER_URL`.

## Public demo guard

For the public site with no login: the server behind the Caddy tunnel ([ops/agents-tunnel.md](../ops/agents-tunnel.md))
protects the plan itself. It is opt-in, so the local (:4174) and LAN (:4177) servers are unaffected.

```sh
npm --prefix persona-swarm/runtime start -- --require-key --port 4179 --demo-guard
```

| Limit | Default | `.env` / flag |
|---|---|---|
| Polls in flight, server-wide | 1 | `DEMO_CONCURRENT` / `--demo-concurrent` |
| Polls per client IP per rolling window | 3 per 10 min | `DEMO_PER_IP`, `DEMO_WINDOW_MIN` / `--demo-per-ip`, `--demo-window-min` |
| Polls over the whole demo (persisted) | 60 | `DEMO_MAX_TOTAL` / `--demo-max-total` |
| Characters in the question or idea (and in its options) | 300 | `DEMO_MAX_CHARS` / `--demo-max-chars` |

`DEMO_GUARD=1` in `.env` equals `--demo-guard`. Startup prints the limits and the polls left.

- **Public:** `GET /health` (never counted; `ok: false` once the total is used up), `/agents`, `/replay/latest`,
  `/saves/*`; `POST /ask` and `POST /chat` with `modes: ['poll']` only. A `/chat` draft and its poll count as one poll.
  Everything else, including `/run*`, `/usage`, `/console` and the static site, returns 403. Visitors cannot set
  `concurrency`.
- **Refused:** HTTP 429 `{ error, reason: 'busy' | 'rate' | 'cap' | 'too_long', retry_after_s, replay }`. The
  experience page shows `error` in the poll status ("Agents are busy with another visitor; try again in a moment",
  "Demo limit reached: showing saved replays"). Its prepared replays keep working.
- **Client IP:** the first `X-Forwarded-For` entry, trusted only when the socket peer is loopback (the tunnel);
  otherwise the socket address. Caddy v2 overwrites any client-supplied `X-Forwarded-For` unless `trusted_proxies` is
  set, so visitors cannot choose their address.
- **Log:** each allowed or refused poll goes to `data/city/live/access.log` as
  `demo allowed|refused reason=… ip=… /ask total=12/60`, with no key.
- **Reset:** the total is in `data/city/live/demo-guard-total.txt` (git-ignored; `DEMO_TOTAL_FILE` moves it). A
  restart keeps it and clears the per-IP windows. To reset, stop the server, delete the file, and start again.

**After the demo:**
1. Stop the tunnel (`ssh`/`autossh`) and the :4179 server.
2. Meet removes the VM's `tunnel` user and the Caddy agents `handle` (see "Remove it after the event" in
   [ops/agents-tunnel.md](../ops/agents-tunnel.md)).
3. Rotate `CONSOLE_ACCESS_KEY` in `persona-swarm/.env` and in teammates' `.env` files.

## Frontend handoff

- **The product UI is `/experience/`,** served by this server. A separate session wires it to the agents (`experience/`
  is Aadit's). `/console` is a developer and debug view.
- **Teammates** run their own server with `AGENT_BACKEND=remote` and open `http://127.0.0.1:4174/experience/`. Their
  server forwards agent calls to Steven's, server-to-server, with the key.
- **Any page the server serves** includes `/persona-swarm/runtime/agents-client.js` and calls `askAgents` or
  `runPolicy`. `runPolicy` resolves with the RunResult, which `experimentAdapter.toBikeScenario` and `toFareScenario`
  take directly.

## Decisions

1. Agents are Twin-anchored (Steven), and the city sheet drops party and ideology.
2. Roles come from the world's counts, which include through traffic, so drivers are heavy. Shop roles are an
   assumption, and the census marginals are drawn independently.
3. Age and sex come from the donor, since `data/` has no Bathurst–Spadina age or sex marginals.
4. Concurrency: passes within a run, and the default is 32 in parallel (fastest stable). 48 was slower on this laptop.
5. The SDK is an optional dependency. Everything else is Node only, with no install.
6. Cross-origin calls always need the key. Loopback same-origin use doesn't, unless `--require-key`.

## Open questions

**For James**
1. Should the engine decide a tick's people concurrently itself, rather than through passes?
2. The `world/` mapping (`bus` → `transit`, node IDs, `bike_bloor` with no track).
3. Should the request carry history, so every engine's cache key has it?

**For Meet**
4. The fixture assumption ledgers miss runner IDs (`mode_costs`, `bike_route_response`, `synthetic_weekly_budget`,
   `purchase_propensity`).
5. The fare fixture's geography still says Morningside.
6. Should Bathurst–Spadina age and household marginals be added?

**For Aadit**
7. Keep the access key out of URLs: same-origin needs none locally.
