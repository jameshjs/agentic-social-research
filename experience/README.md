# Counterfactual Lab experience — canonical front end

This is the **one public entry point** for the hackathon demo. The cinematic entry, TTC replay, Bloor explorer, impact map, and persona research record live at `/experience/`. Aadit's detailed TTC 3D inspector remains implemented in [`demo-ui/`](../demo-ui/README.md) and is embedded here as the research workbench. Do not build another standalone public front end.

**New integration target (17 Oct):** Update this existing website so both `?demo=fare` and `?demo=bike` use **one detailed Bathurst–Spadina Bloor map**, the same persistent actors, world controller, event log, `RunResult`, renderer and economic dashboard. Keep both policy examples; retire their separate 3D districts/engines after the shared path reaches parity. James's [`world/`](../world/README.md) is the candidate spatial/rule layer and its preview is development-only. The current behavior below describes the still-unconsolidated build, not completion of this target.

**Mapped UI slice:** Both prepared selectors now load the same `data/world/bloor_spadina_bathurst.json` into [`bloor-map.js`](./bloor-map.js) in the existing route. Street intersections, crosswalks, buildings and station markers use James's world fixture; the bike policy toggles protected-track drawing. This is **spatial context only**. The TTC inspector still runs its older synthetic district, the Bloor ledger still uses `experiment.v1`, and neither trace places actors on the mapped street yet. The generic animated intro remains illustrative; the mapped lab hides its old schematic motion scrubber until it can replay real mapped events. If the map fetch fails, the earlier schematic background remains available.

## Run it

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/experience/`. Add `?demo=fare` or `?demo=bike` to open a prepared case. No package install or build is required. Serve from the **repository root** because the TTC page loads `../demo-ui/sim.js` and embeds `../demo-ui/?embedded=1`. The detailed TTC scene uses Three.js from a CDN; the outer experience has a canvas fallback and the cited trace generator works locally.

## What works now

1. **Cloud descent:** a continuously animated isometric city sits behind a scroll-driven cloud reveal; an entry control scrolls to the centered hypothesis composer.
2. **Two prepared cases in one journey:** A TTC adult-fare +$0.50 seeded replay and hypothetical protected Bloor West bike-lane removal. The TTC trace currently depicts a **schematic west-end district**, not the locked UTSC-area baseline; do not call it census-calibrated. Bloor now has a separate paired synthetic event run beneath its illustrative city and optional branches.
3. **Replay transition:** the composer recedes behind a four-step prepared replay, then the camera zooms into the district. The overlay explicitly says **no live model call**.
4. **TTC trace-backed inspector:** the embedded Three.js district replays its generated personas, baseline/policy events, evidence, assumptions and versioned reruns. It is a deterministic rule-engine stand-in, not the Steven/James AI swarm. The cinematic intro remains schematic; the lab now shows mapped Bathurst–Spadina context with no event-driven actors yet.
5. **Shared TTC numbers:** [`trace-adapter.js`](./trace-adapter.js) maps Aadit's `CFSim.buildTrace()` result to the outer headline, five sector charts and impact map. The embedded inspector posts each new trace to the parent with `counterfactual:result`; rerunning updates the outer analysis. `window.CounterfactualCurrentRun` and the same-named `CustomEvent` expose the latest TTC trace to future components.
6. **Responsive and accessible:** keyboard reachable controls, dialog semantics, visible focus, mobile layout, a reduced-motion path, frame-rate throttling on smaller screens, and capped device pixel ratio.
7. **Bloor paired experiment:** [`../experiment/runner.js`](../experiment/runner.js) runs eight persistent synthetic people through baseline and proposed worlds. The workbench displays clickable changed decisions and their event paths, while [`experiment-adapter.js`](./experiment-adapter.js) maps event-reduced values into the headline and five charts. The moving city, street section, and selectable alternative branches remain **illustrative**, not event-animated. No Bloor removal response or shop impact is an observed Toronto effect.
8. **Unified visual language:** the embedded TTC inspector uses the main experience's mint, dark glass, typography and three-column frame, while its standalone route keeps Aadit's original theme.
9. **Persona research record:** the new panel reads Steven's committed `data/record/rounds.json`, `final.json`, and saved fare reaction files. Judges can inspect all 10 check-set trials, the retained and discarded proposals, human review, Papiers reference counts, the pending final holdout, and three examples of context-conditioned agent responses. The panel keeps this survey research separate from the TTC event trace.

## Truth in the demo

The TTC headline and charts derive from **one seeded synthetic trace** generated by [`demo-ui/sim.js`](../demo-ui/sim.js). Its sample people, west-end grid, fare responses and shop rules are not measured Toronto effects. The Bloor headline and charts now derive from a **different paired synthetic trace** generated by [`../experiment/runner.js`](../experiment/runner.js); its fixture personas and assumed response rules are not Steven's live agents or measured Toronto effects. The intro city is an illustrative animation; the lab map is mapped **static context** with no event-driven actors yet. The Bloor optional branch text in [scenarios.js](./scenarios.js) remains an illustrative exploration, separate from the recorded run. The arbitrary-input path preserves the prompt and marks outcomes **not estimable**; the generic world engine is still missing. The original studies and data limits are in [demo-data.md](../demo-data.md), [papers.md](../papers.md), and [bloor-bike-demo.md](../bloor-bike-demo.md).

Before presenting this as a general policy simulator, James/Steven/Meet must reconcile the two prepared traces into one canonical `RunResult` contract, connect hypothesis-specific live personas and unprepared prompts, and drive the outer city and scrubber from actual events. Keep observed data and assumptions separate. Papiers human notes and approvals must be genuine, per [papiers-setup.md](../papiers-setup.md).

## Integration handoff

- **Aadit:** adapt the existing `/experience/` map, TTC inspector, Bloor ledger and charts to render the same Bathurst–Spadina street graph for both policy selectors. Keep reruns updating outer charts through `counterfactual:result` during migration. Avoid a new public route or a duplicate canvas; `world/preview.html` is a reference/development preview.
- **James:** connect the `world/` graph and rules to one canonical `RunResult` for both policies, with scenario ID, mapped coordinates/node IDs, actors, `WorldEvent`s, baseline/policy `MetricPoint`s, sector/edge trace IDs and source/assumption IDs. Use mapped subway and streetcar services; do not invent Bloor bus service. Preserve replay from the same seed.
- **Steven:** connect scenario-specific persistent personas and bounded choices to those same mapped actor markers and event trail; do not animate a trip or shop sale that did not occur in the authoritative world.
- **Meet:** own the adapter/compiler/evidence boundary and local source badges. Keep UTSC/Scarborough fare data and wider Shaw–Avenue cycling studies labelled as external context; only Bathurst–Spadina observations ground this map. The arbitrary prompt path intentionally does not claim a backend response yet.

## Local QA already done

`node --test experiment/test-runner.js experience/test-experiment-adapter.js experience/test-trace-adapter.js` checks the paired replay, accounting, causal links, offline snapshots and chart mapping. Browser QA on `?demo=bike` confirmed the decision ledger and all five event-derived charts appear and remain labelled as synthetic. Earlier browser QA opened both prepared paths and changed a TTC assumption in the embedded inspector: the outer headline and sector charts moved from v1 to v2. The production general engine, Steven's live runtime agents, Toronto calibration, real Papiers retrieval, and event-driven outer flyover remain open work.
