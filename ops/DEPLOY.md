# Deploy: Vultr VM `htv-counterfactual-api`

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| `api/server.js` (site + API, zero deps) | Vultr Cloud Compute `vc2-1c-2gb`, Toronto (`yto`), Ubuntu 24.04, `155.138.141.130`, instance `ed20bd3a-c885-4874-96ef-302e4b6fe946` | systemd `counterfactual.service`, user `app`, `127.0.0.1:8080`, code read-only in `/srv/counterfactual` (owned by root) |
| HTTPS | Caddy (official apt repo) on the same VM | `https://twotwosmyworld.select`, `https://www.twotwosmyworld.select`, and the original `https://155-138-141-130.sslip.io` → `127.0.0.1:8080`; automatic certificates via Caddy; bare IP redirects to the root custom domain |
| Paired runs and sweeps | 2 worker threads inside the service | warmed with both prepared runs at start; 30 s hard timeout per run, LRU cache |
| Hypothesis compiler | Vultr Serverless Inference `glm-5.3-flash` (`/v1/chat/completions`), called by the VM | Needs `VULTR_INFERENCE_API_KEY` in `/etc/counterfactual.env` (root:app 0640). Without it, `/api/compile` uses the offline rules and says so (`compiler.live:false`) |
| Clef second opinion | Vultr Serverless Inference `clef` (`/v1/systemone`), run offline from a laptop | `experiment/run-world-clef.js`; results are static files served at `/api/clef/fare` and `/api/clef/bike` |

Public URL: <https://twotwosmyworld.select/experience/>. Health: `/api/health` (shows `git_sha`, `git_dirty`, and whether inference is configured). The original `sslip.io` link remains an alias.

Porkbun DNS (verified 17 Oct 2026): root `A → 155.138.141.130` and `www CNAME → twotwosmyworld.select`, both TTL 600. The root, `www`, and legacy HTTPS URLs each returned 200 with a valid certificate; `http://155.138.141.130/experience/` returned 301 to the custom root. Porkbun still has its default wildcard parking CNAME, which does not override the explicit `www` record. [`deploy.sh`](./deploy.sh) keeps all three hostnames in Caddy on future manual redeploys. The CI script still probes the legacy HTTPS alias, so that alias must remain reachable.

## Automatic deployment from GitHub

[`../.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs the offline engine/API and persona-runtime tests on pull requests and pushes. A passing push to `main` then runs [`deploy-ci.sh`](./deploy-ci.sh): it copies the same allowlisted files as the manual deploy, leaves `/etc/counterfactual.env` and Caddy alone, restarts the service, and checks `/experience/`, both paired API runs, and the public HTTPS health endpoint. If a check fails, it restores the previous release and restarts it. The prior release remains on the VM at `/srv/counterfactual.rollback-*` for inspection. A superseded workflow skips deployment; `workflow_dispatch` can redeploy the current `main` commit.

**Activation requires a repository admin.** In GitHub → repository Settings → Secrets and variables → Actions, add a repository secret named `VULTR_DEPLOY_SSH_KEY`. Its value must be the private half of an SSH key whose public half is authorized for `root@155.138.141.130`. Prefer a dedicated, revocable CI key; keep the private half out of git, issues, chat, and workflow logs. The host's ED25519 key is pinned in [`known_hosts`](./known_hosts). The current GitHub collaborator token can push code but does not have repository admin permission to configure secrets. Until the secret is set, the test job works but the production deploy job reports the missing credential and does not change the VM. No Vultr API token or inference key is needed in GitHub Actions; the VM retains its current inference configuration.

After activation, check the Actions run and verify `/api/health.git_sha` equals the pushed commit. If the VM is replaced or its SSH host key changes, verify the new fingerprint independently before updating `known_hosts`.

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
