# Pitch deck

`index.html` is the 4-minute Hack the Valley 11 deck. It's one self-contained file (inline CSS, JS and SVG, no build step). The words and timing come from [SCRIPT.md](./SCRIPT.md), and Q&A prep is in [QA.md](./QA.md).

## Open it

- Local: open `pitch/index.html` directly in Chrome (`file://` works), or serve the repo root and visit `/pitch/`.
- Hosted: `node api/server.js` serves it at `/pitch/` (`/pitch` 301s to `/pitch/`). The allowlist rule only exposes `.html .png .jpg .svg .md` under `/pitch/`.
- Fonts: Space Grotesk and DM Sans load from Google Fonts. Offline, the deck falls back to Avenir Next / system-ui and Georgia, so the layout holds but the type looks different. Open it once online if you can.

## Keys

| Key | Action |
| --- | --- |
| → · Space · PageDown · click | next slide |
| ← · PageUp · shift-click | previous slide |
| Home / End | first / last slide |
| type a number | jump to that slide (`1` `2` for slide 12) |
| F | fullscreen |
| N | speaker notes: exact SCRIPT.md lines, timings and ⚠ source warnings |
| G | overview grid (Esc closes) |

`#5` deep-links a slide, and `#backup` jumps to the divider. Add `?notes` or `?grid` to the URL to open with that overlay showing. Swipe works on touch screens. Motion is disabled under `prefers-reduced-motion`.

Slides 1–6 are the 4-minute talk. Everything after the "Backup / Q&A" divider is for questions.

## Numbers

Every figure on a slide shows its source file on that slide. All of them come from the sourced table in SCRIPT.md and were re-checked against `persona-swarm/data/record/final.json`, `persona-swarm/autoresearch/results.tsv`, `experiment/sample-world-{bike,fare}.json`, `experiment/vultr-runs/*.json`, `VULTR.md`, `world/README.md` and `bloor-bike-demo.md`. If a fixture is regenerated, re-check slides 7, 8 and 10.

## Assets

Screenshots taken on 17 Oct 2026, JPEG, all under 250 KB.

| File | Used on | What |
| --- | --- | --- |
| `bloor-night-3d.jpg` | 1 | 3D Bloor St W section at night (local build) |
| `bloor-3d-policy.jpg` | 5, 7 | 3D bike-removal run, "With policy", people-affected panel |
| `lab-fare.jpg` | 8 | live `/experience/` fare run |
| `bloor-3d-baseline.jpg` | — | same 3D view, baseline (Devpost gallery extra) |
| `lab-bike.jpg` | — | `/experience/` bike run (extra) |
| `impact-bike.jpg` | — | economic report for the bike run (extra) |
| `agents-poll.jpg` | — | 100-agent ratings panel (extra) |
| `site-intro.jpg` | — | `/experience/` landing view (extra) |

The UI is still changing, so retake screenshots if the live site looks different on the day.
