# Q&A prep: one sentence first, then the proof

Answer in one sentence and then offer the proof: "happy to show it." Every answer below is true and backed by a committed file.

## The ones you will get

**"Is this a prediction?"** (Meet)
No. It's a test bench. The map, schedules and traffic counts are real, the people and their responses are synthetic, and every output is labelled that way. Anything we can't support, like injuries, closures or a citywide total, is marked not estimable instead of guessed.

**"How do you know the agents behave like people?"** (Steven)
We measured it. The persona instructions were tuned against real Twin-2K-500 survey respondents, then scored once on 100 held-out people: 0.808 right-person accuracy against 0.756 for no persona and 0.744 for the most common answer. We're also open about the limits. That's survey answers, not travel behaviour, and policy questions on new people sit just under the simple baselines.

**"Where does Papiers come in?"** (Steven)
Every tuning round starts from papers we annotated in Papiers. The round log cites the exact highlight and note IDs (for example the Funhouse Mirrors note behind round 9), and a human typed the review that kept or rejected each edit. Round 7 was revoked by Steven, round 9 was kept after a re-benchmark, and we stopped at round 10 when the gains fell below noise.

**"What stops the agents from doing impossible things?"** (James)
James's world is a game master. Every move goes through his sandbox: walkers use sidewalks and cross only at mapped crosswalks on the walk signal, vehicles stop at red, the subway leaves only at scheduled times and charges the fare, and shop visits happen only at the door. In the demo runs, 0 actions were rejected, because agents only choose among options the sandbox has already proven legal.

**"Is the map real?"** (James)
Yes. It's the 619 m of Bloor between Bathurst and Spadina, built from City of Toronto open data (3D massing, the pedestrian and cycling networks, signal locations, 2025 turning-movement counts), TTC GTFS and OpenStreetMap businesses. The routed background traffic reproduces the counts at both ends within 0.6% per day, with a max hourly GEH of 0.45. Signal timings are assumed, and we say so.

**"Why does removing the bike lane not help drivers?"** (James / Aadit)
Removal adds no car lane in this layout, and the cyclists who keep riding Bloor now sit in the drivers' queue at 0.5 car-equivalents each. Sample drivers go from 1.94 to 1.97 minutes. The City's own 2024 assessment also expected minimal driver gains.

**"How is this general and not a fare calculator?"** (Meet)
Type a different question. A Vultr-hosted GLM model turns it into the world's levers (fare, track, car lanes, parking, signals, Line 2 frequency), the backend validates it, and the same people run in the same city. "What if Line 2 came half as often?" compiles in about a second and runs. A question with no lever, like minimum wage, is kept as speculative / not estimable rather than faked.

**"How did you use Vultr?"** (Meet)
Four ways, all live:
- **Cloud Compute in Toronto** hosts the site and runs every paired experiment and sensitivity sweep.
- **Serverless Inference GLM-5.3-flash** compiles freeform questions with JSON-schema output. The probe got 4/4 right with 0 fallbacks.
- **Clef** gave a typed second opinion on all 448 trip decisions: 340 calls, 0 errors, 91% agreement, and both sanity checks passed.
- **The Vultr API** provisions and redeploys everything from scripts.

The receipts are in `experiment/vultr-runs/` and `/api/health`.

**"Why not have Clef make the decisions?"** (Meet)
It's the second opinion on purpose. It agrees 91% of the time, and where it disagrees, mostly with car owners, the policy result moves. That is the point: we show which model decided and let you compare, instead of hiding model choice inside one number.

**"Do the LLM agents make the decisions on the map?"** (Steven / Meet)
The map run uses an explicit, editable decision rule, so it's instant and replays exactly. The same decision slot takes a model. Vultr Clef decided every trip in a full replayable paired run. Steven's 40 Haiku deciders made 560 live decisions per policy in our first paired experiment, and Aadit's 3D viewer replays those too. On stage, the 100 Haiku agents give live 1–5 reactions.

**"Why only 19 people?"** (James)
Every person is fully traceable: each move, fare and purchase is an event you can click. The default scale is small so it runs in under a second and replays exactly. Steven's runtime adds 100 live persona agents for reactions and 40 for decisions, and the engine has no hard cap. We'd rather show 19 people we can audit than 10,000 dots we can't.

**"What's the economic part?"** (Meet)
Household fare and travel spending, shop receipts and TTC receipts are the two sides of the same transactions, so they reconcile exactly; the tests check it. Fare and bike results also split by Fair Pass versus adult riders.

**"What would you build next?"** (Meet)
- Live Papiers retrieval inside the policy loop, so a researcher's note changes a city assumption and triggers a versioned rerun the same way it already does for the persona tuning.
- More streets.
- A validation set of real travel diaries for the decision agents.

**"Did you train a model?"** (Steven)
No weights were trained. We tuned one instructions file, scored by code against real people, and every edit is in the round log.

## If they push on a weakness

- **"The gains are small."** "Yes, and we report the noise bar next to every gain. Round 9 cleared it by a hair, so we stopped instead of overfitting."
- **"Synthetic people means made-up results."** "The behaviour rules are explicit and editable on screen. Change one and the whole city reruns as a new version. That's the product: assumptions you can see and challenge."
- **"Why Bloor?"** "It's a real, live Toronto fight, and it's the one stretch where we could build every street, signal and shop from open data."
