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

Porkbun DNS (verified 17 Oct 2026): root `A → 155.138.141.130` and `www CNAME → twotwosmyworld.select`, both TTL 600. The root, `www`, and legacy HTTPS URLs each returned 200 with a valid certificate; `http://155.138.141.130/experience/` returned 301 to the custom root. Porkbun still has its default wildcard parking CNAME, which does not override the explicit `www` record. [`deploy.sh`](./deploy.sh) keeps all three hostnames in Caddy on every redeploy, manual or CI.

## Automatic deployment from GitHub

[`../.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs the offline engine, API and persona-runtime tests on pull requests and pushes. A passing push to `main` (or **Run workflow** on `main`) then runs the same `ops/deploy.sh --skip-key` a human runs, and checks that `/api/health.git_sha` equals the pushed commit. `--skip-key` leaves the VM's `/etc/counterfactual.env` alone, so no Vultr API key or inference key is needed in GitHub.

The one secret is the repository secret **`VULTR_DEPLOY_SSH_KEY`**: the private half of a dedicated deploy key (comment `two-worlds-github-actions-deploy`, created 17 Oct on Meet's laptop as `~/.ssh/two_worlds_github_deploy`). Its public half is a `restrict` line in root's `authorized_keys` on the VM. It is not Meet's personal key. Without the secret, the deploy job reports "Deploy skipped" and does not touch the VM.

Anyone who can push a workflow to this repo can read that secret and get root on the VM. To revoke it, delete the secret and remove the key from the VM:

```bash
ssh -i ~/.ssh/vultr_htv_ed25519 root@155.138.141.130 "sed -i '/two-worlds-github-actions-deploy/d' /root/.ssh/authorized_keys"
```

The host's ED25519 key is pinned in [`known_hosts`](./known_hosts). If the VM is replaced or its host key changes, verify the new fingerprint independently before updating that file. A manual deploy and a CI deploy should not run at the same time.

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
