# Team sync — 17 October 2026, 16:50 ET

Short handoff for Meet, Aadit, Steven, James and their coding agents. Product contract: [AGENTS.md](./AGENTS.md) and [prd.md](./prd.md). How to run everything: [README → Run and replicate](./README.md#run-and-replicate).

## Current founder decision

**Name: Two Worlds. One public website, one detailed world, two policy levers.** `/experience/` runs the TTC +$0.50 adult fare (Fair Pass unchanged) and hypothetical Bloor cycle-track removal on James's Bathurst–Spadina world. `?demo=fare` and `?demo=bike` are development/deep-link selectors for the **same** city, people, engine and `RunResult`; the public prompt does not show prepared-case buttons. Typed fare and bike-lane hypotheses load their prepared runs. Other prompts use the compiler. `world/preview.html` stays dev-only. UTSC/Scarborough data and wider Shaw–Avenue studies are context, not Bathurst–Spadina observations.

**New UI integration:** Aadit's 100-agent panel now appears before the 3D lab when agents are online. James's MapLibre landing globe flies from Earth to the mapped Bloor section on scroll, with the earlier drawn city as an offline/reduced-motion fallback. The custom logo and **Two Worlds** lockup are on the public route. The 3D tour reads the same `experiment.v2` run to show a changed TTC rider or cyclist in baseline versus policy; the scheduled Route 7 bus is GTFS context, not a ridership count. The two owner branches `aadit/bloor-3d-viewer` and `james/globe-intro` were merged into this checkout. Edit `/experience/` rather than creating another public UI.

## Pull now

```sh
git fetch origin && git status -sb
git pull --ff-only origin main   # only on a clean, non-diverged main
```

## What is on `main` now

| Surface | State | Owner next |
| --- | --- | --- |
| Canonical engine | [`experiment/world-runner.js`](./experiment/world-runner.js) builds the `experiment.v2` RunResult from paired runs on James's sandbox, including his calibrated background traffic. [`world-fixtures.js`](./experiment/world-fixtures.js) holds the one shared 19-person population and the two policy specs. Every travel leg is a Game Master move (0 rejected) and carries map coordinates. Fares, purchases and shop hours are events, and all metrics are reduced from events. 87 offline tests and checked-in snapshots. | James: review the runner against `world/`; any new lever is automatically a `set_lever` intervention. |
| Public UI | `/experience/` has the Earth-to-Bloor landing, freeform prompt, online 100-agent beat, mapped 3D lab, event-backed impact tour and four metric tiles in demo view. Researcher view retains the ledger, rerun, charts, sweep and earlier TTC inspector. The public route has no visible prepared-case selector. | Aadit: polish this same route. Keep `counterfactual:result` on every run. |
| Freeform prompts | [`scenario-compiler.js`](./experiment/scenario-compiler.js) maps a question to the world's 7 levers. It uses Vultr GLM-5.3-flash with a JSON schema when the backend is up, and offline rules otherwise. The validator decides what runs. Runnable prompts (e.g. "Line 2 half as often") run on the same map and people. The rest stay *speculative / not estimable*. | Meet: rehearse one unseen prompt. |
| Persona agents | Steven's [runtime](./persona-swarm/RUNTIME.md) serves 100 Twin-tuned Haiku agents on his Claude plan. They rate the prepared policies or a drafted policy 1–5 in the showcase panel. Their rating dots on the map are labelled illustrative and are an opt-in overlay while a mapped run is shown. | Steven: run `:4179` + tunnel for the hosted demo ([ops/agents-tunnel.md](./ops/agents-tunnel.md)). |
| Vultr | Live at <https://twotwosmyworld.select/experience/> (Cloud Compute, Toronto, Caddy HTTPS), with `www` and legacy HTTPS aliases. Engine API `/api/run`, `/api/sweep`, `/api/compile`, `/api/clef/*`. Clef second opinion on all 448 decisions: 340 calls, 0 errors, 91% agreement, paired checks pass. Evidence: [VULTR.md](./VULTR.md). GitHub Actions verification is green; automatic deploy is waiting for the dedicated `VULTR_DEPLOY_SSH_KEY` secret from a repo admin, so Meet is deploying manually until it is set. | Meet: deploy the merged commit and verify both policy runs. |
| Papiers | CLI installed, not signed in. Offline EvidencePacket fixtures only. | Meet + a teammate: a real annotated passage → agent challenge → human choice → versioned rerun. |

## One proof chain for the 4-minute demo

`freeform hypothesis → compiled levers (Vultr) → same 19 people, baseline vs policy → committed WorldEvents → map motion + ledger + MetricPoints → 100 persona agents' 1–5 reactions → assumption challenge → versioned rerun / Vultr sweep`

Say clearly: the people and responses are synthetic and assumption-driven, the map, schedules and counts are observed, and nothing is a Toronto forecast. Clef is a recorded second opinion, not the default decision-maker.

## Deadlines

- Initial Devpost entry with team and categories by **Saturday 9:00 pm ET**.
- Final cutoff: use Devpost's **Sunday 8:00 am EDT** until organizers clarify.
- Needs a GitHub link, write-up, 4-minute pitch and 1-minute Q&A.
- Select **[MLH] Best Use of Vultr**. The text is in [VULTR.md](./VULTR.md#devpost-text-accurate-paste-as-is).

**Handoff rule:** push small slices, share the commit hash and any changed interface, and never reset or force-push over teammates' work.
