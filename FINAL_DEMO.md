# Final demo runbook — Two Worlds

**Updated:** 17 October 2026. **Public route:** `/experience/` (serve from the repository root). This is a live handoff document: verify its status against current `main` before presenting.

**Founder target after this runbook was written:** The two separate city presentations are being consolidated into **one Bathurst–Spadina Bloor map** in `/experience/`; both TTC fare and cycle-track removal stay as policy switches. The walkthrough below is an honest fallback for the **current unconsolidated build**, not the final shared-world pitch. Update it after the common renderer and `RunResult` are connected. See [TEAM_SYNC.md](./TEAM_SYNC.md) for owner handoffs and geography/source limits.

## What is ready on `main`

| Proof | Open | Present accurately |
| --- | --- | --- |
| Cinematic question-to-city journey | `/experience/` | Prepared replays load from the composer. Arbitrary text currently opens an exploratory preview with **no modelled result**. |
| TTC fare causal replay | `/experience/?demo=fare` → “Inspect the living TTC run” | A seeded rule engine moves 54 synthetic people through baseline and policy worlds. The detailed city, event inspector, and outer charts share one versioned trace. The west-end district is schematic, not the UTSC observed baseline or a TTC forecast. |
| Human challenge and rerun | TTC inspector → assumptions → change a slider → rerun | The browser records a local human choice and produces a changed deterministic trace. This is **not** a verified Papiers policy note. |
| Bloor paired experiment | `/experience/?demo=bike` | The decision ledger and five charts now use one paired event run with 8 synthetic people and explicit assumed responses. The animated district, before/after street, and optional alternative branches remain illustrative. Nothing estimates an observed Bloor removal effect. |
| Persona research and Papiers coaching | Any prepared case → “Inspect the persona research” | Ten recorded Twin check-set trials, a human-signed retained instruction, later Papiers-informed rejected trials, and saved US synthetic fare reactions. The final held-out score is pending. These people do not drive the TTC/Bloor city. |

## Four-minute walkthrough using the current build

1. **0:00–0:30 — Ask a question.** Start at `/experience/`, descend through the clouds, choose the TTC fare case. Say: “We compare a baseline city with a proposed fare, then inspect every consequence as a simulated choice.”
2. **0:30–1:30 — Follow a person.** Open the TTC inspector, select a rider just above the Fair Pass cutoff, then show the baseline/policy choice and event trail. Say this is a seeded synthetic prototype and name the unmeasured fare response assumption.
3. **1:30–2:20 — Follow the money.** Show linked household travel spending, sample fare receipts, skipped trips, and shop sales. Change one assumption and rerun. Return to the outer impact map to show it updated from the same trace.
4. **2:20–3:10 — Show agent research under scrutiny.** Open the persona panel. Select retained trial 003, then the Papiers-informed trial 009, and point out that a later trial was rejected. Explain that check-set improvement, human review, and counterevidence are visible; do not call the final holdout complete.
5. **3:10–3:50 — Show transfer to another hypothesis.** Switch to Bloor and open “What the people in this run did.” Click Leila’s shop trip: the paired trace shows the baseline shop entry/purchase and the proposal’s detour to the plaza. Open the impact map to show Bloor-route trips and local shop receipts derived from those events. Say these are synthetic fixture responses, while the moving city and optional branches are still illustrative and the TTC/Bloor trace contracts need reconciliation.
6. **3:50–4:00 — Close with the research question.** “This prototype makes assumptions and downstream paths inspectable. It is not a calibrated policy forecast.”

**Q&A likely to matter:** “Are these real Torontonians?” No: the TTC actors are synthetic; Toronto source fixtures provide context, not individual joint records. “Does Papiers change a policy result yet?” No: Steven's Papiers coaching affected persona prompt trials; the policy evidence/human-rerun integration is still open. “Can I enter anything?” Yes, the composer accepts it; the current fallback labels impacts not estimable rather than inventing a forecast. “Did the AI learn?” The shared instruction was edited and evaluated; model weights were not trained.

## Product completion gates, in order

1. **Shared runtime:** James publishes one `RunResult` fixture and endpoint for TTC, Bloor, and an unprepared prompt. Same seed, baseline/intervention, validated `WorldEvent` actions, event-derived `MetricPoint`s, and source/assumption IDs. The existing TTC adapter is an interim bridge.
2. **Personas in the world:** Steven publishes scenario-specific `PersonaSpec[]` and bounded action JSON consumed by James's world engine. The Twin tuning score measures survey responses only; it cannot stand in for this runtime check. Missing Nemotron pool/groups and API credentials currently prevent running `scripts/plan.py` from a fresh checkout.
3. **One city renderer:** Aadit binds TTC and Bloor motion, timeline, branch choices, and economic charts to the same authoritative run. The hero flyover and Bloor storyboard may remain as labelled previews until that is done.
4. **Primary sponsor loop:** Meet retrieves a genuine human-authored Papiers policy note and paper passage; the orchestrator records a proposed assumption, evidence for/against, an agent next experiment, a real human decision, and a versioned rerun. The persona gym alone should be pitched as supporting research, not a substitute for this policy loop.
5. **Submission:** Initial Devpost entry with all four names and selected categories by **Saturday 17 October, 9:00 pm ET**. Treat **Sunday 18 October, 8:00 am EDT** as the final cutoff while published times conflict. Include the GitHub code link, write-up, 4-minute pitch, and 1-minute Q&A. See [research.md](./research.md) for source links and deadline evidence.

## Local smoke check

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# in another shell:
node experience/test-trace-adapter.js
python3 persona-swarm/scripts/test_swarm.py
python3 persona-swarm/autoresearch/test_autoresearch.py
```

Open `/experience/?demo=fare`, change an inspector assumption and rerun, confirm the outer chart version changes, then open `/experience/?demo=bike` and the persona panel. Check a narrow screen once. Keep the precise claim boundaries in [experience/README.md](./experience/README.md) and [TEAM_SYNC.md](./TEAM_SYNC.md).
