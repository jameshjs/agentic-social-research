# Two Worlds experience — canonical front end

This is the **one public entry point** for the hackathon demo. The cinematic entry, TTC replay, Bloor explorer, impact map, and persona research record live at `/experience/`. Aadit's detailed TTC 3D inspector remains implemented in [`demo-ui/`](../demo-ui/README.md) and is embedded here as the research workbench. Do not build another standalone public front end.

**Mapped run (canonical, 17 Oct):** `?demo=fare`, `?demo=bike` and any compiled prompt run the **same** paired experiment on James's Bathurst–Spadina world. That means 19 persistent synthetic people, the Game Master sandbox, seed 42 and one `experiment.v2` RunResult from [`../experiment/world-runner.js`](../experiment/world-runner.js). Everything below reads that one event log. [`bloor-map.js`](./bloor-map.js) replays the travel events as people, bikes, cars, Line 2 trains, homes, shop visits and fare cues, with baseline and policy on one compressed clock. Click a person to open their choices. The **shared decision ledger** (`#runLedger`) lists every changed choice; clicking one seeks the map to that event. A **versioned rerun** changes one sensitivity assumption (cost weight, cycling discomfort, shop staffing response), and when the Vultr engine is up a **sweep** is available. The **five charts** come from [`world-run-adapter.js`](./world-run-adapter.js). Every run dispatches `counterfactual:result`.

**Demo view (the only view).** The page opens in **demo view**: Earth-to-Bloor landing → freeform prompt → 100-agent reaction when online → 3D lab and impact tour. The 3D view has a Baseline / With policy switch and metric tiles reduced from the same `experiment.v2` result. No prepared-case selector is shown; a typed TTC fare or Bloor lane question loads its prepared run, while other prompts use the compiler. **See bike impact** / **See TTC impact** plays the impact tour below. The Researcher view switch was removed; `body.demo-view` is set in `index.html`, and the ledger, rerun, sweep, sector board, TTC workbench, Bloor storyboard and persona research record stay in the DOM but hidden.

**Where runs execute.** `app.js` looks for the engine API at `/api/health`: first on the same origin (the Vultr VM or `node api/server.js`), then, on a localhost page, at the public Vultr engine (CORS is allowed only from localhost origins). If neither answers, the same modules run in the browser. `?engine=off` forces the browser, `?engine=<url>` picks a backend, and the status line says which host served the run. **Fallback:** if `data/world/` cannot load, the earlier engines (the `demo-ui` TTC trace and the 8-person `experiment.v1` Bloor fixture) run exactly as before. The embedded TTC inspector is kept as a labelled earlier prototype. In mapped mode its reruns update only its own status bar.

## Two Worlds demo pass (17 Oct)

The default demo view now runs landing → prompt → 3D. The changes live in `two-world.css` and `two-world.js`, plus text edits in `index.html` and one routing function in `app.js`.
- **Landing:** the globe, with clouds that part as it zooms from Earth to Bloor. The drawn city is only the fallback when the globe cannot load. The brand is "Two Worlds", with a shorter hero and prompt.
- **Prepared questions:** a typed question about the TTC fare or the Bloor bike lane opens the prepared run (`preparedIntent` in `app.js`). Other prompts use the compiler path. The prepared cases are not listed as frontend choices.
- **Lab:** shows the 3D view, made larger and with no 2D toggle. Directly under it, `two-world.js` renders a decision brief from the same `experiment.v2` run: sample receipts, household and shop ledgers, adult versus Fair Pass, mode substitution, three trajectories, the lever-to-ledger chain, and the metrics the run cannot estimate.
- **Impact tour:** [`viewer3d-bridge.js`](./viewer3d-bridge.js) selects one changed decision from the current `experiment.v2` result and sends its actor, trip, tick, arm and camera beat to [`world/viewer3d/viewer.js`](../world/viewer3d/viewer.js). The bike tour follows Leila's logged protected-track versus side-street route at human scale; the fare tour compares the same scheduled Route 7 arrival in both arms, then follows Hawa's changed trip. After the lead person it follows up to three more people, each a different change from the lead's and each other's (for example Bloor → TTC, Bloor → shops elsewhere), with a two-line card. A trip that leaves Bloor under the policy is shown on Baseline, where it is still on the street. The 3D stop queue is **illustrative** and scaled from the district-sample TTC trip ratio, not a measured stop queue or boarding count. The bus's curb position is snapped schematically to Bathurst because the GTFS station stop point lies inside a building in this simplified road mesh. Trees, parked cars, lane highlights and the shelter are scenic detail, not event-log actors or observed Toronto objects. Moving persona agents and the decision brief still read the paired result. The impact camera loops its selected travel segment so the person does not vanish during the pitch.
- **The 100-agent panel:** sits right after the prompt, unchanged. When the agents are online, the page scrolls to it first, so its rating animation plays before the 3D lab.

