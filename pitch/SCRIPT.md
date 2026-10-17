# Two Worlds: 4-minute pitch script

**Flow:** slides (1:30) → live site (2:05) → close (0:25), then 1 minute of Q&A ([QA.md](./QA.md)).
**Speakers:** Meet opens and closes. Steven covers the autoresearcher. Aadit drives the site. James answers world and engine questions in Q&A.
**Every number below is real** and comes from a committed file; the sources are at the bottom. Say them exactly. Judges can check.

## Before you walk up (5 minutes before)

- [ ] Laptop 1 (Aadit) shows <https://twotwosmyworld.select/experience/>, scrolled to the top, browser fullscreen (⌃⌘F), zoom 100%.
- [ ] Laptop 2 (Meet) shows the deck at <https://twotwosmyworld.select/pitch/> (or `pitch/index.html` opened from disk), fullscreen, slide 1. Press `N` once on your own screen to check the speaker notes.
- [ ] Steven: agent server and tunnel are up. `curl -s https://twotwosmyworld.select/health` returns `"ok":true`, and the site's corner pill reads **LIVE · 100 PERSONA AGENTS**.
- [ ] Warm the engine: open `?demo=bike` once, then `?demo=fare`, then return to the top. The first run after a server restart takes about 20 s, and you don't want that on stage.
- [ ] Wi-Fi fails: on Aadit's laptop run `python3 -m http.server 4173` from the repo and open `http://127.0.0.1:4173/experience/?engine=off`. The whole run happens in the browser. The agents panel says "offline". Skip that beat.

## 0:00–0:20 · Meet · Slide 1 "What if?"

> "In 2024, Ontario moved to tear out the protected bike lanes on Bloor, Yonge and University. The City put the bill at over 48 million dollars. And the TTC fare has been frozen three years running, so every budget asks the same question: raise it? Decisions like these get made on gut feel and shouting matches. Nobody gets to test them first."

## 0:20–0:40 · Meet · Slide 2 "Ask a city what if"

> "Two Worlds lets you ask a city *what if*. Type a policy. We generate the people it affects, put them on a real, rule-checked map of Bloor Street, and run the city twice, once without the policy and once with it. Then we show every choice, every dollar, and what we *can't* know."

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

## 1:30–3:35 · Aadit · Live site (Earth → question → agents → 3D impact)

| Time | Do | Say |
| --- | --- | --- |
| 1:30 | Page is at the top. **Scroll slowly** through the clouds and Earth-to-Bloor fly-in. | "This is Toronto. Let's zoom into one real section of Bloor." |
| 1:38 | At the question box, type **What if Bloor's protected bike lane were removed?** and click **Run the city**. | "One freeform question starts the experiment. The two demo cases are recognized from what we type; there are no scenario buttons." |
| 1:45 | If the agents are online, the **100-agent reaction** appears first. Show the live distribution and one reason; then scroll to the lab. If the tunnel is down, go straight to the lab. | "These are survey-style reactions from synthetic personas, not a forecast. They help us ask what to inspect in the city." |
| 2:05 | Let the 3D world load on **Baseline**. | "This is the mapped 619-metre Bathurst–Spadina section. The street, businesses, signals and transit context are sourced; the people and their responses are synthetic." |
| 2:15 | Click **See bike impact**. Let the camera follow each of the four people whose choice changed. | "Same people, same seed. With the track removed, one rider takes a side street; others switch to TTC or shop elsewhere. Every visible decision comes from the paired run." |
| 2:50 | Point to the four metric tiles below the 3D scene. | "Bloor bike trips, metres cycled beside cars, shop sales and car trips are reduced from those events. The simulated Bloor bike trips fall; shared-lane cycling rises. We do not turn that into an injury or city-wide forecast." |
| 3:15 | Keep the 3D scene on screen. | "The public view keeps the city first." |

**If something breaks:**
- **3D doesn't load:** press the `2D` button. The same run plays on the 2D map.
- **Agents panel says offline:** skip it and say "they're on Steven's laptop".
- **Site is down:** switch to the deck's backup slides 7–9 (screenshots of each beat).

## 3:35–4:00 · Meet · Slide 5 "Why this wins"

> "One city. Any question. Two very different policies on the same people, from real Toronto open data. Persona agents tuned with Papiers research and human sign-off. And it all runs on **Vultr**: cloud compute runs the experiments, a GLM model on Vultr turns any question into a runnable policy, and Vultr's Clef model double-checked all 448 trip decisions, agreeing 91% of the time.
>
> Two Worlds. Test the policy before you test it on people."

## Phrases to use, and to avoid

| Say | Don't say |
| --- | --- |
| "explore", "stress-test", "show the trade-offs" | "predict", "forecast", "will happen" |
| "19 synthetic people on a real map" | "Toronto residents" |
| "agents tuned against real survey answers" | "AI that thinks like Torontonians" |
| "closes early next period, under our staffing rule" | "the shop will close" |
| "Clef cross-checked every decision" | "Clef makes the decisions" |

These lines are what make the numbers defensible in Q&A. Confident is good. Making things up gets caught.

## Number sources (for anyone asked "where's that from?")

| Number | Source |
| --- | --- |
| $48M+ for Bloor, Yonge and University | City of Toronto 2024 supplemental report; see [bloor-bike-demo.md](../bloor-bike-demo.md) B07 |
| Fares frozen a third year | `data/ttc_fare_context.json` (2026 TTC budget, p. 9) |
| 81% right person on the final set (0.808); 76% no persona; 74% most common answer; 10 rounds; 2 kept (003, 009) | `persona-swarm/data/record/final.json`, `persona-swarm/autoresearch/results.tsv` |
| 100 agents live; 40 deciders × 560 calls per policy run | `persona-swarm/RUNTIME.md`, `persona-swarm/data/city/live/samples/*run*.json` |
| 619 m, 925 buildings, 243 businesses, calibration within 1% (max hourly GEH 0.45) | [world/README.md](../world/README.md) |
| Bike run: Bloor cycling trips 7 → 3 in period 4; 0 → 1,135 m shared with cars; shop receipts $316 → $260; Curbside Cycle reduced hours; drivers 1.94 → 1.97 min (slower, not faster); 15 changed choices; 0 rejected moves | `experiment/sample-world-bike.json` |
| Fare run: 8 changed choices, 0 Fair Pass changes | `experiment/sample-world-fare.json` |
| Clef: 448 decisions, 340 live calls, 0 errors, 91% agreement | `experiment/vultr-runs/clef-world-*.json`, [VULTR.md](../VULTR.md) |
