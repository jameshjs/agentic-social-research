# TTC fare demo UI

A precomputed, seeded demo of the hypothesis "raise the TTC adult fare by $0.50". Everything on the page replays from one trace, so the 3D city and the numbers always agree.

## What's here

| File | Purpose |
| --- | --- |
| `index.html` | The demo page. A 3D district replays the baseline and the policy run from the same trace, with the same starting population and seed, alongside the assumptions panel and rerun controls. |
| `sim.js` | A deterministic, rule-based stand-in for the agent model. Same seed and assumptions give the same trace, so reruns are reproducible. |
| `sample-trace.json` | The precomputed trace the page loads. It follows `replay-trace-spec.md`. |
| `replay-trace-spec.md` | The trace format: run metadata, agents, events, metrics and result fields. |

## Dashboard hook

When a run finishes, the page dispatches a `counterfactual:result` window event whose `detail` is the full trace. The AI-built decision dashboard listens for it, so the dashboard and the 3D replay read the exact same event/result data:

```js
window.addEventListener("counterfactual:result", (e) => {
  const trace = e.detail;
  // render charts / decision brief from trace
});
```

## How to run

Serve the folder and open `index.html`. Opening the file directly (`file://`) can block `sim.js` in some browsers.

```bash
npx serve demo-ui
```

or, from inside `demo-ui`:

```bash
python -m http.server
```

Then open the printed URL (for example http://localhost:8000/index.html).
