# Working instructions for coding agents

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
- The locked Toronto demo uses the observed [data fixture](./data/toronto_demo_baseline.json) and the source/assumption boundaries in [demo-data.md](./demo-data.md). Treat census income and commuting as separate neighbourhood marginals. Do not invent the joint distribution or claim a simulated shop closure, City-wide TTC outcome, or emissions reduction as observed fact.
- The second prepared demo is hypothetical [Bloor West bike-lane removal](./bloor-bike-demo.md) with [observed context fixture](./data/bloor_bike_demo.json). Do not invert installation findings into removal coefficients, predict merchant closures/injuries/emissions from those sources, or treat the combined City removal cost as a cost for this segment.
- The [Bloor evidence pack](./bike-lane-papers.md) and [independently prepared observed baseline](./data/bloor_bike_lane_baseline.json) add 11 source summaries and current Toronto counts. Their `B01`-style IDs are local to that pack and differ from IDs in `bloor_bike_demo.json`; reconcile by source URL and claim before joining fixtures.
- `/experience/` is the **canonical public UI**. Aadit's `demo-ui/` is its embedded TTC inspector module; build new shared screens in the experience, not a second public entry. [`experience/trace-adapter.js`](./experience/trace-adapter.js) maps the current TTC seeded trace into the outer charts, and the inspector sends each version through `counterfactual:result`. Keep this message contract working on every rerun. The TTC trace is a synthetic rule-engine stand-in in a schematic west-end district, not the locked UTSC-area Toronto baseline or Steven's live AI swarm. The outer city flyover and the Bloor metrics/branches remain illustrative. Connect them to an authoritative shared `RunResult` before claiming their animations are agent decisions.

## Build decisions

- Agree `ScenarioSpec`, `PersonaSpec`, `WorldEvent`, `MetricDefinition`, `MetricPoint`, and `RunResult` contracts early; requirements are in PRD §11.
- Support a known-operator path and a generic speculative JSON-action fallback. Do not execute model-authored code.
- Make baseline and intervention replayable from the same seed and initial state.
- Keep API keys server-side and retain an offline/cached demo.
- For the Vultr prize path, read [VULTR.md](./VULTR.md). The candidate `clef` adapter in `experiment/` is server-side and tested against a mock response; do not claim a live Vultr run until an account/key, a clean probe, and a hosted backend exist. Keep Steven's Haiku-tuned survey benchmark separate from city decision validation.
- Preserve the founder's visual and generality requirements when cutting scope. Reduce scene size, depth, analytics, or agent call count first.

## Event gates

- Written rules require an initial Devpost submission with team members and prize categories by Saturday 17 October 2026, 9:00 pm ET.
- Published Sunday deadlines conflict; use the displayed **8:00 am EDT** Devpost cutoff until organizers clarify. See [research.md](./research.md).
- Devpost requires a GitHub code link, write-up, 4-minute pitch, and 1-minute Q&A.

When implementation choices differ from the PRD, update the decision log in `prd.md` and explain why. Keep source provenance in `research.md` or a dedicated data README when datasets are downloaded.

## Team sync

Four people are implementing concurrently. Fetch at least every 30 minutes during long work, and sync before touching shared schemas or pushing. On a clean `main`, use `git pull --ff-only origin main`; on a dirty or diverged checkout, integrate deliberately without reset, force push, or automatic stash. Claude Code's committed hook performs the safe fetch/fast-forward check before each prompt; see [CLAUDE.md](./CLAUDE.md). Share a pushed commit hash and any changed contract with the other owners.
