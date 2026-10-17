# Counterfactual Lab: 4-minute pitch script

**Flow:** slides (1:30) → live site (2:05) → close (0:25), then 1 minute of Q&A ([QA.md](./QA.md)).
**Speakers:** Meet opens and closes. Steven covers the autoresearcher. Aadit drives the site. James answers world and engine questions in Q&A.
**Every number below is real** and comes from a committed file; the sources are at the bottom. Say them exactly. Judges can check.

## Before you walk up (5 minutes before)

- [ ] Laptop 1 (Aadit) shows <https://155-138-141-130.sslip.io/experience/>, scrolled to the top, browser fullscreen (⌃⌘F), zoom 100%.
- [ ] Laptop 2 (Meet) shows the deck at <https://155-138-141-130.sslip.io/pitch/> (or `pitch/index.html` opened from disk), fullscreen, slide 1. Press `N` once on your own screen to check the speaker notes.
- [ ] Steven: agent server and tunnel are up. `curl -s https://155-138-141-130.sslip.io/health` returns `"ok":true`, and the site's corner pill reads **LIVE · 100 PERSONA AGENTS**.
- [ ] Warm the engine: open `?demo=bike` once, then `?demo=fare`, then return to the top. The first run after a server restart takes about 20 s, and you don't want that on stage.
- [ ] Wi-Fi fails: on Aadit's laptop run `python3 -m http.server 4173` from the repo and open `http://127.0.0.1:4173/experience/?engine=off`. The whole run happens in the browser. The agents panel says "offline". Skip that beat.

## 0:00–0:20 · Meet · Slide 1 "What if?"

> "In 2024, Ontario moved to tear out the protected bike lanes on Bloor, Yonge and University. The City put the bill at over 48 million dollars. Every year the TTC fare goes up again. Decisions like these get made on gut feel and shouting matches. Nobody gets to test them first."

## 0:20–0:40 · Meet · Slide 2 "Ask a city what if"

> "Counterfactual Lab lets you ask a city *what if*. Type a policy. We generate the people it affects, put them on a real, rule-checked map of Bloor Street, and run the city twice, once without the policy and once with it. Then we show every choice, every dollar, and what we *can't* know."

*Click to slide 3, hand to Steven.*

## 0:40–1:30 · Steven · Slides 3–4 "Agents that research how to be human"

> "The hard part is people. Ask an LLM to 'act like a cyclist' and you get a stereotype. So we built an agent that researches how to be human.
>
> It tunes our persona instructions against real people, the Twin-2K-500 survey respondents. Each round has one hypothesis and one edit. Code scores it on four checks. A human signs off or rejects it.
>
> *(slide 4)* The ideas came from papers our team read and annotated in **Papiers**. Every round links the exact highlight and note it used. Ten rounds, two kept. We stopped when the gains fell below the noise.
>
> Then we scored it once, on 100 people it had never seen. It gets the right person's answer **81% of the time**. That beats all four baselines: a generic agent with no persona gets 76%, and just guessing the most common answer gets 74%.
>
> Those tuned Haiku agents are running live right now, 100 of them. Aadit?"

## 1:30–3:35 · Aadit · Live site (city → prompt → 3D → reports)

