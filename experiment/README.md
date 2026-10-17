# Paired city experiment

## Canonical: `experiment.v2` on the mapped Bathurst–Spadina world

[`world-runner.js`](./world-runner.js) is the engine behind `/experience/` for both prepared policies and for compiled prompts. [`world-fixtures.js`](./world-fixtures.js) holds **one** shared population: 19 synthetic people, 12 with homes on mapped side streets and 7 visitors. It also holds six real OSM shops with synthetic staffing thresholds and the two policy specs, which differ only in their intervention.

```sh
node experiment/run-world.js fare > /tmp/fare.json        # or bike; prints one experiment.v2 RunResult
node --test experiment/test-world-runner.js               # replay, pairing, Game Master integrity, ledgers, mechanisms
node experiment/run-world.js fare > experiment/sample-world-fare.json   # regenerate snapshots after a runner or world change
node experiment/run-world.js bike > experiment/sample-world-bike.json
```

**How a run works.**

1. Each modelled weekday, each arm builds James's sandbox ([`world/sandbox.js`](../world/sandbox.js)) with that tick's levers. Calibrated background traffic is computed once per lever set and shared.
2. For every trip, each option in the fixture is probed in a scratch sandbox. An option is a list of legs such as `walk → stn_bathurst`, `ride line2_eb`, `walk → door:<business>`. The probe returns in-map minutes, fare and shared-with-cars distance. Options that are closed, over budget or infeasible are dropped. Defer is always legal.
3. A choice comes from the explicit fixture score or from an optional bounded `decide(request)`. Request and replay semantics match `experiment.v1`: no arm name, cached for identical states, and `decision_replay` reproduces the run.
4. The chosen legs are executed for real in the arm's sandbox, which validates every move. Each leg becomes a `travel` WorldEvent with `path: [[x, y, t], …]`, steps and rule IDs. Fares become `pay_fare` events, door entries `enter_business`, then `purchase`. Shop receipts set next period's hours through `set_shop_hours`. Every event has `caused_by` links.
5. `reduceWorldMetrics` derives 19 metrics, by tick and by fare group, from committed events only. `metric_points` lists the contributing event IDs. Unsupported outcomes are in `not_estimable`.

**Interventions:**

- `change_cost` on `adult_fare_cad`, and `set_lever` on any sandbox lever: track, car lanes, parking, signal cycle, green share, fare, Line 2 headway.
- Sensitivity overrides: `cost_weight`, `unprotected_cycling_discomfort_per_km`, `shop_staffing_response`.
- Unknown operators or levers throw.

**Clef second opinion (Vultr):** `node ../ops/vultr.js run -- node experiment/run-world-clef.js both` sends every unique decision state to Vultr `clef` (`/v1/systemone`), compares its choices with the fixture rule, and replays a Clef-decided paired run. Results are saved in [`vultr-runs/`](./vultr-runs/); see [VULTR.md](../VULTR.md). [`scenario-compiler.js`](./scenario-compiler.js) with [`vultr-compiler.js`](./vultr-compiler.js) turns a freeform question into validated levers. `probe-vultr-compiler.js` is its live go/no-go check.

## Earlier slice: `experiment.v1` (schematic, kept as a migration baseline and UI fallback)

Both prepared questions also run through the earlier schematic controller in [`runner.js`](./runner.js) with data in [`fixtures.js`](./fixtures.js). It has no map. `/experience/` uses it only if the world fixture cannot load. Steven's [persona runtime](../persona-swarm/RUNTIME.md) `run.js` drives this v1 controller with his 40 deciders.

```sh
node --test experiment/test-runner.js
node experiment/run.js fare > /tmp/fare-experiment.json
node experiment/run.js bike > /tmp/bike-experiment.json
```

`RunResult` is `experiment.v1`. Both arms start with the same people, initial resources and seed. Every person has a persistent profile and makes bounded trip decisions on each tick. The controller commits a `WorldEvent` for decisions, fares, travel, arrivals, purchases and next-period shop hours. `reduceMetrics` derives chart values from those committed events. `changed_decisions` compares action, route **and destination**. The output includes world coordinates, source/assumption ledgers, unsupported metrics marked `not_estimable`, and a `decision_replay` cache. A renderer should animate only committed events and graph only `runs[arm].metrics.by_tick`.

