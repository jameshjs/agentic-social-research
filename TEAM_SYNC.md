# Team sync — 17 October 2026

This is the short handoff for Meet, Aadit, Steven, James, and their coding agents. Read [AGENTS.md](./AGENTS.md) and [prd.md](./prd.md) for the product contract. This snapshot includes Steven's `steven/persona-tuning-loop` merge and a standalone paired experiment slice; teammates may have additional work in progress elsewhere.

## Pull now

```sh
git fetch origin
git status -sb
git pull --ff-only origin main  # only on a clean, non-diverged main
```

**One public route:** `http://127.0.0.1:4173/experience/` after starting the repository-root server in [experience/README.md](./experience/README.md). `?demo=fare` opens the TTC seeded trace and Aadit's embedded 3D inspector; `?demo=bike` opens the Bloor explorer with a new paired synthetic decision ledger and event-derived charts. The TTC inspector remains under `demo-ui/` as a module and debug route. Its reruns send `counterfactual:result` to the outer experience, where `trace-adapter.js` updates the headline and five sector charts. The **persona research** panel reads Steven's committed trial record and saved reactions. TTC and Bloor use separate fixture engines; Bloor city motion and optional branches are illustrative. Neither is a calibrated Toronto forecast or the shared AI swarm. Do not fork a new public UI.

## One product, one proof chain

The four-minute demo should show one continuous path:

`freeform hypothesis → generated personas → baseline/proposal decisions → committed WorldEvents → city motion + economic MetricPoints → cited evidence challenge → human choice → versioned rerun`.

The same service and `RunResult` shape must drive the TTC fare and Bloor cases. A third unprepared question must start the generic speculative path and label unsupported metrics **not estimable**. Do not describe the current prepared animations as autonomous agent decisions or the 2025 Bloor counter as a removal forecast.

## Current integration boundary

| Surface on `main` | Present | Next connection |
| --- | --- | --- |
| Canonical public UI | `experience/` includes the TTC trace-backed inspector and Bloor event-backed decision ledger and charts. The outer flyover, Bloor city motion and optional branch storyboards remain illustrative. | Aadit + James: make city motion, timelines and optional branches read one authoritative `RunResult`. Preserve the TTC rerun bridge while reconciling the two fixture engines. |
| Persona work | Steven's Twin autoresearch loop, 10 recorded check-set trials, Papiers-informed trials, saved reactions, and `/experience/` research panel are merged. Offline tests pass. Final holdout is pending. | Steven + James: produce persistent `PersonaSpec[]` and bounded JSON decisions accepted by the world engine for both prompts. The Twin survey benchmark is separate from the runtime path. |
| World simulation and economic ledger | Aadit's `demo-ui/sim.js` drives the TTC inspector. [`experiment/`](./experiment/README.md) runs the TTC and Bloor examples through one controller with validated actions, a causal event ledger, event-reduced metrics, and paired replay. The public Bloor ledger and charts consume its Bloor result, but its personas and responses are synthetic fixtures. | James + Meet: reconcile `experiment.v1` with the TTC world service and UI trace shape. Choose one canonical runner and publish its result to Aadit; preserve the causal/reconciliation tests. |
| Research and Papiers | Cited fare/Bloor packs and offline `EvidencePacket` fixtures; CLI installed on Meet's machine | Meet: verify a real Papiers passage plus teammate-authored note. James + Aadit: preserve source IDs and show the note, agent challenge, human decision and changed run. |
| Arbitrary prompts | Composer accepts input; unprepared UI marks results unavailable. Steven's `scripts/plan.py` can plan a prompt and collect group reactions, but its ignored Nemotron pool/groups are absent and this computer has no Anthropic SDK or `.env`; it does not produce world events. | Meet + James + Steven: compile into typed `ScenarioSpec`; connect the planner to the world engine only after generating hypothesis-specific personas and validating actions. Keep missing outcomes marked not estimable. |
| Vultr candidate | [`experiment/vultr-decision.js`](./experiment/vultr-decision.js) maps legal city actions to Vultr's typed `clef` decision endpoint. [`persona-swarm/scripts/plan.py`](./persona-swarm/scripts/plan.py) now has an opt-in Vultr-only survey prototype (`glm-5.3` planner, `glm-5.3-flash` reactions). Offline adapter tests pass; no Vultr account/key, live quality probe, hosted backend, or UI connection exists yet. | Meet + James: follow [VULTR.md](./VULTR.md), confirm MLH credit amount and Serverless/GPU eligibility, run paired live probes, compare persona choices, then host the canonical Node orchestrator on Vultr. Steven's Haiku tuning stays a separate quality baseline and is not required for the live path. |

