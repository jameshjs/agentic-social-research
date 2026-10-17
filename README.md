# Counterfactual Lab — Hack the Valley 11

A general, human-guided social simulation and policy decision product. Enter **any hypothesis**; the system generates relevant synthetic personas, lets them act and interact in a live city, compares baseline with intervention, and explains the simulated effects. A linked economic dashboard shows household, business, public-budget, and access impacts with charts, scenario trajectories, subgroup comparisons, and uncertainty. When evidence is thin, it still runs and labels the output as speculative. The live world is the primary interface; the decision dashboard and cited brief explain what a policymaker could and could not conclude.

**Build status (17 Oct, 13:30 ET):** the consolidation is on `main`. `/experience/` runs **both prepared policies on one mapped Bloor St W world, Bathurst St to Spadina Ave**: the TTC adult fare +$0.50 with Fair Pass unchanged, and removal of the protected cycle track. Both use the same 19 synthetic people, James's Game Master sandbox, one `experiment.v2` RunResult, the event-driven map, the shared decision ledger and five charts. `?demo=fare` and `?demo=bike` select the policy. Freeform prompts are compiled into sandbox levers, by Vultr GLM when the backend is up and by offline rules otherwise. They run on the same map or stay *speculative / not estimable*. Steven's 100 Haiku persona agents rate any policy 1–5 in the same page. **Live:** <https://155-138-141-130.sslip.io/experience/> on Vultr Cloud Compute (Toronto). See [Run and replicate](#run-and-replicate) and [VULTR.md](./VULTR.md).

## Start here

**Current team handoff:** [TEAM_SYNC.md](./TEAM_SYNC.md) records what is on `main`, the Bloor UI commit, and the next shared integration path. Read it before starting a new work block.

1. [Product requirements](./prd.md) — final product scope, user flow, P0 acceptance criteria, architecture, data contracts, visual requirements, named team workstreams, demo, and implementation gaps.
2. [Research and source dossier](./research.md) — sponsor briefs, event rules/deadline conflicts, hacker package, Toronto dataset catalogue, and modelling evidence. Teammates and coding agents should read this before researching from scratch.
3. [Earlier UTSC fare research and ranked data](./demo-data.md) — useful fare rules and causal-chain design. Its local Scarborough observations are **not** inputs for the final Bathurst–Spadina map. [Earlier source fixture](./data/toronto_demo_baseline.json).
4. [Broader Bloor bike-lane research brief](./bloor-bike-demo.md) and [scenario research fixture](./data/bloor_bike_demo.json) — hypothetical removal, observed cycling/business context, visual beats, and claim limits. Its Shaw–Avenue study geography is broader than the final mapped section.
5. [Bloor evidence pack](./bike-lane-papers.md), [observed Toronto baseline](./data/bloor_bike_lane_baseline.json), [11-source index](./data/bike_lane_evidence.json), and [offline EvidencePacket](./data/bike_lane_evidence_packet.json) — independently prepared research inputs for the now-selected second demo. Keep source IDs and observation periods distinct until the engine contract is reconciled.
6. [Consolidated city experience](./experience/README.md) — the canonical `/experience/` route. It holds the cinematic entry, the mapped paired run that drives both policies (event-driven map, shared ledger, versioned rerun, five charts), the compiled-prompt path, Steven's 100-agent showcase and his persona research record. The earlier TTC inspector is kept as a labelled prototype.
7. [Coding-agent instructions](./AGENTS.md) and [Claude Code instructions](./CLAUDE.md) — shared implementation contract, owner boundaries, and safe Git sync. The committed [Claude hook](./.claude/hooks/sync-main.py) fetches before each prompt and fast forwards only a clean `main`.
8. [Fare-demo paper and evidence pack](./papers.md) with a [machine-readable source index](./data/ttc_fare_evidence.json) and [offline EvidencePacket fixture](./data/ttc_fare_evidence_packet.json) — 15 relevant studies/reports, what each supports, conflicting evidence, and explicit transfer limits. [Papiers CLI setup](./papiers-setup.md) shows how to curate them in the team's library and demonstrate a real human note. [Extended TTC context](./data/ttc_fare_context.json) adds current fares and the 47-fare cap, Fair Pass rules and enrollment (2026 budget), system ridership, scheduled bus service near UTSC (GTFS), and seven Scarborough neighbourhood profiles. It extends, and does not change, the locked baseline fixture.
9. [Final demo runbook](./FINAL_DEMO.md) — the current four-minute walkthrough, honest claim boundaries, remaining completion gates, and the submission checklist.
10. [Paired city experiment](./experiment/README.md) — executable fare and Bloor baseline/intervention controller, synthetic persona fixture, event ledger, metrics, deterministic replay, and owner integration contract.
11. **Candidate common map:** [Bloor section sandbox](./world/README.md): a rule-enforcing street graph for Bloor St W, Bathurst to Spadina, with real counts, signals, crosswalks, cycle tracks, Line 2 schedules, 925 buildings, 243 businesses and an estimated population heat map. `/world/preview.html` is for development only.
12. [Vultr usage, with evidence](./VULTR.md). Cloud Compute hosts the site and engine API. Serverless Inference GLM-5.3-flash compiles hypotheses: 4/4 correct, 0 fallbacks. Clef gave a typed second opinion on all 448 mapped-run decisions (340 live calls, 0 errors, 91% agreement, both paired checks pass). Infrastructure is code in [`ops/`](./ops/). Saved runs are in [`experiment/vultr-runs/`](./experiment/vultr-runs/).