The fare sample has a visible multi-step path: the posted fare changes, some adults switch or defer an errand, local sample receipts fall, the shop reduces next-period hours under an explicit synthetic threshold, and later shoppers go to the plaza. Fair Pass remains at CAD 2.10. The Bloor sample tests a different operator: loss of lane protection changes some cyclists' route and shop destination. It does **not** assume that drivers gain time. These responses, baskets, budgets and shop rule are invented test inputs; they are **not** Toronto effect estimates. Observed Toronto sources are context and fare rules only. No sampled outcome can be multiplied into citywide revenue, business closures, injuries, emissions, or GDP. The Bloor result now feeds the public `/experience/?demo=bike` decision ledger and five charts; its animated city remains schematic.

## Persona decision boundary

Steven's Twin autoresearch scores US survey answer patterns. The retained check-set prompt and Papiers-informed trials are in `persona-swarm/`; the final held-out score and city decision validity remain separate checks. The tuned survey instructions are not themselves a transport model. The current `personas` are synthetic fixtures, not output from Steven's generator. When it is available, pass persistent generated personas through `runExperiment(spec, { personas, decide })`. The optional async `decide(request)` sees the person, trip, cash, shop state, environment and legal `options` and must return `{action, provider?, reason?}`. It cannot write world events or author code. Invalid actions fail back to the fixed fixture rule with a warning. Identical states in both arms reuse the same external answer within a run. Save `decision_replay` to reproduce a live provider result with `runExperiment(spec, { personas, replay_decisions: prior.decision_replay })`.

The live city provider needs its **own** validation: feasible action rate, individual consistency, group slices, missing context, latency and cost, plus an independently held-out mobility task. Survey likeness alone is not policy effect validation. If “Jev” means TypeSafe AI's System One model, it could fill this bounded `decide` slot after that evaluation; it is not an orchestrator or world simulator, and Steven's Claude prompt cannot be assumed to transfer to it. [Jev introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev), [API](https://api.typesafe.ai/redoc).

### Vultr decision candidate

[`vultr-decision.js`](./vultr-decision.js) maps that callback to Vultr Serverless Inference's typed `/v1/systemone` action endpoint. `clef` is the provisional model; it is **not yet measured on our mobility cases**. It validates the model ID and action, keeps the API key server-side, and retries temporary HTTP failures. A live smoke test is available after a team member creates an account and exports `VULTR_INFERENCE_API_KEY`:

```sh
node experiment/run-vultr.js bike > /tmp/bike-vultr.json
node experiment/run-vultr.js fare > /tmp/fare-vultr.json
```

The CLI exits unsuccessfully if any model call falls back. The public UI and James's backend do not yet call this adapter. Read [VULTR.md](../VULTR.md) for the account setup, model choice, evaluation gate, and hosting plan; do not describe the offline fixtures as live Vultr results.

Start with `node experiment/probe-vultr.js --dry-run` to inspect the eight paired decision states without a key. With a key, `node experiment/probe-vultr.js > /tmp/vultr-clef-probe.json` makes 16 typed decision calls and records each selected action, focal action probability, latency, and reported input tokens. Compare `VULTR_DECISION_MODEL=clef-flash` on the same cases before choosing a demo default. The probe diagnoses face validity; it does not estimate actual Toronto behavior.

## Integration boundary

- **Steven:** map his generated `PersonaSpec[]` to this schema and provide a decision callback. Preserve a fallback for absent API credentials. Report a separate city decision evaluation.
- **James:** reconcile this controller and `experiment.v1` with his world service before either becomes the canonical runner. Keep one `RunResult`, not two published engines. The fixtures are an executable contract and can be replaced or adapted; do not silently discard event/reconciliation tests.
- **Aadit:** wire the live city motion and timeline to the final shared result. Bloor's charts and clickable decision ledger now read `experiment.v1`; its animated city and optional branches are illustrative, while the TTC inspector still uses its earlier trace.
- **Meet:** connect `EvidencePacket` → proposed assumptions → actual human approval → versioned rerun. This is needed to demonstrate the Papiers challenge. Do not label a seeded fixture as a Papiers retrieval or a human note.

Two remaining gates are intentionally visible: unrestricted prompts still need the scenario compiler and hypothesis-specific personas; the public UI still needs one canonical result contract and event-driven city motion. Until those are connected, this module is an executable demonstration of the paired experiment core, not the complete product.
