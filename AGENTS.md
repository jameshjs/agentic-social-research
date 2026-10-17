# Working instructions for coding agents

## Current shared build decision — one city, two policies (17 Oct)

The founder has superseded the earlier plan for separate TTC and Bloor 3D demos. **Ship one detailed Bloor St W world, Bathurst St to Spadina Ave, inside the existing `/experience/` website.** The two prepared policy examples still exist: (1) a hypothetical +$0.50 adult TTC fare with Fair Pass unchanged and (2) hypothetical removal of the protected Bloor cycle track. Both must use this same mapped world, actors, world controller, `RunResult` contract, renderer, event ledger, and economic dashboard. The existing `?demo=fare` / `?demo=bike` links may remain as scenario selectors within that one experience; they must not open different cities or independent engines. An unprepared prompt still needs the generic speculative path.

[`world/`](./world/README.md) is James's **candidate** Bathurst–Spadina spatial/rule layer. Integrate it into the canonical engine and Aadit's existing city view; `/world/preview.html` is a development preview, **not** a second public website. Preserve useful work from `demo-ui/` and `experiment/` as components/adapters until the replacement produces one trace-backed end-to-end run. Do not create a new top-level site, duplicate city canvas, or parallel result schema. The current public routes are still provisional fixture presentations, not proof this integration is finished.

This move changes source geography. The UTSC/Morningside fare fixture in [demo-data.md](./demo-data.md) and Scarborough entries in [data/ttc_fare_context.json](./data/ttc_fare_context.json) remain research context, **not observed inputs for the Bathurst–Spadina population**. Citywide TTC fare/Fair Pass rules can transfer; use the Bathurst–Spadina world's local GTFS, buildings, businesses, and street counts for the common map. Existing Shaw–Avenue/Bloor literature gives broader context, not a measured removal effect for this 619 m section. Label household traits, shop sales, signal durations and policy responses as assumptions or estimates where appropriate. Show buses only on a sourced route; the mapped section currently supports Line 2 and the 510/511 streetcars.

Read [README.md](./README.md), [prd.md](./prd.md), [research.md](./research.md), [demo-data.md](./demo-data.md), [bloor-bike-demo.md](./bloor-bike-demo.md), [bike-lane-papers.md](./bike-lane-papers.md), [papers.md](./papers.md), and [experience/README.md](./experience/README.md) before proposing architecture or writing features. Those files contain the founder's decisions, hackathon requirements, sponsor descriptions, source links, both prepared demo cases, the visual prototype handoff, fare research, and deadline conflicts. Do not ask teammates to paste those links again. Use [papiers-setup.md](./papiers-setup.md) for CLI sign-in and the sponsor acceptance test.

## Product contract

