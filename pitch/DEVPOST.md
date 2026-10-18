# Devpost write-up (draft — paste section by section)

**Name:** Two Worlds
**Tagline:** Ask a city "what if". Test the policy before you test it on people.
**Links:** live demo <https://twotwosmyworld.select/experience/> · deck <https://twotwosmyworld.select/pitch/> · code <https://github.com/jameshjs/agentic-social-research>
**Categories:** Papiers Autoresearch Challenge · U of T School of Cities · [MLH] Best Use of Vultr · Sustainable FinTech & Economic Inclusion (household and shop ledgers) · Top 3 overall

## Inspiration
In 2024 Ontario moved to remove the protected bike lanes on Bloor, Yonge and University. The City estimated the cost at more than $48 million for the three corridors. TTC fares have been frozen for three years running, and every budget reopens the question of raising them. Decisions like these touch thousands of people, yet there is rarely a cheap way to try them first. Agent simulations promise a way to do that.

## What it does
You type a policy question. Two Worlds:
1. **Compiles it.** A Vultr-hosted GLM-5.3-flash model maps the question to the levers of a real street model (fare, cycle track, car lanes, parking, signals, Line 2 frequency). A validator decides what can run. A question with no lever is kept as *speculative / not estimable*.
2. **Runs the city twice.** The same 19 synthetic people (12 residents, 7 visitors), with homes, commutes, errands and budgets, live on a rule-checked map of **Bloor St W from Bathurst to Spadina**, built from City of Toronto open data, TTC GTFS and OpenStreetMap. A baseline world and a policy world run from the same seed. Each person picks among legal trip options with an explicit scoring rule. A game master validates every walk, signal wait, subway boarding, fare and shop visit, and every choice is a committed event.
3. **Shows the consequences.** A 3D city replays those events. **See impact** follows a person whose choice changed and films both worlds from one fixed camera. Household spending, shop receipts and TTC receipts are added up from the same events and reconcile exactly. Each result is rerun across the assumption ranges and flagged when it flips sign or disagrees with published evidence. Effects we cannot support, such as injuries, closures and citywide totals, are labelled *not estimable* rather than invented.
4. **Asks 100 personas.** 100 persona agents, built from real US survey respondents, rate the policy from 1 to 5, each with a reason. These are survey-style reactions; they do not change the simulation.

## How we built it
- **The world (James).** A 619 m sandbox with 925 buildings (City 3D Massing 2025), 243 businesses, mapped crosswalks and signal locations (signal timings are assumed), the cycling network, Line 2 on its GTFS schedule, and background traffic routed and fitted to the City's 25 Jun 2025 turning-movement counts (within 0.6% per day at both ends, max hourly GEH 0.45).
- **The engine (Meet).** `experiment.v2` runs paired experiments. One shared population serves both policies. People choose only among options the sandbox has already proven legal (0 rejected moves). Metrics are reduced only from events. Replays are exact, and sensitivity reruns are versioned. 87 automated tests cover the world, engine, compiler and API.
- **The persona autoresearcher (Steven).** A researcher agent tuned the Claude Haiku persona instructions against Twin-2K-500, a panel of US survey respondents. Each round has one hypothesis and one edit, and gets four code-computed checks and a noise bar from repeat runs. A person signs off before any edit is kept. Rounds 7–10 drew their edits from papers the team highlighted and annotated in **Papiers**, and cite the highlight and note IDs. It ran 10 rounds and kept 2. The final set of 100 unseen respondents was scored once. On policy and pricing questions the agents gave the right person's answer 0.808 of the time, against 0.756 with no persona and 0.744 for the most common answer, beating all four baselines. On policy questions alone they did not beat the most common answer (0.792 against 0.810).
- **The experience (Aadit).** A cinematic city intro, then the hypothesis prompt, then a three.js 3D replay of the mapped run, then an economic report. The 3D replay and the report read one RunResult.
- **Vultr.**
  - Cloud Compute in Toronto serves the site and runs the paired experiments and sweeps (the browser runs them if the engine cannot be reached).
  - Serverless Inference GLM-5.3-flash compiles hypotheses with JSON-schema output (4/4 on our probe, 0 fallbacks).
  - Vultr **Clef** gave a typed second opinion on all 448 trip decisions (340 live calls, 0 errors, ~215 ms median, 91% agreement, both paired sanity checks passed). It is recorded beside the run, not used to produce it.
  - Scripts provision the VM through the Vultr API and deploy the site.

## Challenges we ran into
- Making two very different policies, a fare and a street redesign, run on the *same* people and map without a policy-specific engine.
- Keeping animation honest: every person you can follow in the 3D city replays committed events. Background cars and bikes come from the observed counts and are identical in both worlds.
- Tuning personas without fooling ourselves: noise bars, locked answer sheets, a single scored final set, and stopping when gains fell below noise.

## Accomplishments that we're proud of
- One question → one run → 3D replay, charts and report that all trace back to the same events.
- Persona agents scored against real survey respondents, not just prompted.
- A human–agent research loop for persona tuning: Papiers highlights and notes, one edit per round, and a human sign-off before anything is kept.

## What we learned
Honest labels are a feature. Our fare run produced a fare response 5–12 times stronger than published estimates. The useful output was the flag beside the number, not the number.

## What's next for Two Worlds
- Live Papiers retrieval inside the policy loop, so a researcher's note changes a city assumption and triggers a versioned rerun.
- More Toronto streets.
- Validating the choice rule and the persona agents on real travel diaries.

## Built with
JavaScript (Node 22, no framework), three.js, Python, Claude Haiku 5.5 and Opus 5.5, Vultr Cloud Compute, Vultr Serverless Inference (GLM-5.3-flash, Clef), Papiers, Caddy, City of Toronto Open Data, TTC GTFS, OpenStreetMap, Twin-2K-500.

## Image gallery
Screenshots of the live site, 18 Oct 2026, in [`assets/gallery/`](./assets/gallery/).

| File | Caption |
| --- | --- |
| `01-landing-globe.jpg` | Two Worlds opens on a globe and flies in to Toronto. |
| `02-ask-a-question.jpg` | Type any policy question over the city. |
| `03-bloor-3d-fare-policy.jpg` | Bloor St W, Bathurst to Spadina, in 3D: 925 City buildings, with the +$0.50 adult fare switched on. |
| `04-impact-tour-fare.jpg` | Same person, same seed: Elena takes the TTC in the baseline and drives under the higher fare. |
| `05-impact-tour-bike.jpg` | With the cycle track removed, Leila cycles via side streets instead of Bloor. |
| `06-report-fare.jpg` | Fare report: receipts, rides, shop sales and an elasticity flag, 5–12× stronger than published estimates. |
| `07-report-bike.jpg` | Bike-lane report: day-by-day charts; the headline directions hold across 6 assumption runs. |
| `08-stakeholder-table-fare.jpg` | Every indicator by stakeholder, with its range across assumption runs and where it flips sign. |
| `09-agents-poll-bike.jpg` | 100 persona agents rate the bike-lane removal from 1 to 5, each with a reason (survey-style, not a forecast). |