## Critical integration order

1. **Freeze the smallest wire contract together.** The present TTC integration passes Aadit's versioned trace from `demo-ui/` to `experience/`; it is an interim adapter, not the final shared schema. Meet + James own `ScenarioSpec`, `WorldEvent`, `MetricPoint`, `RunResult`; Steven agrees persona/action JSON; Aadit agrees coordinates and visual cues. For Bloor, add an explicit bicycle/subway mode or cue and a detour target. Publish one JSON fixture and one tiny end-to-end smoke test. Extend this one experience rather than separate components.
2. **Complete one TTC causal chain.** A fare change alters an agent's paid trip or mode; the event ledger records an arrival or deferral; the same ledger computes household fare outlay, TTC sample receipt, and shop visits. Replay baseline and proposal from the same seed. The UI must show the agent, the change in city motion, and the corresponding chart point.
3. **Run Bloor through that same path.** Use the [Bloor brief](./bloor-bike-demo.md) and fixtures as observed context. A cyclist can stay, detour, switch, or defer; a shop changes only after arrival/purchase events. Keep the zero-driver-time-gain and zero-retail-response cases. Local construction cost, injuries and emissions remain not estimable until proper inputs exist.
4. **Close the Papiers loop.** A teammate writes a real note in Papiers. The agent retrieves the passage and note, evaluates counterevidence, proposes an assumption change, asks a human to accept/edit/reject, then records a new run ID and changed event/metric values. A cached live-demo replay is acceptable if labelled cached; the fallback fixture is labelled agent-curated.
5. **Practice the pitch and submit.** The written rules require an initial Devpost entry with team and categories by **Saturday 9:00 pm ET**. Devpost currently displays a **Sunday 8:00 am EDT** final cutoff, earlier than the written 10:00 am deadline; use 8:00 am until clarified. Confirm GitHub link, write-up, 4-minute pitch and 1-minute Q&A. [Rules](https://hack-the-valley-11.devpost.com/rules), [Devpost overview](https://hack-the-valley-11.devpost.com/).

## Scope decision

The strongest judge story is the **event-backed policy experiment with a real human research intervention**. The Twin autoresearch gym is now built and has a signed-off check-set instruction plus Papiers-informed attempts, but the final holdout remains pending and its instructions have not yet been connected to the city. The isolated paired controller can serve as the city-stage integration fixture; its 8 synthetic people are not Steven's tuned runtime agents. Present survey-task tuning as a measured supporting result and evaluate city decisions separately. The Papiers prize proof should stay attached to the policy experiment so judges can see its effect on the same city and economic output.

Prize fit: the Bloor/TTC cases address a concrete Toronto issue with local source context for the [School of Cities challenge](https://hack-the-valley-11.devpost.com/); household travel costs, shop transactions and public receipts make the economic-inclusion angle only when they are reconciled from events. The [Papiers challenge](https://hack-the-valley-11.devpost.com/) asks for visible human-agent research collaboration, so a real note and versioned rerun matter more than a paper-search screenshot alone.

**Handoff rule:** each owner pushes a small vertical slice and shares the commit hash, changed interface, fixture, and what the next owner can run. Pull/fetch safely per [CLAUDE.md](./CLAUDE.md); do not reset, force push or silently change a shared field.