## Run and replicate

Node 22 and Python 3 only; no `npm install` outside the optional Anthropic SDK in Steven's runtime.

| What | Command (from the repo root) | Open |
| --- | --- | --- |
| Hosted demo (nothing to install) | — | <https://155-138-141-130.sslip.io/experience/?demo=bike> |
| Static site | `python3 -m http.server 4173 --bind 127.0.0.1` | <http://127.0.0.1:4173/experience/>. Paired runs execute in the browser, or on the Vultr engine when it answers (localhost pages may call it). Add `?engine=off` to force the browser. |
| Site + engine API locally | `node api/server.js --port 8080` (live Vultr compiler: `node ops/vultr.js run -- node api/server.js --port 8080`) | <http://127.0.0.1:8080/experience/> |
| Steven's 100 persona agents | `cp persona-swarm/.env.example persona-swarm/.env`, set `AGENT_BACKEND` (`local` on Steven's laptop; `remote` + the URL/key he DMs; or `replay` offline), then `npm --prefix persona-swarm/runtime start` | <http://127.0.0.1:4174/experience/> ([RUNTIME.md](./persona-swarm/RUNTIME.md)) |
| Hosted agents via Steven's laptop | Steven: agent server on `:4179` + SSH reverse tunnel | [ops/agents-tunnel.md](./ops/agents-tunnel.md). No login; Steven's plan limit is the only cap. |
| One paired run, CLI | `node experiment/run-world.js fare` or `bike` | prints the `experiment.v2` RunResult |
| All tests (offline) | `node --test experiment/test-world-runner.js experience/test-world-run-adapter.js experiment/test-scenario-compiler.js experiment/test-runner.js experience/test-experiment-adapter.js experience/test-trace-adapter.js world/test-sandbox.js experiment/test-vultr-decision.js api/test-server.js` and `npm --prefix persona-swarm/runtime test` | 87 + 47 tests |
| Vultr: provision, deploy, live probes | `node ops/vultr.js check`, `ops/deploy.sh`, `node ops/vultr.js run -- node experiment/run-world-clef.js both` | [VULTR.md](./VULTR.md), [ops/DEPLOY.md](./ops/DEPLOY.md) |

