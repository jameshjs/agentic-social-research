# Devpost write-up (draft — paste section by section)

**Name:** Counterfactual Lab
**Tagline:** Ask a city "what if". Test the policy before you test it on people.
**Links:** live demo <https://155-138-141-130.sslip.io/experience/> · deck <https://155-138-141-130.sslip.io/pitch/> · code <https://github.com/jameshjs/agentic-social-research>
**Categories:** Papiers Autoresearch Challenge · U of T School of Cities · [MLH] Best Use of Vultr · Sustainable FinTech & Economic Inclusion (household and shop ledgers) · Top 3 overall

## Inspiration
In 2024 Ontario moved to remove the protected bike lanes on Bloor, Yonge and University. The City estimated the cost at more than $48 million for the three corridors. TTC fares have been frozen for three years running, and every budget reopens the question of raising them. Decisions like these touch thousands of people, and they are argued on intuition, with no way to try them first. Agent simulations promise a way to do that. Most of them, though, are an LLM role-playing a stereotype on a cartoon map, with numbers nobody can trace.

## What it does
You type a policy question. Counterfactual Lab:
1. **Compiles it.** A Vultr-hosted GLM-5.3-flash model maps the question to the levers of a real street model (fare, cycle track, car lanes, parking, signals, Line 2 frequency). A validator decides what can run. A question with no lever is kept as *speculative / not estimable*.
2. **Runs the city twice.** The same synthetic people, with homes, commutes, errands and budgets, live on a rule-checked map of **Bloor St W from Bathurst to Spadina**, built from City of Toronto open data, TTC GTFS and OpenStreetMap. A baseline and a policy world run from the same seed. Every walk, signal wait, subway boarding, fare and shop visit is validated by a game master, and every choice is a committed event.
3. **Shows the consequences.** A 3D city replays those events. A decision ledger lets you click any changed choice and watch that person. Household spending, shop receipts and TTC receipts are added up from the same events and reconcile exactly. Effects we cannot support, such as injuries, closures and citywide totals, are labelled *not estimable* rather than invented.
4. **Asks the people.** 100 persona agents, tuned against real survey respondents, give live reactions to the policy, each with a reason.

## How we built it
- **The world (James).** A 619 m sandbox with 925 buildings (City 3D Massing 2025), 243 businesses, mapped crosswalks and signals, the cycling network, Line 2 on its GTFS schedule, and background traffic routed and calibrated to the City's 25 Jun 2025 turning-movement counts (within 0.6% per day at both ends, max hourly GEH 0.45).
- **The engine (Meet).** `experiment.v2` runs paired experiments. One shared population serves both policies. Agents choose only among options the sandbox has already proven legal (0 rejected moves). Metrics are reduced only from events. Replays are exact, and sensitivity reruns are versioned. 87 automated tests cover it.
- **The persona autoresearcher (Steven).** A researcher agent tuned the Claude Haiku persona instructions against Twin-2K-500 respondents. Each round has one hypothesis and one edit, gets four code-computed checks and a noise bar from repeat runs, and ends with a human sign-off. Edits were drawn from papers the team highlighted and annotated in **Papiers**, and every round cites the highlight and note IDs. It ran 10 rounds and kept 2. The final set of 100 unseen respondents was scored once: 0.808 right-person accuracy against 0.756 (no persona) and 0.744 (most common answer), beating all four baselines.
- **The experience (Aadit).** A cinematic city intro, then the hypothesis prompt, then a three.js 3D replay of the mapped run, then an economic report. Everything reads one RunResult.
- **Vultr.**
  - Cloud Compute in Toronto serves the site and runs every paired experiment and sweep.
  - Serverless Inference GLM-5.3-flash compiles hypotheses with JSON-schema output (4/4 on our probe, 0 fallbacks).
  - Vultr **Clef** gave a typed second opinion on all 448 trip decisions (340 live calls, 0 errors, ~215 ms median, 91% agreement, both paired sanity checks passed).
  - The Vultr API provisions and deploys everything from scripts.

## Challenges
- Making two very different policies, a fare and a street redesign, run on the *same* people and map without a policy-specific engine.
- Keeping animation honest: nothing moves on screen unless the simulation recorded it.
- Tuning personas without fooling ourselves: noise bars, locked answer sheets, a single scored final set, and stopping when gains fell below noise.

## Accomplishments
- One question → one run → map, ledger and charts that all trace back to the same events.
- Persona agents measured against real people, not just prompted.
- A genuine human–agent research loop through Papiers notes, with the decision trail kept.

## What we learned
Honest labels are a feature. Marking *not estimable* earned more trust than a confident number would have.

## What's next
- Live Papiers retrieval inside the policy loop, so a researcher's note changes a city assumption and triggers a versioned rerun.
- More Toronto streets.
- Validating the decision agents on real travel diaries.

## Built with
JavaScript (Node 22, no framework), three.js, Python, Claude Haiku 5.5 and Opus 5.5, Vultr Cloud Compute, Vultr Serverless Inference (GLM-5.3-flash, Clef), Papiers, Caddy, City of Toronto Open Data, TTC GTFS, OpenStreetMap, Twin-2K-500.
