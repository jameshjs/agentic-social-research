# Deploy: Vultr VM `htv-counterfactual-api`

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| `api/server.js` (site + API, zero deps) | Vultr Cloud Compute `vc2-1c-2gb`, Toronto (`yto`), Ubuntu 24.04, `155.138.141.130`, instance `ed20bd3a-c885-4874-96ef-302e4b6fe946` | systemd `counterfactual.service`, user `app`, `127.0.0.1:8080`, code read-only in `/srv/counterfactual` (owned by root) |
| HTTPS | Caddy (official apt repo) on the same VM | `https://155-138-141-130.sslip.io` → `127.0.0.1:8080`; Let's Encrypt cert via Caddy; `http://` and the bare IP redirect to HTTPS |
| Paired runs and sweeps | 2 worker threads inside the service | warmed with both prepared runs at start; 30 s hard timeout per run, LRU cache |
| Hypothesis compiler | Vultr Serverless Inference `glm-5.3-flash` (`/v1/chat/completions`), called by the VM | Needs `VULTR_INFERENCE_API_KEY` in `/etc/counterfactual.env` (root:app 0640). Without it, `/api/compile` uses the offline rules and says so (`compiler.live:false`) |
| Clef second opinion | Vultr Serverless Inference `clef` (`/v1/systemone`), run offline from a laptop | `experiment/run-world-clef.js`; results are static files served at `/api/clef/fare` and `/api/clef/bike` |

Public URL: <https://155-138-141-130.sslip.io/experience/>. Health: `/api/health` (shows `git_sha`, `git_dirty`, and whether inference is configured).

## Redeploy

```bash
ops/deploy.sh               # rsync allowlisted paths, VERSION, key, systemd unit, Caddy, verify
ops/deploy.sh --skip-key    # code only; keep the VM's /etc/counterfactual.env
ops/deploy.sh --key-only    # refresh the inference key and restart the service
ops/deploy.sh --plain-http  # HTTP on :80 only (if Let's Encrypt issuance fails)
```

The script is idempotent. It copies only `api/ experiment/ world/ data/ experience/ demo-ui/`, `persona-swarm/data/{record,reactions}`, `persona-swarm/runtime/agents-client.js` and five top-level docs, and never `.env*`, `.git`, `node_modules`, `persona-swarm/data/twin` or `persona-swarm/data/city/live`. The server itself also allowlists what it serves.

The key is fetched in memory by `node ops/vultr.js run` and streamed to the VM over SSH stdin; it is never in argv, logs or the synced tree. That fetch uses the Vultr **account** API, which checks the caller's IP against Account → API → Access Control. A VPN such as Cloudflare WARP changes the egress IP (IPv4 and IPv6); add the current addresses or disconnect the VPN, then run `ops/deploy.sh --key-only`.

Logs: `ssh -i ~/.ssh/vultr_htv_ed25519 root@155.138.141.130 journalctl -u counterfactual -f` (one line per request; no bodies, headers or raw IPs).

## Destroy after the event

```bash
node ops/vultr.js instances
node ops/vultr.js destroy ed20bd3a-c885-4874-96ef-302e4b6fe946 --yes
```

Stopped instances keep billing; destroy it. The Serverless Inference subscription is billed per token and can be removed in the Vultr console (Products → Serverless → Inference).

## Costs (list prices, 17 Oct 2026; check the console)

- VM `vc2-1c-2gb`: about $10/month (~$0.014/hour), billed while it exists. Confirm with `node ops/vultr.js plans yto`.
- Compiler `glm-5.3-flash`: $0.10 / $0.35 per million input/output tokens; about 1,000–1,700 tokens per compile in the probe, so well under $0.001 each. The server caps live compiles at 200/day and 6/min per IP.
- Clef: $0.10 per million input tokens. The saved fare + bike second opinion used 340 calls and 264,773 input tokens (about $0.03).
