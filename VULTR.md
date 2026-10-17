# Vultr in Counterfactual Lab — what runs where, with evidence

**Status (17 Oct 2026, 13:10 ET):** live. The public site is served by Vultr. Its engine API and both Vultr Serverless Inference endpoints have been exercised. Every number below comes from a saved file in [`experiment/vultr-runs/`](./experiment/vultr-runs/) or the live `/api/health` response. Re-run the commands in [Replicate it](#replicate-it) to regenerate them. Nothing on this page is a projection.

**Division of labour (team decision):** Steven's Twin-tuned **Claude Haiku persona agents** remain the core human-likeness result. His 100 agents run on his Claude plan through [`persona-swarm/runtime/`](./persona-swarm/RUNTIME.md). Vultr does four other jobs: it hosts the public product, it runs the paired experiments and sensitivity sweeps, it compiles freeform hypotheses into typed scenarios, and it gives an independent typed second opinion on every trip decision (Clef). Claude weights cannot run on Vultr, and we do not claim they do.

## The four Vultr jobs

| # | Vultr product | Endpoint / resource | Job in the product | Evidence |
| --- | --- | --- | --- | --- |
| 1 | **Cloud Compute** VM `vc2-1c-2gb`, Toronto (`yto`), Ubuntu 24.04 | `https://155-138-141-130.sslip.io` (Caddy + Let's Encrypt → `api/server.js`) | Serves the public `/experience/` site and the engine API. Runs paired baseline/policy worlds on the mapped Bathurst–Spadina section in two worker threads. Runs bounded assumption sweeps. | `GET /api/health` reports `host: vultr-cloud-compute`, `region: yto`, and the deployed `git_sha`. Every `/api/run` and `/api/sweep` response carries `served_by.host`, `elapsed_ms` and `run_id`. |
| 2 | **Serverless Inference — chat completions** with JSON-schema structured output | `POST https://api.vultrinference.com/v1/chat/completions`, model `glm-5.3-flash` | **Hypothesis compiler.** Freeform question → schema-constrained proposal over the world's 7 policy levers. Backend validation rejects anything outside lever bounds. Non-spatial questions become *speculative / not estimable*. Called server-side by `POST /api/compile` on the VM. | [`compiler-probe-glm-5.3-flash-2026-10-17.json`](./experiment/vultr-runs/compiler-probe-glm-5.3-flash-2026-10-17.json): 4 prompts (prepared fare, prepared bike, unseen Line 2 headway, unseen minimum wage), **4/4 expected mappings, 0 fallbacks**, 7.2 s total, 4,732 tokens. |
| 3 | **Serverless Inference — typed decision endpoint** | `POST https://api.vultrinference.com/v1/systemone`, model `clef` | **Second opinion on every agent trip decision.** Each decision is sent with the person's profile, the sandbox-computed minutes, fare and shared-with-cars distance of each legal option. Clef returns one legal choice plus a probability for every option. The paired run decided entirely by Clef is replayed through the same Game Master. | [`clef-world-fare.json`](./experiment/vultr-runs/clef-world-fare.json) and [`clef-world-bike.json`](./experiment/vultr-runs/clef-world-bike.json): **340 live calls, 0 errors**, median 212–216 ms, p95 317–326 ms, 264,773 input tokens. **91.1 % / 90.6 %** agreement with the fixture rule on 224 arm-decisions per scenario. Both paired face-validity checks pass (below). Earlier v1 probe: [`clef-probe-v1-2026-10-17.json`](./experiment/vultr-runs/clef-probe-v1-2026-10-17.json), 16 calls, 0 errors. |
| 4 | **Vultr API v2** (account automation) | `https://api.vultr.com/v2` via [`ops/vultr.js`](./ops/vultr.js) | Infrastructure as code. It created the inference subscription, uploaded the SSH key and provisioned the VM with cloud-init. It deploys with [`ops/deploy.sh`](./ops/deploy.sh). Keys stay in memory, are streamed over SSH stdin, and are never written to the repo. | `node ops/vultr.js check` reports the credit balance, the subscription and the instance. |

### Clef paired face-validity checks (live, 17 Oct)

These are engineering and face-validity checks on synthetic people, not transport validation.

- **Fare: Fair Pass riders ignore an adult-only fare rise.** 9 paired Fair Pass states had identical legal options across both arms. They gave **0 choice changes** and a maximum |ΔP(transit)| of 0.0055. Pass.
- **Bike: safety-sensitive riders never move *onto* Bloor once protection is removed.** 7 paired states had safety sensitivity ≥ 1.5. They gave **0 violations** and a mean ΔP(ride Bloor) of **−0.384**. Pass.
- **Disagreements are reported, not hidden.** Clef disagrees most with the fixture rule for car owners (50 % agreement) and near-cutoff adults (75–84 %). In the Clef-decided paired runs, the fare policy changed 0 decisions (the fixture rule changed 8). Cycle-track removal changed 4: three moves from Bloor to TTC and one side-street detour (the fixture rule changed 15). The model choice moves the result, which is exactly why the UI labels decision providers.

## Architecture

```text
Browser (/experience/, any host)
   │  same-origin JSON
   ▼
Vultr Cloud Compute · Toronto · Caddy HTTPS → api/server.js (Node 22, zero deps)
   ├─ /experience/ …           static allowlist (site, world map, fixtures, saved Vultr runs)
   ├─ POST /api/compile ──────► Vultr Serverless Inference · glm-5.3-flash · json_schema
   │                            → validateCompiled() → toWorldSpec() → runnable spec | speculative
   ├─ POST /api/run    ──────► worker thread: runWorldExperiment() on James's Game Master sandbox
   │                            → experiment.v2 RunResult (events → map motion, charts, ledger)
   ├─ POST /api/sweep  ──────► same engine, ≤5 assumption values, scenario range (not a CI)
   └─ GET  /api/clef/:scenario  saved Clef second opinion (generated by experiment/run-world-clef.js)
                                  └► Vultr Serverless Inference · clef · /v1/systemone

Steven's persona runtime (persona-swarm/runtime/server.js, :4174) — 100 Haiku agents on his Claude plan
   └─ live on his laptop (`local`), or forwarded to it from any teammate server (`remote`), or `replay`
```

Without the backend (e.g. `python3 -m http.server`), the site runs the same `world-runner.js` in the browser and compiles with the offline rules. It labels which path produced each result.

## Replicate it

Prerequisites: Node 22. A Vultr account with an API key under Account → API, with your current IP in its Access Control list. Put `VULTR_API_KEY=<key>` in the repo-root `.env`, which git ignores. Never paste keys into chat, commits or the browser.

```sh
node ops/vultr.js check                     # credit, key permissions, existing resources
node ops/vultr.js inference --yes           # create/find the Serverless Inference subscription; list models
node ops/vultr.js plans yto                 # Toronto CPU plans and prices
node ops/vultr.js create --yes              # one vc2-1c-2gb Ubuntu VM (≈ $0.014/h) with the deploy SSH key
ops/deploy.sh                               # rsync allowlisted code, systemd unit, inference key via stdin, Caddy HTTPS
curl -s https://<ip-with-dashes>.sslip.io/api/health

# Live inference proofs (keys injected into the child process only)
node ops/vultr.js run -- node experiment/probe-vultr-compiler.js            # GLM compiler: 4 prompts
node ops/vultr.js run -- node experiment/run-world-clef.js both             # Clef: ≈340 calls, ≈3 min, ≈$0.03
node ops/vultr.js run -- node experiment/probe-vultr.js                     # Clef v1 probe: 16 calls
```

The deploy SSH key is `~/.ssh/vultr_htv_ed25519`; create it with `ssh-keygen -t ed25519 -N "" -f ~/.ssh/vultr_htv_ed25519`. A VPN such as Cloudflare WARP changes your egress IP. When that happens the account API returns `401 Unauthorized IP`: add the new address, then rerun. Full runbook: [ops/DEPLOY.md](./ops/DEPLOY.md). API reference: [api/README.md](./api/README.md).

## Cost so far (list prices, check the console)

- VM: ≈ $10/month, billed hourly while it exists, **even when stopped**. Destroy it after judging: `node ops/vultr.js destroy ed20bd3a-c885-4874-96ef-302e4b6fe946 --yes`.
- Clef: $0.10 per million input tokens. 356 calls and ≈ 273 k input tokens cost ≈ $0.03.
- GLM-5.3-flash: $0.10 / $0.35 per million input/output tokens. Each compile costs under $0.001. The server caps live compiles at 200/day and 6/min per IP.
- The account started with $100 of credit.

## What we do not claim

- **Not a GPU workload.** The engine is CPU-bound and small, so a GPU would be theatre.
- **Clef does not drive the default public run.** The default run uses the explicit fixture rule. Steven's Haiku agents supply the live persona reactions. Clef is a recorded, labelled second opinion whose paired run can be replayed. Its probabilities are not calibrated Toronto mode shares.
- **Compiler output is a proposal.** It maps a question to levers. The backend validator, not the model, decides what runs. Questions without a lever stay *speculative / not estimable*.
- **No forecast.** Every run is 19 synthetic people in a 619 m sandbox. Nothing in this pipeline makes it a Toronto forecast.

## Devpost text (accurate; paste as is)

> **Best Use of Vultr.** Vultr is the engine room of Counterfactual Lab:
> - **Cloud Compute (Toronto).** Serves the live site and the experiment API. Each "what if" runs as paired baseline and policy worlds on a rule-enforcing map of Bloor St W from Bathurst to Spadina. Bounded sensitivity sweeps run there too. Every response is stamped with the Vultr host and its runtime.
> - **Serverless Inference, GLM-5.3-flash with JSON-schema output.** Compiles any freeform policy question into a validated scenario: 4/4 correct on our probe, including two unseen prompts, with zero fallbacks.
> - **Serverless Inference, Clef typed decisions.** Clef gave a second opinion on all 448 agent trip decisions across both policies: 340 live calls, 0 errors, ≈215 ms median. It agreed with our rule 91% of the time and passed both paired sanity checks: Fair Pass riders ignore an adult-only fare rise, and cautious cyclists never move onto an unprotected Bloor.
> - **Vultr API.** Our scripts provision the inference subscription and the VM and redeploy them reproducibly.
>
> The persona agents themselves are Claude Haiku, tuned on Twin-2K-500. Vultr does the compiling, simulating, hosting and model cross-checking around them.
