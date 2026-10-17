# Team sync — 17 October 2026

This is the short handoff for Meet, Aadit, Steven, James, and their coding agents. Read [AGENTS.md](./AGENTS.md) and [prd.md](./prd.md) for the product contract. This snapshot includes Steven's `steven/persona-tuning-loop` merge and a standalone paired experiment slice; teammates may have additional work in progress elsewhere.

## Founder decision: consolidate the city now

**One public website, one detailed world, two policy switches.** The public route stays `/experience/`. Both the TTC +$0.50 adult-fare example (Fair Pass unchanged) and hypothetical Bloor cycle-track removal now use James's Bathurst–Spadina Bloor world as the common map and rule layer. `?demo=fare` and `?demo=bike` are selectors for the **same city and `RunResult` pipeline**, not two separate 3D demos. Aadit adapts the existing website; do not build a new site or promote `/world/preview.html` as the product. Preserve the current inspector, chart, and scenario work as migration components until one end-to-end trace replaces them. The two policies survive; the two separate map experiences are cancelled.

**Data boundary:** Moving the fare demo from UTSC to Bloor does not move UTSC census marginals, local bus service, or Scarborough profiles with it. Citywide fare/Fair Pass rules transfer; local buildings, shops, movement counts and Line 2/510/511 schedules come from [`world/`](./world/README.md). Household and retail behavior remain explicitly synthetic. The Shaw–Avenue bike-lane literature is broader context, not a measured removal response for this specific Bathurst–Spadina section.

## Pull now

```sh
git fetch origin
git status -sb
git pull --ff-only origin main  # only on a clean, non-diverged main
```

**Current code, before consolidation:** `http://127.0.0.1:4173/experience/` is the public route. Today `?demo=fare` still opens the old TTC seeded trace and embedded 3D inspector; `?demo=bike` still opens a separate paired synthetic decision ledger and illustrative city. Reruns currently send `counterfactual:result` from the inspector so outer charts update. Steven's persona research panel reads committed trial records. These fixture paths do **not yet** satisfy the one-world decision above. Do not pitch them as a finished shared AI city or fork another public UI.

## One product, one proof chain

The four-minute demo should show one continuous path:

`freeform hypothesis → generated personas → baseline/proposal decisions → committed WorldEvents → city motion + economic MetricPoints → cited evidence challenge → human choice → versioned rerun`.

The same service and `RunResult` shape must drive the TTC fare and Bloor cases. A third unprepared question must start the generic speculative path and label unsupported metrics **not estimable**. Do not describe the current prepared animations as autonomous agent decisions or the 2025 Bloor counter as a removal forecast.

## Current integration boundary

| Surface on `main` | Present | Next connection |
| --- | --- | --- |
| Canonical public UI | `experience/` includes the TTC trace-backed inspector and Bloor event-backed decision ledger and charts. The outer flyover, Bloor city motion and optional branch storyboards remain illustrative. | Aadit + James: integrate the Bathurst–Spadina world into **this existing website**. Both scenario selectors must render the same geography and read one authoritative `RunResult`; preserve TTC rerun updates while retiring the two fixture engines. `world/preview.html` stays dev-only. |
| Persona work | Steven's Twin autoresearch loop, 10 recorded check-set trials, Papiers-informed trials, saved reactions, and `/experience/` research panel are merged. Offline tests pass. Final holdout is pending. | Steven + James: produce persistent `PersonaSpec[]` and bounded JSON decisions accepted by the world engine for both prompts. The Twin survey benchmark is separate from the runtime path. |
| World simulation and economic ledger | Aadit's `demo-ui/sim.js` drives the TTC inspector. [`experiment/`](./experiment/README.md) runs both examples through one paired controller with an event ledger. James's new [`world/`](./world/README.md) has mapped Bathurst–Spadina geometry, rules and 11 passing offline tests, but is **not connected** to either public path or `experiment.v1`. | James + Meet: use the new world as the shared spatial/rule layer, reconcile it with `experiment.v1`, then publish one canonical runner/result to Aadit. Both policy levers must operate on the same initial actors and map. Preserve replay, metrics, and causal tests. |
| Research and Papiers | Cited fare/Bloor packs and offline `EvidencePacket` fixtures; CLI installed on Meet's machine | Meet: verify a real Papiers passage plus teammate-authored note. James + Aadit: preserve source IDs and show the note, agent challenge, human decision and changed run. |
| Arbitrary prompts | Composer accepts input; unprepared UI marks results unavailable. Steven's `scripts/plan.py` can plan a prompt and collect group reactions, but its ignored Nemotron pool/groups are absent and this computer has no Anthropic SDK or `.env`; it does not produce world events. | Meet + James + Steven: compile into typed `ScenarioSpec`; connect the planner to the world engine only after generating hypothesis-specific personas and validating actions. Keep missing outcomes marked not estimable. |
| Vultr candidate | [`experiment/vultr-decision.js`](./experiment/vultr-decision.js) maps legal city actions to Vultr's typed `clef` decision endpoint. [`persona-swarm/scripts/plan.py`](./persona-swarm/scripts/plan.py) has an opt-in Vultr-only survey prototype (`glm-5.3` planner, `glm-5.3-flash` reactions). Offline adapter tests pass; no Vultr account/key, live quality probe, hosted backend, or UI connection exists yet. Steven's signed-off Haiku round 3 passed four check-set marks; final scoring is pending. | Prize-strength slice: Meet probes a Vultr structured-chat compiler on fare, Bloor and an unseen prompt; James hosts the canonical paired experiment API on Vultr and runs a small explicit-assumption sweep. Both need live proof, validated contracts and displayed run IDs. Keep Steven's tuned model. Papiers reranking, Clef and GPU are optional after this path works. A VM serving only the current fixture is weak prize evidence. [Full order](./VULTR.md#best-integration-order-for-this-product). |