Keys live only in the git-ignored `.env` files (repo root: `VULTR_API_KEY`; `persona-swarm/.env`: Steven's backend settings) and on the VM in root-only files. They never go in git, chat, the browser or a command line.

## Confirmed direction

- **Primary prize:** [Papiers Autoresearch](https://hack-the-valley-11.devpost.com/) — agents must use human research notes and judgment, ask for expertise, and show a human-guided revision.
- **Papiers integration:** The research orchestrator will read a curated library of analogous papers and human annotations through [Papiers' documented read-only CLI](https://wiki.papiers.ai/docs/agents), propose cited assumptions, and ask a person before changing the experiment. The live path needs a token; a local cited fixture backs up the demo.
- **Current Papiers status:** Meet installed CLI `0.1.5`; authentication and a real library passage/note are still pending. The checked-in paper pack is agent-curated research, not a claim of a completed Papiers integration. See [setup and acceptance test](./papiers-setup.md).
- **Secondary prize:** [U of T School of Cities](https://hack-the-valley-11.devpost.com/) — one demo must address a concrete Toronto urban issue using Toronto data. [Sponsor data guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk).
- **Additional category:** sustainable FinTech & Economic Inclusion, if the demo actually explains household/business economic effects.
- **Generality proof:** two different live hypotheses pass through one system, plus an unprepared prompt exercises the speculative fallback.
- **Visual proof:** buses, cars, people, homes, shops, and workplaces react to logged agent decisions. Visual changes and metrics come from the same run result.
- **Decision proof:** A city action links to a charted economic effect; the dashboard compares status quo and proposal, affected groups, future scenario paths, assumptions, and missing evidence. Unsupported forecasts are marked not estimable.
- **Prepared policy pair in one map:** A $0.50 adult TTC fare increase (Fair Pass unchanged) and hypothetical removal of the protected Bloor cycle track, both in the Bathurst–Spadina section. An unprepared prompt tests the generic speculative path; an Ontario minimum-wage prompt is an optional cross-domain test. Both prepared cases should show branching choices, local business activity, household economics, and limitations from the same system.
- **Owners:** Aadit — city and dashboard frontend; Steven — personas and AI decisions; James — world engine, metric computation, orchestrator, and backend; Meet — hypothesis compiler, metric definitions, evidence and human research loop, integration, pitch, and submission.

## Event-critical facts

- Written rules require an **initial Devpost entry by Saturday, 17 October 2026 at 9:00 pm ET**, including team members and prize categories.
- Published final times conflict: [Devpost dates](https://hack-the-valley-11.devpost.com/details/dates) show **Sunday 8:00 am EDT**; [written rules](https://hack-the-valley-11.devpost.com/rules) say 10:00 am ET; [live schedule](https://hackthevalley.io/schedule) says 9:30 am. **Use 8:00 am as the cutoff** until organizers clarify. Internal target: 5:30 am.
- Devpost requires a **GitHub code link** to be judged, a write-up, a **4-minute pitch**, and **1-minute Q&A**.
- Teams may have up to **4** members. Event code must be created within the official hackathon window under the [rules](https://hack-the-valley-11.devpost.com/rules).
- School of Cities workshop: Friday 10:00–11:00 pm, IA 2100. Papier.ai workshop: Saturday noon–1:00 pm, IA 2160, per [live schedule](https://hackthevalley.io/schedule).

## Repository state

**On `main`:**

- **Canonical engine.** [`experiment/world-runner.js`](./experiment/world-runner.js) and [`world-fixtures.js`](./experiment/world-fixtures.js) produce `experiment.v2`: paired baseline/policy runs on James's [`world/`](./world/README.md) Game Master sandbox, with calibrated background traffic. Both policies share 19 persistent synthetic people (12 mapped homes, 7 visitors), six real OSM shops and seed 42. Every move, wait, crosswalk, Line 2 boarding, fare and shop entry is validated by the sandbox, and 0 actions were rejected. Metrics are reduced from committed events.
  - Fare: 8 changed choices. Fair Pass riders are untouched, and a shop-hours cascade appears at Dollarama.
  - Bike: 15 changed choices. Three riders move to TTC and one takes a side street. Cycling shared with cars rises from 0 to 1,135 m in period 4, and drivers gain no time.
- **Public UI.** [`experience/`](./experience/README.md) replays those events on the map. The ledger and charts read the same RunResult, and a sensitivity rerun versions the run.
- **Compiler.** [`experiment/scenario-compiler.js`](./experiment/scenario-compiler.js) (Vultr GLM or offline rules) turns freeform prompts into validated levers.
- **Backend.** [`api/server.js`](./api/README.md) is deployed on Vultr.
- **Persona agents.** Steven's [persona runtime](./persona-swarm/RUNTIME.md) serves 100 Twin-tuned Haiku agents for 1–5 policy reactions on his Claude plan.

**Still open:** a live Papiers passage plus a genuine human note driving a versioned rerun (the [Papiers setup](./papiers-setup.md) is not signed in). Calibrated Toronto outcomes are out of scope; every result is synthetic and assumption-driven.

## Four-person Git handoff

Each owner starts from current `main`, fetches at least every 30 minutes during a long work session, and syncs before editing shared schemas or pushing. Claude Code does this on every new prompt when a fast forward is safe. If local changes prevent a pull, finish and commit the current slice, then integrate the fetched commits deliberately. Share each pushed commit hash and any schema change with the team; never reset or force push to bypass someone else's work. Full ownership and cadence are in [PRD §14](./prd.md#14-team-ownership-and-critical-path).

### Next pull: consolidated UI handoff (17 Oct)

- **All four / coding agents:** pull `main`, then read [TEAM_SYNC.md](./TEAM_SYNC.md), [experience/README.md](./experience/README.md), and [world/README.md](./world/README.md). The prepared pair is TTC fare and Bloor removal in **one Bathurst–Spadina world**. `/experience/` is the only public UI route; `demo-ui/` is its TTC inspector module, and `/world/preview.html` is a development preview. The current TTC trace is a deterministic stand-in, not the shared production `RunResult`.
- **Meet:** finish local Papiers sign-in, have a real team member annotate F03 and F11 in the Papiers app, verify `search`/`read` returns the original passage and note, then wire the adapter. The CLI is installed on Meet's machine but currently has no token.
- **Steven + James:** use the two scenario briefs and evidence fixture for autonomous investigation, evidence-for/against evaluation, proposed sensitivity experiment, and a versioned human-approved rerun. Agree bicycle/subway action cues and detour targets with Aadit; keep source and transfer warnings beside each parameter.
- **Aadit:** review the [cinematic experience](./experience/README.md) as a front-end shell around the shared city inspector. Connect its animation, sector graph and charts to James's actual event/metric payload. Make the source, conflicting evidence, agent next step, human choice, and changed run visible.
