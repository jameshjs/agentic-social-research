# TTC fare inspector module

This is Aadit's seeded TTC inspector. Its canonical public route is [the consolidated experience](../experience/README.md) at `/experience/?demo=fare`; `demo-ui/` remains a working module and standalone debug route. The 3D city and this inspector's numbers replay one deterministic, synthetic trace.

## What's here

| File | Purpose |
| --- | --- |
| `index.html` | The demo page. A 3D district replays the baseline and the policy run from the same trace, with the same starting population and seed, alongside the assumptions panel and rerun controls. |
| `sim.js` | A deterministic, rule-based stand-in for the agent model. Same seed and assumptions give the same trace, so reruns are reproducible. |
| `sample-trace.json` | A reference fixture. The current page generates a fresh deterministic trace with `CFSim.buildTrace({seed: 42})` on load; it does **not** fetch this file. |
| `replay-trace-spec.md` | The trace format: run metadata, agents, events, metrics and result fields. |

## Dashboard hook

When a run finishes, the page dispatches a `counterfactual:result` window event whose `detail` is the full trace. When embedded by `/experience/`, it also sends that trace to its same-origin parent through `postMessage`. [`experience/trace-adapter.js`](../experience/trace-adapter.js) turns it into the outer impact charts, so reruns update both views:

```js
window.addEventListener("counterfactual:result", (e) => {
  const trace = e.detail;
  // render charts / decision brief from trace
});
```

The generic world engine and real Papiers research loop are **not** in this module. A note typed here is browser-session input, not a verified Papiers annotation. The displayed sample grid is schematic west-end Toronto and is not calibrated to the locked UTSC-area observed fixture.

## How to run

Serve the repository root, then open `http://127.0.0.1:4173/experience/?demo=fare`. The standalone debug route is `http://127.0.0.1:4173/demo-ui/`. Opening the file directly (`file://`) can block scripts in some browsers.

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```
