# Two Worlds experience — canonical front end

This is the **one public entry point** for the hackathon demo: Earth-to-Bloor landing → freeform prompt → 100-agent reaction when online → 3D lab, impact tour and policy assessment. Do not build another standalone public front end. Aadit's earlier TTC inspector still lives at [`demo-ui/`](../demo-ui/README.md) as its own route; this page no longer embeds it.

**Mapped run (canonical, 17 Oct):** `?demo=fare`, `?demo=bike` and any compiled prompt run the **same** paired experiment on James's Bathurst–Spadina world. That means 19 persistent synthetic people, the Game Master sandbox, seed 42 and one `experiment.v2` RunResult from [`../experiment/world-runner.js`](../experiment/world-runner.js). The 3D view, the assessment and the hidden decision ledger all read that one event log. Every run dispatches `counterfactual:result` and sets `window.CounterfactualCurrentRun`.

**Where runs execute.** `app.js` looks for the engine API at `/api/health`: first on the same origin (the Vultr VM or `node api/server.js`), then, on a localhost page, at the public Vultr engine (CORS is allowed only from localhost origins). If neither answers, the same modules run in the browser. `?engine=off` forces the browser, and `?engine=<url>` picks a backend. **Fallback:** if `data/world/` cannot load or a mapped run fails, the question takes the speculative path: nothing is simulated, and the 100 agents (when online) still rate it.

## The page

`body.demo-view` is set in `index.html`; it is the only view.
- **Prepared questions:** a typed question about a TTC fare *increase* or a Bloor bike lane *removal* opens the prepared run (`preparedIntent` in `app.js`). So do the two "or start with" chips and `?demo=fare|bike`. A fare cut, free transit, or a new lane goes through the compiler ([`scenario-compiler.js`](../experiment/scenario-compiler.js)) like any other prompt.
- **Only the two prepared runs show the 3D street.** The viewer does not open for a compiled or speculative question (`streetRun` in `viewer3d-bridge.js`). A compiled run (for example free fares, or Line 2 twice as often) shows the 100-agent panel and the results brief. A question with no mapped lever (for example the Ontario minimum wage) gets one "not simulated" report: the 100-agent panel on top, then an assessment reduced from the 1–5 ratings. No invented street figures. If the agents are offline, the report says so.
- **Lab:** a title bar, the 3D view with a Baseline / With policy switch, then the policy impact assessment that `two-world.js` renders from the same `experiment.v2` run: scope strip, headline figures, graded assessment, impacts by stakeholder, where changed trips went, sensitivity analysis, validity checks, what is not estimable, and the method. The sensitivity runs rerun each declared assumption at its low and high value with the same people, spec and seed through `counterfactualPreview.variant` in `app.js`. They run in the browser, never through the API, because the API run quota is per IP.
- **3D view:** [`viewer3d-bridge.js`](./viewer3d-bridge.js) embeds [`world/viewer3d/`](../world/viewer3d/) with `?embed=1` over the 2D map ([`bloor-map.js`](./bloor-map.js)), which stays as the fallback without WebGL or with `?view=2d`. Inside the page the mouse wheel scrolls the page; it does not zoom the 3D camera.
- **Impact tour:** **See bike impact** / **See TTC impact** selects one changed decision (Elena for the fare, Leila for the bike lane) and sends its actor, trip, tick and arm to [`world/viewer3d/viewer.js`](../world/viewer3d/viewer.js). `forkPlan` finds where that trip's Baseline and With-policy routes part (the first point more than 10 m from the other route) and films both arms there from **one fixed camera**. Routes are coloured by arm (Baseline cyan, With policy pink), and a BEFORE/AFTER badge stays over the 3D view. The policy card gives the option the person turned down, from that arm's `choose_trip` options. Pressing the Baseline/With policy toggle stops the tour. Trees, parked cars, lane highlights and the shelter are scenic detail, not event-log actors or observed Toronto objects. Known geometry limit: Walmer Rd and Spadina Ave south are drawn up to ~20 m from the real streets; the tour's beats start at the fork, which avoids those stretches.
- **Hidden decision ledger (`#runLedger`):** lists every changed choice with its committed events, a **versioned rerun** of one sensitivity assumption, a Vultr **sweep** when the engine is up, and the Clef second-opinion card. It is built on every run but hidden in the demo view (`body.demo-view #runLedger`).

## Landing globe

One wheel, key or swipe on the landing plays the whole flight: the page scrolls itself for about 8 s, from the whole Earth to Toronto, then down to a tilted 3D view of Bloor St W from Bathurst to Spadina. Zoom is capped at 2.2 levels per second, so a fast flick cannot skip it. The 619 m section is drawn as a mint line and lands as the underline of "Watch everything else move." It is `globe-intro.js` and `globe-intro.css`: the script reads the same scroll progress as `updateReveal()` in `app.js`.