| Time | Do | Say |
| --- | --- | --- |
| 1:30 | Page is at the top. **Scroll slowly** through the clouds. | "This is Toronto. Scroll down…" |
| 1:38 | Composer appears. Click the **Bloor bike lane** chip. | "…and ask it anything. Let's take the hard one: remove the protected bike lane on Bloor." |
| 1:45 | The run overlay plays, then the 3D view. Leave it on **Baseline**. | "This is the real 619 metres of Bloor, Bathurst to Spadina. 925 buildings from the City's 3D massing data, 243 real businesses, real signals, Line 2 on its actual schedule. The background traffic is calibrated to the City's 2025 counts, within 1% at both ends." |
| 2:05 | Click **With policy**. | "Same 19 people, same seed. The only difference is the track is gone. Watch the cyclists: they're in the car lane now." |
| 2:15 | In the ledger or the people list, click **Leila**. The camera flies to her. | "Leila is a less-confident cyclist. She stops riding Bloor and takes a side street. Hawa, Maria and Sam switch to the TTC." |
| 2:35 | **Scroll** to the report. | "Every number here is added up from those events. Nothing is typed in by hand." |
| 2:40 | Point at the headline and the charts. | "Cycling trips on Bloor drop from 7 to 3. Cycling next to cars goes from zero to over a kilometre a day. Kaya, a visitor, shops somewhere else, so Curbside Cycle's takings fall below its staffing line and it closes early the next week. And drivers? No time gain. Those cyclists are in the drivers' queue now." |
| 3:05 | Point at the *not estimable* list. | "Injuries, closures, construction cost: we mark them not estimable instead of making them up." |
| 3:12 | Scroll to the **100 agents** panel. | "And here are Steven's 100 agents reacting live: the rating split, by group, each with a reason." |
| 3:25 | *(Only if ahead of time)* Click **TTC fare**. | "Same city, same people, a different policy. Fair Pass riders don't move. Adults near the cutoff do." |

**If something breaks:**
- **3D doesn't load:** press the `2D` button. The same run plays on the 2D map.
- **Agents panel says offline:** skip it and say "they're on Steven's laptop".
- **Site is down:** switch to the deck's backup slides 7–9 (screenshots of each beat).

## 3:35–4:00 · Meet · Slide 5 "Why this wins"

> "One city. Any question. Two very different policies on the same people, from real Toronto open data. Persona agents tuned with Papiers research and human sign-off. And it all runs on **Vultr**: cloud compute runs the experiments, a GLM model on Vultr turns any question into a runnable policy, and Vultr's Clef model double-checked all 448 trip decisions, agreeing 91% of the time.
>
> Counterfactual Lab. Test the policy before you test it on people."

## Phrases to use, and to avoid

| Say | Don't say |
| --- | --- |
| "explore", "stress-test", "show the trade-offs" | "predict", "forecast", "will happen" |
| "19 synthetic people on a real map" | "Toronto residents" |
| "agents tuned against real survey answers" | "AI that thinks like Torontonians" |
| "closes early next week, under our staffing rule" | "the shop will close" |
| "Clef cross-checked every decision" | "Clef makes the decisions" |

These lines are what make the numbers defensible in Q&A. Confident is good. Making things up gets caught.

## Number sources (for anyone asked "where's that from?")

| Number | Source |
| --- | --- |
| $48M+ for Bloor, Yonge and University | City of Toronto 2024 supplemental report; see [bloor-bike-demo.md](../bloor-bike-demo.md) B07 |
| 81% right person on the final set (0.808); 76% no persona; 74% most common answer; 10 rounds; 2 kept (003, 009) | `persona-swarm/data/record/final.json`, `persona-swarm/autoresearch/results.tsv` |
| 100 agents live; 40 deciders × 560 calls per policy run | `persona-swarm/RUNTIME.md`, `persona-swarm/data/city/live/samples/*run*.json` |
| 619 m, 925 buildings, 243 businesses, calibration within 1% (max hourly GEH 0.45) | [world/README.md](../world/README.md) |
| Bike run: Bloor cycling trips 7 → 3 in period 4; 0 → 1,135 m shared with cars; shop receipts $316 → $260; Curbside Cycle reduced hours; drivers 1.94 → 1.97 min (slower, not faster); 15 changed choices; 0 rejected moves | `experiment/sample-world-bike.json` |
| Fare run: 8 changed choices, 0 Fair Pass changes | `experiment/sample-world-fare.json` |
| Clef: 448 decisions, 340 live calls, 0 errors, 91% agreement | `experiment/vultr-runs/clef-world-*.json`, [VULTR.md](../VULTR.md) |
