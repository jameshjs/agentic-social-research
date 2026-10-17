# Agent brain and Vultr deployment decision — 17 Oct 2026

## Decision for the hackathon

Use **a split brain with one authoritative world**:

1. **Claude Opus 5.5** continues as Steven's high-level hypothesis planner in `persona-swarm/scripts/plan.py`. It converts a freeform request into a concrete proposal and affected groups. The current script is a survey prototype, not yet the city's scenario compiler.
2. **Claude Haiku 5.5** stays in Steven's persona research and generation path. The retained Twin prompt was tuned and measured on this model; changing it mid-trial would invalidate that comparison. This score measures survey answer likeness, **not** Toronto mobility behavior.
3. **Vultr Serverless Inference `clef`** is the first-choice *candidate* for the live city's frequent bounded person decisions. It accepts a structured world state and returns probabilities over allowed actions through `/v1/systemone`. The existing world controller can consume its selected action, validate it, commit an event, and derive all charts from events. Keep `clef-flash` as a latency/cost challenger and direct TypeSafe **Jev** as a non-Vultr comparison. Do not claim any of them matches human travel behavior before our own evaluation.
4. **Rule-based cohorts** populate the rest of the scene. A Vultr-hosted Node service should own orchestration, the event log, cache, API keys, and the `RunResult`; the browser renders that result. The two prepared cases retain saved offline replays.