- **Map and tiles:** MapLibre GL 5.6.0 from jsdelivr, with dark OpenFreeMap vector tiles (no key, OpenStreetMap data, attribution shown). `api/server.js` allows `tiles.openfreemap.org` in `connect-src` and `img-src` for this. The street and building shapes are OpenStreetMap context only; the world the runs use is still `data/world/`.
- **Fallback:** the globe removes itself and the drawn city landing (`city.js`) shows when reduced motion is on, there is no WebGL, or MapLibre or the map style fail to load within 12 s (which also covers being offline). Slower tiles do not trigger the fallback.
- **Clouds:** they stay over the globe and part as it zooms, drawn without blur or blending (a full-screen filter on every frame made the flight stutter).
- **Once a run starts:** the globe hides, and the landing shrinks to the composer, so scrolling back up offers another question. Only a reload shows the flight again.

## Run it

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/experience/`. Add `?demo=fare` or `?demo=bike` to open a prepared case. No package install or build is required. Serve from the **repository root** because the page loads `../data/world/`, `../experiment/` and `../world/viewer3d/`.

**100 persona agents.** The agent server serves this site at `http://127.0.0.1:4174/experience/` (`npm --prefix persona-swarm/runtime start`). The page loads [`agents-client.js`](../persona-swarm/runtime/agents-client.js) and calls the server on the same origin; the browser never holds an access key. When the server is online, one section right after the composer shows all 100 agents rating a policy from 1 (strongly oppose) to 5 (strongly support):
- **Which policy:** the prepared fare and Bloor runs ask a fixed prepared policy (`askAgents`, options `[1, 2, 3, 4, 5]`, about 100 calls). Any other question has the Opus orchestrator draft one concrete policy from the typed idea (`chat` with `modes: ['poll']`), then all 100 agents rate it.
- **What it shows:** the live status ("LIVE · N OF 100 AGENTS ANSWERED"), a 1–5 bar with counts, a role filter, and one fixed-height row of agent cards. New answers slide in on the right and the row follows them; earlier cards scroll sideways inside the row, so the panel keeps its height. Each card shows the name, role, rating colour and the reason clamped to three lines (the full reason on hover or focus). A "?" marks answers the runtime flags (`consistency: 'check'`). The label reads "Survey-style reaction from 100 persona agents, not a forecast."
- `--backend replay` reports the agents offline, so the panel stays hidden; use the live backend to see it.

Served any other way, or with the agent server offline, the page skips the panel and runs everything else.

## Truth in the demo

The mapped run's people, routines, preferences, baskets, off-map minutes and shop staffing thresholds are **synthetic assumptions** ([`world-fixtures.js`](../experiment/world-fixtures.js)). Streets, crosswalks, signal locations, Line 2 schedules, building footprints, business presence and background traffic counts are **observed**; signal timings are assumed ([world/README.md](../world/README.md)). Results describe 19 synthetic people in a 619 m sandbox; they are not Toronto forecasts, and closures, injuries, emissions, GDP and citywide totals are explicitly **not estimable**. Steven's 100 agents give **survey-style 1–5 reactions**, not trip decisions, and do not feed the paired run. Clef's second opinion ([VULTR.md](../VULTR.md)) is recorded beside the run, not used to produce it. The landing flight is illustration. Papiers human notes and approvals must be genuine, per [papiers-setup.md](../papiers-setup.md).

## Integration handoff

- **Aadit:** visual polish of the lab and assessment; keep every animated actor tied to a travel event and `counterfactual:result` on every run.
- **James:** new world levers become `set_lever` interventions automatically; keep the sandbox's event shape (`moved` with `wait_s`, `travel_s`, `fare_cad`, `shared_with_cars`) stable or tell Meet.
- **Steven:** the 100-agent panel; the hosted site reaches your agents through [ops/agents-tunnel.md](../ops/agents-tunnel.md).
- **Meet:** compiler, evidence, Vultr deploys (`ops/deploy.sh --skip-key`) and the Papiers loop.

## Tests

The suite in [README → Run and replicate](../README.md#run-and-replicate) covers paired replay, shared population, Game Master integrity, ledger reconciliation, fare and removal mechanisms, compiled levers, adapter series, and the API allowlist. `trace-adapter.js` and `experiment-adapter.js` keep their tests; the page itself loads only `experiment-adapter.js` (for `deciders`, used by the ledger).
