# api/ — counterfactual engine server

Zero-dependency Node 22 server for the public site and the paired-run API. Deployment: [ops/DEPLOY.md](../ops/DEPLOY.md).

```bash
node api/server.js --port 8080 --host 127.0.0.1   # http://127.0.0.1:8080/experience/
node --test api/test-server.js                    # offline; no key needed
```

Set `VULTR_INFERENCE_API_KEY` in the server environment for live compiles (`node ops/vultr.js run -- node api/server.js --port 8080` locally). `VULTR_COMPILER_MODEL` defaults to `glm-5.3-flash`. `COUNTERFACTUAL_HOST/REGION/PLAN` label where it runs (the systemd unit sets `vultr-cloud-compute`/`yto`/`vc2-1c-2gb`; locally `host` is `local`).

## Static files

Only `/experience/`, `/demo-ui/`, `/data/`, `/experiment/` (`.js`/`.json`), `/world/` (`.js`/`.html`), `/persona-swarm/data/record/` and `/reactions/` (`.json`), `/persona-swarm/runtime/agents-client.js`, and `/bloor-bike-demo.md`, `/bike-lane-papers.md`, `/papers.md`, `/demo-data.md`, `/prd.md`. Everything else, any dotfile, and any `..` (raw or encoded) is 404. `/` redirects to `/experience/`. Text files are gzipped with an ETag; HTML/JS/CSS use `max-age=60`.

## API (JSON, same-origin only)

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/health` | — | `{ok, service, host, region, plan, started_at, git_sha, git_dirty, inference:{configured, compiler_model, decision_model}, runs}` |
| `POST /api/compile` | `{prompt}` ≤ 280 chars, body ≤ 4 KB | `{compiled, spec, served_by}`. `compiled.compiler.live` says whether Vultr compiled it; no key, a provider error, the 200/day live budget or 4 busy live slots → offline rules with a warning. `spec` is runnable (`execution_path:'known_operators'`) or speculative/not estimable. 6/min per IP. |
| `POST /api/run` | `{scenario:'fare'\|'bike', seed?, overrides?}` or `{spec}` | `{result: experiment.v2 RunResult, served_by:{host, region, elapsed_ms, compute_ms, cached, run_id}}`. A `spec` from this server's compile cache is used as is; any other spec contributes only its re-validated `intervention` on the shared Bathurst–Spadina base. 2 worker threads (each warmed with both prepared runs at start), 30 s timeout, LRU cache, 30/min per IP. |
| `POST /api/sweep` | `{scenario, assumption_id, values:[≤5], seed?}` | `{rows:[{value, run_id, elapsed_ms, p4:{baseline, intervention}}], elapsed_ms, host}`. Only `cost_weight`, `unprotected_cycling_discomfort_per_km`, `shop_staffing_response`, within each fixture's declared low–high range. A scenario range, not a confidence interval. 6/min per IP. |
| `GET /api/clef/fare\|bike` | — | The saved Clef second opinion (`experiment/vultr-runs/clef-world-<scenario>.json`), 404 if missing. |

Cross-origin requests (an `Origin` that differs from `Host`) get 403; no CORS headers are sent. Behind the local Caddy proxy the client IP comes from the last `X-Forwarded-For` entry, which is trusted only from loopback. Each request logs one line: time, method, path (no query), status, bytes, duration and a hashed IP.
