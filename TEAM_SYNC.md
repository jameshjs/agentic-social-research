# Team sync — 17 October 2026

This is the short handoff for Meet, Aadit, Steven, James, and their coding agents. Read [AGENTS.md](./AGENTS.md) and [prd.md](./prd.md) for the product contract. This snapshot describes committed `main` through `bad5bf5`; teammates may have additional work in progress elsewhere.

## Pull now

```sh
git fetch origin
git status -sb
git pull --ff-only origin main  # only on a clean, non-diverged main
```

The [Bloor street explorer](./experience/README.md) is on `main` at **`bad5bf5`**. Open `http://127.0.0.1:4173/experience/?demo=bike` after starting the local server described there. It adds a schematic protected-track versus hypothetical-removal comparison, cyclist/driver/merchant branch inspector, Toronto source cards, and a route into the impact map. **This is a front-end replay, not an engine result.** Its branch text and percentages are illustrative. No shared production schema changed. Steven's persona reaction prototype and Twin autoresearch plan landed just before it at `82248be` in [persona-swarm](./persona-swarm/README.md).

## One product, one proof chain

The four-minute demo should show one continuous path:

`freeform hypothesis → generated personas → baseline/proposal decisions → committed WorldEvents → city motion + economic MetricPoints → cited evidence challenge → human choice → versioned rerun`.

The same service and `RunResult` shape must drive the TTC fare and Bloor cases. A third unprepared question must start the generic speculative path and label unsupported metrics **not estimable**. Do not describe the current prepared animations as autonomous agent decisions or the 2025 Bloor counter as a removal forecast.

## Current integration boundary

| Surface on `main` | Present | Next connection |
| --- | --- | --- |
| City, Bloor street view, sector charts | Working illustrative UI in `experience/` | Aadit + James: adapt one authoritative `RunResult` to actor motion, timeline, chart points and source badges. Replace hard-coded Bloor branch outcomes only when committed events exist. |
| Persona work | Steven's reaction scripts and saved examples in `persona-swarm/` | Steven + James: produce persistent `PersonaSpec[]` and bounded JSON decisions accepted by the world engine for both prompts. The planned Twin tuning gym is separate from this runtime path. |
| World simulation and economic ledger | Contract in PRD §11; no executable shared runner committed on `main` in this snapshot | James: implement same-seed baseline/proposal, validated actions, `WorldEvent`s and event-derived `MetricPoint`s; publish a replay fixture immediately. |
| Research and Papiers | Cited fare/Bloor packs and offline `EvidencePacket` fixtures; CLI installed on Meet's machine | Meet: verify a real Papiers passage plus teammate-authored note. James + Aadit: preserve source IDs and show the note, agent challenge, human decision and changed run. |
| Arbitrary prompts | Composer accepts input; unprepared UI marks results unavailable | Meet + James: compile into typed `ScenarioSpec`; start a generic JSON-action run or explicitly speculative result through the same API. |

## Critical integration order

1. **Freeze the smallest wire contract together.** Meet + James own `ScenarioSpec`, `WorldEvent`, `MetricPoint`, `RunResult`; Steven agrees persona/action JSON; Aadit agrees coordinates and visual cues. For Bloor, add an explicit bicycle/subway mode or cue and a detour target. Publish one JSON fixture and one tiny end-to-end smoke test. Do this before separate components grow further.
2. **Complete one TTC causal chain.** A fare change alters an agent's paid trip or mode; the event ledger records an arrival or deferral; the same ledger computes household fare outlay, TTC sample receipt, and shop visits. Replay baseline and proposal from the same seed. The UI must show the agent, the change in city motion, and the corresponding chart point.
3. **Run Bloor through that same path.** Use the [Bloor brief](./bloor-bike-demo.md) and fixtures as observed context. A cyclist can stay, detour, switch, or defer; a shop changes only after arrival/purchase events. Keep the zero-driver-time-gain and zero-retail-response cases. Local construction cost, injuries and emissions remain not estimable until proper inputs exist.
4. **Close the Papiers loop.** A teammate writes a real note in Papiers. The agent retrieves the passage and note, evaluates counterevidence, proposes an assumption change, asks a human to accept/edit/reject, then records a new run ID and changed event/metric values. A cached live-demo replay is acceptable if labelled cached; the fallback fixture is labelled agent-curated.
5. **Practice the pitch and submit.** The written rules require an initial Devpost entry with team and categories by **Saturday 9:00 pm ET**. Devpost currently displays a **Sunday 8:00 am EDT** final cutoff, earlier than the written 10:00 am deadline; use 8:00 am until clarified. Confirm GitHub link, write-up, 4-minute pitch and 1-minute Q&A. [Rules](https://hack-the-valley-11.devpost.com/rules), [Devpost overview](https://hack-the-valley-11.devpost.com/).

## Scope decision

The strongest judge story is the **event-backed policy experiment with a real human research intervention**. The Twin autoresearch gym could improve persona quality, but its evaluation loop is currently planned rather than built. Keep it as a measured supporting result only if it produces a usable persona instruction and score without delaying the shared runtime. The Papiers prize proof should stay attached to the policy experiment so judges can see its effect on the same city and economic output.

Prize fit: the Bloor/TTC cases address a concrete Toronto issue with local source context for the [School of Cities challenge](https://hack-the-valley-11.devpost.com/); household travel costs, shop transactions and public receipts make the economic-inclusion angle only when they are reconciled from events. The [Papiers challenge](https://hack-the-valley-11.devpost.com/) asks for visible human-agent research collaboration, so a real note and versioned rerun matter more than a paper-search screenshot alone.

**Handoff rule:** each owner pushes a small vertical slice and shares the commit hash, changed interface, fixture, and what the next owner can run. Pull/fetch safely per [CLAUDE.md](./CLAUDE.md); do not reset, force push or silently change a shared field.