This gives Vultr a central job in the actual simulation. The [Devpost Vultr category](https://hack-the-valley-11.devpost.com/) asks for use of its cloud infrastructure; it does not require a GPU. Deploying a static landing page alone would be a weaker demonstration of the infrastructure's role. Serverless inference avoids spending hackathon hours serving model weights, while a CPU instance can host the real orchestration path. This is our prize strategy, not a guarantee of eligibility or judging outcome.

## What is already implemented

[`experiment/vultr-decision.js`](./experiment/vultr-decision.js) is a server-side adapter for the bounded `decide(request)` callback in [`experiment/runner.js`](./experiment/runner.js). It sends only the current persona/trip/world state and the legal actions, checks the exact returned model ID, rejects an illegal choice, retries rate limits and temporary errors, and returns `{action, provider, reason}` plus the model distribution and token usage in the replay cache. The world still commits every event and computes metrics; the model cannot author events, totals, or code. The runner reuses a choice for identical states across the paired worlds and can replay saved decisions without a model call.

[`experiment/run-vultr.js`](./experiment/run-vultr.js) is a **local server-side smoke test**, not a deployed backend. It refuses to emit a clean live result if any decision fell back after an API failure. Tested with a mocked API and existing controller tests; **no live Vultr call has been made** because the team does not yet have an account/key. The public UI is not wired to this adapter. Do not pitch a fixture replay as Vultr inference.

## Why these model roles

| Candidate | Best role | Reason | Current risk |
| --- | --- | --- | --- |
| Claude Opus 5.5 | Planner, experiment design, evidence challenge | Already in Steven's prototype for complex freeform planning | Slow/costly per-person; does not itself simulate the city |
| Claude Haiku 5.5 | Persona generation and quality reference for deep decisions | Existing tuned Twin prompt and low-cost text/JSON generation | Survey score does not validate transport choices; many serial calls may exceed demo latency |
| Vultr `clef` | **Candidate live bounded action brain** | Native typed choice over 1–255 legal options; returns full probabilities without generated text; runs on Vultr | Unmeasured on our mobility cases; probability values are not calibrated travel propensities |
| Vultr `clef-flash` | Challenger if `clef` is too slow | Lower published input price | Must demonstrate comparable action quality first |
| TypeSafe Jev direct API | Comparison for the same bounded task | Compatible `/v1/systemone` shape, likely fast | Direct Jev calls do not demonstrate Vultr inference; separate account/key needed |
| Vultr chat model such as `deepseek-v4.1-flash` | Optional Vultr-only compiler/brief challenger | General text generation through OpenAI-compatible API | Would require a fresh quality check against the current planner and JSON contracts |
| Self-hosted model on Vultr Cloud GPU | Later optimization only | Maximum control over model serving | Account/credit/region/weights/operations still unverified; risks the demo for no required judging benefit |

The public [Vultr model catalog](https://api.vultrinference.com/docs/models) lists `clef` at **$0.10 per million input tokens** and `clef-flash` at **$0.05 per million input tokens** as of 17 Oct; [its decision endpoint](https://api.vultrinference.com/docs/reference/create-systemone) bills each question's state and options as input and no output tokens. [Haiku 5.5's published price](https://www.anthropic.com/claude-haiku-5-5) is $0.10 input/$0.50 output per million tokens for prompts up to 100k. These are list prices, not measured run costs. Check the live model list and actual subscription before setting a spending cap.

## First account-to-demo path

1. One team member creates the [Vultr account and claims MLH hackathon credits](https://discover.vultr.com/mlh). Confirm the credit amount, whether **Serverless Inference** is covered, and whether payment verification is required. No account exists yet; do this before promising a hosted URL.
2. In Vultr Console: **Products → Serverless → Inference → Add Serverless Inference**, then retrieve the subscription key. [Provisioning guide](https://docs.vultr.com/products/compute/serverless-inference/provisioning). Keep the key only in the server environment or local shell, never in `experience/`, commits, screenshots, or a browser request.
3. Check the live catalog using the public `GET https://api.vultrinference.com/v1/models`; confirm `clef` is still available. The [quickstart](https://api.vultrinference.com/docs/get-started/quickstart) warns that unknown **chat** model IDs silently fall back to a default; the adapter also checks the returned ID for decision calls.
4. From the repo root, in a private shell with `VULTR_INFERENCE_API_KEY` exported, run `node experiment/probe-vultr.js --dry-run` to inspect the 8 paired cases, then `node experiment/probe-vultr.js > /tmp/vultr-clef-probe.json`. To compare `clef-flash`, set `VULTR_DECISION_MODEL=clef-flash` and save a second probe. Review both before the full runs: `node experiment/run-vultr.js bike > /tmp/bike-vultr.json` and `node experiment/run-vultr.js fare > /tmp/fare-vultr.json`. Stderr reports calls, tokens, and fallbacks. Each full output contains a `decision_replay` for a reliable rerun. Never commit a raw token or a trace containing private inputs.
5. Inspect the probe's **four paired personas in each case** before using live decisions on stage. For fare, check that Fair Pass riders do not respond to a fare that did not change; for Bloor, check that a safety-sensitive cyclist does not become *more* likely to take the unprotected route merely because protection was removed. Review a driver and an unaffected person as negative controls. Report **legal action rate, provider fallbacks, paired consistency, differing group responses, median/p95 decision latency, total run latency, and tokens/cost**. These are engineering and face-validity checks, not empirical transport validation.
6. Freeze a successful live `RunResult` and show it in the public UI with a visible **live/cached** label. If the model violates the action/latency gate, use Haiku for deep decisions and Vultr for the actual Node orchestrator; describe exactly which part ran on Vultr. Avoid a claim that the failover run used Vultr inference.
7. Once James's canonical backend is ready, deploy that backend and event store on a small Vultr CPU instance, with the key in server environment variables; call the decision adapter from the backend. [VX1 is offered for general purpose compute](https://docs.vultr.com/product-overviews/vx1-cloud-compute), but availability is location-dependent. A regular Cloud Compute VM is acceptable if VX1 is unavailable. Put HTTPS in front of the API and give the browser only result/event JSON. Keep the two cached cases on the server for network failure.

### Quality gate and fallback

**Promote `clef` to demo default only if** all live choices are legal, both scenario runs complete within the roughly 90-second product target, the four paired checks above look plausible after human inspection, and no provider fallback occurs in the saved demo result. Compare `clef-flash` and Haiku on the *same requests*, not against Steven's survey metric. If there is no Vultr key or account in time, the offline run remains available but the team must not claim a live Vultr integration or submit to the category on that basis alone.

The model's distribution is **not** an estimated Toronto mode-share or intervention effect. Any actual policy effect remains assumption-driven and the public result must keep its evidence tier, source links, and `not_estimable` metrics.

## Operational notes

- Serverless Inference [defaults to 120 requests/minute per model and up to 16 concurrent chat requests](https://api.vultrinference.com/docs/concepts/limits); decision endpoint limits should be confirmed for the subscription. With a mocked always-valid provider, the current 8-person × 2-trip × 4-tick fixture makes **112 distinct provider calls per scenario** after identical-state replay (128 total decisions). Latency, more than list-price tokens, may be the binding constraint; measure a real full run before stage use. The adapter respects `Retry-After` and retries temporary failures; the CLI fails if any action used a fallback.
- A CPU VM should run the shared service, event replay, metrics, and evidence orchestration. The frontend must never call Vultr with an API key. Do not split economic metric computation into a separate LLM answer.
- Vultr [bills deployed servers at least one hour and continues billing stopped servers](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers); destroy unused trial instances after the event. Do not assume promotional credits cover every product.
- Include **[MLH] Best Use of Vultr** in the Devpost category selection when a real Vultr service powers the working project. Record the actual model, instance type, region, and live request/result screenshot for the write-up. The submission also needs a GitHub code link and must respect the earlier published **Sunday 8:00 am EDT** cutoff.

## Sources checked

- [Hack the Valley 11 prizes and judging](https://hack-the-valley-11.devpost.com/)
- [Vultr Serverless Inference quickstart](https://api.vultrinference.com/docs/get-started/quickstart), [current model/pricing list](https://api.vultrinference.com/docs/models), [typed decision endpoint](https://api.vultrinference.com/docs/reference/create-systemone), [limits](https://api.vultrinference.com/docs/concepts/limits)
- [Vultr MLH credits](https://discover.vultr.com/mlh), [Serverless provisioning](https://docs.vultr.com/products/compute/serverless-inference/provisioning), [VX1 compute](https://docs.vultr.com/product-overviews/vx1-cloud-compute), [server billing](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers)
- [Anthropic Haiku 5.5 release and pricing](https://www.anthropic.com/claude-haiku-5-5), [TypeSafe System One API](https://api.typesafe.ai/redoc)