## Landing globe

One wheel, key or swipe on the landing plays the whole flight: the page scrolls itself for about 8 s, from the whole Earth to Toronto, then down to a tilted 3D view of Bloor St W from Bathurst to Spadina. Zoom is capped at 2.2 levels per second, so a fast flick cannot skip it. The 619 m section is drawn as a mint line and lands as the underline of "Watch everything else move." Street tiles are fetched into the browser cache while the globe is at rest, and buildings rise in over one zoom level. It is `globe-intro.js` and `globe-intro.css`, with no change to `app.js`: the script reads the same scroll progress as `updateReveal()`.

- **Map and tiles:** MapLibre GL 5.6.0 from jsdelivr, with dark OpenFreeMap vector tiles (no key, OpenStreetMap data, attribution shown). `api/server.js` allows `tiles.openfreemap.org` in `connect-src` and `img-src` for this.
- **What is shown:** the street and building shapes are OpenStreetMap context only. The world the runs use is still `data/world/`.
- **Fallback:** the globe removes itself and the drawn city landing shows as before when any of these apply:
  - the page has `?globe=off`
  - reduced motion is on
  - there is no WebGL
  - MapLibre or the map style fail to load within 12 s, which also covers being offline. Slower tiles do not trigger the fallback: the dark stage stays until the globe fades in. `index.html` preloads MapLibre and the style and preconnects to the tile host.
- **Clouds and the drawn city:** the clouds stay over the globe and part as it zooms. Over the globe they draw without blur or blending (a full-screen filter on every frame made the flight stutter) and are removed at street level. The isometric city canvas is hidden while the globe is up, and it returns only if the globe cannot load.
- **Once a run starts:** the globe hides, and it comes back when you return to the landing.

## Run it

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/experience/`. Add `?demo=fare` or `?demo=bike` to open a prepared case. No package install or build is required. Serve from the **repository root** because the TTC page loads `../demo-ui/sim.js` and embeds `../demo-ui/?embedded=1`. The detailed TTC scene uses Three.js from a CDN; the outer experience has a canvas fallback and the cited trace generator works locally.

**100 persona agents.** The agent server serves this site at `http://127.0.0.1:4174/experience/` (`npm --prefix persona-swarm/runtime start`). The page loads [`agents-client.js`](../persona-swarm/runtime/agents-client.js) and calls the server on the same origin. The browser never holds an access key. When the server is online, one showcase section (right after the composer) shows all 100 agents rating a policy from 1 (strongly oppose) to 5 (strongly support):
- **Which policy:**
  - the TTC fare and Bloor chips and `?demo=fare|bike` use a fixed prepared policy (`askAgents`, options `[1, 2, 3, 4, 5]`, about 100 calls);
  - the composer drafts one concrete policy from the typed idea with the Opus orchestrator (`chat` with `modes: ['poll']`), shows it as the drafted policy, then all 100 agents rate it. It is not a general chat.