## Critical integration order

1. **Freeze one Bathurst–Spadina wire contract together.** The present TTC integration passes Aadit's versioned trace from `demo-ui/` to `experience/`; it is an interim adapter, not the final shared schema. Meet + James own `ScenarioSpec`, `WorldEvent`, `MetricPoint`, `RunResult`; Steven agrees persona/action JSON; Aadit agrees the new world's node/edge IDs, coordinates, bicycle/subway cues and a detour target. Publish one JSON fixture and one tiny end-to-end smoke test. Keep the existing experience; the separate world preview is not a second product.
2. **Complete one TTC causal chain in the Bloor world.** A fare change alters an agent's paid Line 2 trip or mode; the event ledger records an arrival or deferral; the same ledger computes household fare outlay, TTC sample receipt, and shop visits. Replay baseline and proposal from the same seed. The UI must show the agent, the change in city motion, and the corresponding chart point. Use citywide fare rules and local transit geometry; do not import UTSC household marginals as Bloor observations.
3. **Run cycle-track removal through that same mapped world.** Use the [Bloor brief](./bloor-bike-demo.md) and local `world/` fixture as distinct context layers. A cyclist can stay, detour, switch, or defer; a shop changes only after arrival/purchase events. Keep zero-driver-time-gain and zero-retail-response cases. Local construction cost, injuries and emissions remain not estimable until proper inputs exist.
4. **Close the Papiers loop.** A teammate writes a real note in Papiers. The agent retrieves the passage and note, evaluates counterevidence, proposes an assumption change, asks a human to accept/edit/reject, then records a new run ID and changed event/metric values. A cached live-demo replay is acceptable if labelled cached; the fallback fixture is labelled agent-curated.
5. **Practice the pitch and submit.** The written rules require an initial Devpost entry with team and categories by **Saturday 9:00 pm ET**. Devpost currently displays a **Sunday 8:00 am EDT** final cutoff, earlier than the written 10:00 am deadline; use 8:00 am until clarified. Confirm GitHub link, write-up, 4-minute pitch and 1-minute Q&A. [Rules](https://hack-the-valley-11.devpost.com/rules), [Devpost overview](https://hack-the-valley-11.devpost.com/).

## Scope decision

The strongest judge story is the **event-backed policy experiment with a real human research intervention**. The Twin autoresearch gym is now built and has a signed-off check-set instruction plus Papiers-informed attempts, but the final holdout remains pending and its instructions have not yet been connected to the city. The isolated paired controller can serve as the city-stage integration fixture; its 8 synthetic people are not Steven's tuned runtime agents. Present survey-task tuning as a measured supporting result and evaluate city decisions separately. The Papiers prize proof should stay attached to the policy experiment so judges can see its effect on the same city and economic output.

Prize fit: the Bloor/TTC cases address a concrete Toronto issue with local source context for the [School of Cities challenge](https://hack-the-valley-11.devpost.com/); household travel costs, shop transactions and public receipts make the economic-inclusion angle only when they are reconciled from events. The [Papiers challenge](https://hack-the-valley-11.devpost.com/) asks for visible human-agent research collaboration, so a real note and versioned rerun matter more than a paper-search screenshot alone.

**Handoff rule:** each owner pushes a small vertical slice and shares the commit hash, changed interface, fixture, and what the next owner can run. Pull/fetch safely per [CLAUDE.md](./CLAUDE.md); do not reset, force push or silently change a shared field.
