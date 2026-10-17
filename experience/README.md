# Cinematic city experience — interactive UI prototype

This is Meet's **front-end concept** for the entry → scenario reveal → impact exploration flow. It complements Aadit's detailed analyst console in the [reference artifact](https://claude.ai/artifact/Xw7QbBb3gP723j36MacTs7); it is not a replacement for the shared world engine or a claim that the live AI swarm is already connected.

## Run it

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/experience/`. No package install or build is required. The in-app browser may block direct `file://` navigation, so the local HTTP server is the supported preview route. JavaScript and graphics are self-contained; the optional Google font request has system-font fallbacks.

## What works now

1. **Cloud descent:** a continuously animated isometric city sits behind a scroll-driven cloud reveal; an entry control scrolls to the centered hypothesis composer.
2. **Two prepared Toronto cases:** TTC adult fare +$0.50 in the UTSC-area illustrative district, and hypothetical protected Bloor West bike-lane removal. Both use the same screen, state machine, city renderer, charts, and sector map. Baseline/policy toggles change vehicles and, for Bloor, show or remove the coloured bike lane. The Bloor scene uses a schematic low-rise corridor and a subway marker; its surface bus stays on a cross street.
3. **Replay transition:** the composer recedes behind a four-step prepared replay, then the camera zooms into the district. The overlay explicitly says **no live model call**.
4. **Living city illustration:** canvas frames draw buildings, shops, homes, roads, buses, cars, bicycles, people, trees, and moving example trails. Play/pause and timeline scrubbing change animated actor positions; baseline/proposal switches alter prepared street views. Markers open a corresponding sector.
5. **Impact map:** five connected sectors open a large chart and evidence note. A second grid shows all five baseline/policy charts at once; each card opens the relevant sector.
6. **Responsive and accessible:** keyboard reachable controls, dialog semantics, visible focus, mobile layout, a reduced-motion path, frame-rate throttling on smaller screens, and capped device pixel ratio.

## Truth in the demo

The figures in [scenarios.js](./scenarios.js) are **illustrative UI data**, not empirical Toronto estimates or generated `RunResult`s. Displayed percentage changes compare the fourth model period in each synthetic baseline/proposal chart. The arbitrary-input path accepts a question but marks all outcomes **not estimable**; only the exact prepared prompts or preset controls open the two replays. Custom questions show a neutral illustration with no policy state comparison or invented metrics. The original studies and data limits are in [demo-data.md](../demo-data.md), [papers.md](../papers.md), and [bloor-bike-demo.md](../bloor-bike-demo.md).

Before presenting this as a working policy simulator, James/Steven/Meet must supply one shared `RunResult` and event trace. Replace `scenarios.js` replay values with a run adapter that drives **all** visible metrics, chart series, actor paths, and labels from the same result. Keep the public-data facts and assumptions in separate fields. The timeline currently scrubs example actor motion; it must later scrub actual world events and synchronized metric points. Papiers human notes and approvals must also be genuine, per [papiers-setup.md](../papiers-setup.md).

## Integration handoff

- **Aadit:** reuse this shell, city illustration or camera/overlay ideas around the existing detailed city inspector. The current canvas is a visually rich prototype; use actual world events for production animation. The clickable sector map and chart components can move into React later without redesigning the interaction.
- **James:** provide `RunResult` with scenario ID, coordinates, actors, `WorldEvent`s, baseline/policy `MetricPoint`s, sector/edge trace IDs and source/assumption IDs. Extend visual cues for bicycle and subway actions, or supply a typed mode/route payload that the renderer can map safely.
- **Steven:** connect scenario-specific personas and choices to the actor markers and event trail; do not animate a trip or shop sale that did not occur in the authoritative world.
- **Meet:** wire the compiler/evidence packet and real Toronto source badges. The current arbitrary prompt path intentionally does not claim a backend response.

## Local QA already done

`node --check` passed for all three scripts. The in-app browser was used to inspect desktop and narrow mobile views, run both prepared scenarios, compare the Bloor baseline/policy street, scrub animation, open the connected map and chart cards, and test custom prompts for TTC fare decrease and bike-lane addition. Both stay speculative with no invented result. Browser console showed no errors in the initial visual pass. All paths still need the production engine; the prepared UI paths are replays.