- **What the section shows:**
  - a live 1–5 bar with counts, the mean and "N of 100 answered", and by-role and by-fare (Fair Pass vs adult) means;
  - 100 compact agent cards (name, role, rating colour; the reason on hover or click) with a role filter. A "?" marks answers the runtime flags (`consistency: 'check'`) because the reason may not match the rating;
  - the orchestrator's summary, marked "(numbers checked)" when its numbers are verified;
  - the label "survey-style reaction from 100 persona agents, not a forecast".
- **The map:** for the prepared policies, each rating drives one dot on the mapped Bloor section through `MOTION_MAP` in `app.js`. The dots are labelled "Illustrative motion mapped from agents' 1–5 ratings, not simulated trip decisions", and clicking one shows that agent's rating and reason.
- **The prepared replay:** the ledger, charts and TTC inspector keep the prepared simulation replay. Its fixture people (8 for Bloor, the demo-ui district for fare) are labelled "prepared simulation replay (synthetic, separate from the 100 agents)". When the agents are online, they start collapsed behind a toggle under the lab. The site runs no 40-decider world run.

`MOTION_MAP` (tune it in `app.js`). The baseline view shows each agent's usual mode; the policy view uses the agent's rating, 1 to 5:

| Policy | Mode | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| fare | transit rider (adult fare) | car if they have one, else walk | walk for half (stable hash), else transit | transit | transit | transit |
| bike | cyclist | side-street detour | side-street detour | Bloor | Bloor | Bloor |

Fair Pass riders keep transit. Drivers, pedestrians and any mode not listed keep their usual cue. The cues are transit (walks to Bathurst or Spadina station), walk, bike (Bloor), side-street detour, and car (Bloor).

Served any other way (for example `python3 -m http.server 4173`), or with the agent server offline, the page shows an "agents offline" note and behaves as before: the bike fixture runs in the browser and fare uses the `demo-ui` trace.

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

The mapped run's people, routines, preferences, baskets, off-map minutes and shop staffing thresholds are **synthetic assumptions** ([`world-fixtures.js`](../experiment/world-fixtures.js)). Streets, crosswalks, signal locations, Line 2 schedules, building footprints, business presence and background traffic counts are **observed**; signal timings are assumed ([world/README.md](../world/README.md)). Results describe 19 synthetic people in a 619 m sandbox; they are not Toronto forecasts, and closures, injuries, emissions, GDP and citywide totals are explicitly **not estimable**. Steven's 100 agents give **survey-style 1–5 reactions**, not trip decisions; their map dots are an opt-in, labelled overlay. Clef's second opinion ([VULTR.md](../VULTR.md)) is recorded beside the run, not used to produce it. The intro city flyover and the Bloor lab's schematic street section and branches remain illustrations. Papiers human notes and approvals must be genuine, per [papiers-setup.md](../papiers-setup.md).

## Integration handoff

- **Aadit:** visual polish of the mapped replay and charts; keep every animated actor tied to a travel event and `counterfactual:result` on every run.
- **James:** new world levers become `set_lever` interventions automatically; keep the sandbox's event shape (`moved` with `wait_s`, `travel_s`, `fare_cad`, `shared_with_cars`) stable or tell Meet.
- **Steven:** the showcase panel and `MOTION_MAP` overlay are preserved; the hosted site reaches your agents through [ops/agents-tunnel.md](../ops/agents-tunnel.md).
- **Meet:** compiler, evidence badges, Vultr deploys (`ops/deploy.sh --skip-key`) and the Papiers loop.

## Local QA already done

The suite in [README → Run and replicate](../README.md#run-and-replicate) (87 tests) covers paired replay, shared population, Game Master integrity (0 rejected moves, consecutive legs, door-only visits), ledger reconciliation, fare and removal mechanisms, bounded external decisions, compiled levers, adapter series, and the API allowlist. Browser QA on the Vultr host and locally: `?demo=fare` and `?demo=bike` show moving actors, the shared ledger and five charts; the DOM reports `MAPPED PAIRED RUN (SYNTHETIC)` with the headline from the run. Expected console notes: "agents offline" when Steven's server is not reachable, and a WebGL error from the embedded TTC prototype in headless Chrome.