- This is a **general hypothesis-to-simulation product**. Any freeform hypothesis must start a run. The TTC fare case is one demonstration, not the application architecture.
- Autonomously generate hypothesis-specific, persistent personas for every visible person. A subset uses LLM reasoning; other individuals may use profile-conditioned rules.
- Agents must make state-changing decisions and interact through a shared world/event log. The visual city, economic charts, and decision brief must consume that same log/result JSON.
- The **live city is the primary UI**: moving people, buses, cars, homes, shops, and workplaces are product requirements, not decoration.
- Source-backed and speculative runs must be labeled differently. A result observed inside the simulation is not automatically a real-world forecast.
- The economic dashboard is a core product surface: baseline/proposal metrics for households, firms, public budget, and access where applicable; subgroup comparison; scenario sensitivity; units, time horizon, calculation, and provenance. Unsupported projections, NPV, GDP, or city-wide totals must be explicitly not estimable.
- Human research notes, a question/challenge from agents, and a versioned rerun are required for the primary Papiers track.
- The [fare evidence index](./data/ttc_fare_evidence.json) and [EvidencePacket fixture](./data/ttc_fare_evidence_packet.json) are **agent-curated fallbacks**, not Papiers results or human annotations. Never invent a teammate note, import status, Toronto elasticity, retail-sales coefficient, or business closure. For the pitch, show a completed investigation, evidence evaluation including counterevidence, agent proposed next step, and genuine human contribution.
- One demo scenario must use actual Toronto urban data for the School of Cities track. See [research.md](./research.md) for the sponsor's data catalogue and direct links.
- The earlier UTSC fare [data fixture](./data/toronto_demo_baseline.json) and [demo-data.md](./demo-data.md) remain source research, but the **final prepared presentation geography is Bathurst–Spadina** under the current shared build decision above. Treat any census income and commuting figures as separate neighbourhood marginals. Do not invent their joint distribution or claim a simulated shop closure, City-wide TTC outcome, or emissions reduction as observed fact.
- The second prepared demo is hypothetical [Bloor West bike-lane removal](./bloor-bike-demo.md) with [observed context fixture](./data/bloor_bike_demo.json). Do not invert installation findings into removal coefficients, predict merchant closures/injuries/emissions from those sources, or treat the combined City removal cost as a cost for this segment.
- The [Bloor evidence pack](./bike-lane-papers.md) and [independently prepared observed baseline](./data/bloor_bike_lane_baseline.json) add 11 source summaries and current Toronto counts. Their `B01`-style IDs are local to that pack and differ from IDs in `bloor_bike_demo.json`; reconcile by source URL and claim before joining fixtures.
- `/experience/` is the **canonical public UI**. Aadit's `demo-ui/` is its current embedded TTC inspector module; reuse or adapt it in the experience, not as a second public entry. [`experience/trace-adapter.js`](./experience/trace-adapter.js) maps the current TTC seeded trace into the outer charts, and the inspector sends each version through `counterfactual:result`. Keep rerun updates working while replacing the separate fixture engines with the shared Bathurst–Spadina `RunResult`. The current west-end TTC trace, outer flyover, and Bloor branches are still illustrative; connect city motion and charts to authoritative events before calling them agent decisions.

## Build decisions

- Agree `ScenarioSpec`, `PersonaSpec`, `WorldEvent`, `MetricDefinition`, `MetricPoint`, and `RunResult` contracts early; requirements are in PRD §11.
- Support a known-operator path and a generic speculative JSON-action fallback. Do not execute model-authored code.
- Make baseline and intervention replayable from the same seed and initial state.
- Keep API keys server-side and retain an offline/cached demo.
- For the Vultr prize path, read [VULTR.md](./VULTR.md). It is live and evidence-backed. The site and engine API run on Vultr Cloud Compute ([ops/DEPLOY.md](./ops/DEPLOY.md)). GLM-5.3-flash compiles hypotheses, and Clef gives a recorded second opinion on mapped-run decisions; saved runs are in `experiment/vultr-runs/`. Quote only numbers from those files or `/api/health`. Never call Clef the default decision-maker, and keep Steven's Haiku agents as the persona brain. Keys stay in git-ignored `.env` files or root-only files on the VM.
- Preserve the founder's visual and generality requirements when cutting scope. Reduce scene size, depth, analytics, or agent call count first.

## Event gates

- Written rules require an initial Devpost submission with team members and prize categories by Saturday 17 October 2026, 9:00 pm ET.
- Published Sunday deadlines conflict; use the displayed **8:00 am EDT** Devpost cutoff until organizers clarify. See [research.md](./research.md).
- Devpost requires a GitHub code link, write-up, 4-minute pitch, and 1-minute Q&A.

When implementation choices differ from the PRD, update the decision log in `prd.md` and explain why. Keep source provenance in `research.md` or a dedicated data README when datasets are downloaded.

## Team sync

Four people are implementing concurrently. Fetch at least every 30 minutes during long work, and sync before touching shared schemas or pushing. On a clean `main`, use `git pull --ff-only origin main`; on a dirty or diverged checkout, integrate deliberately without reset, force push, or automatic stash. Claude Code's committed hook performs the safe fetch/fast-forward check before each prompt; see [CLAUDE.md](./CLAUDE.md). Share a pushed commit hash and any changed contract with the other owners.
