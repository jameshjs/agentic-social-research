# PRD — Counterfactual Lab

**Working title:** Counterfactual Lab (rename with the team)
**Status:** Final product scope v1.0; model credentials, exact stack, and deployment URL are implementation fields to fill at kickoff
**Hackathon:** Hack the Valley 11, 16–18 October 2026
**Owners:** Meet (product/compiler/evidence/integration), James (world engine/orchestrator/backend), Steven (persona swarm), Aadit (city frontend)
**Product type:** General-purpose, human-guided social hypothesis simulator
**Primary competition target:** Papiers Autoresearch
**Secondary:** Hack the Valley × U of T School of Cities
**Additional:** Sustainable FinTech & Economic Inclusion, if the final demo visibly covers economic access

## 1. Executive decision

Counterfactual Lab accepts a freeform hypothesis such as “What if bus fares rose?”, “What if a bus route disappeared?”, “What if minimum wage increased?”, or “What if protected bike lanes were added?” It converts the hypothesis into a structured scenario, creates a scenario-specific population of synthetic households, workers, firms, and institutions, runs baseline and intervention worlds, and shows the resulting choices, interactions, and possible second-order effects. Researchers can add sources and their own notes, correct assumptions, and rerun the same world.

**Product promise:** “Turn an idea into an inspectable social experiment in minutes.”

**Founder decision:** The input is truly unrestricted. Every submitted hypothesis produces an interactive run, including when relevant public data or a causal model is missing. Such a run is labeled **speculative exploration** and asks the user to inspect the generated assumptions. The product never silently refuses a hypothesis or substitutes a static research plan. It cannot truthfully produce a calibrated quantitative forecast for every hypothesis; its output label varies by evidence quality.

**Hackathon proof of generality:** Run **two different hypotheses through the same textbox, scenario compiler, persona generator, world engine, result schema, and UI**. Locked demo pair: a TTC fare change and a hypothetical **Ontario minimum-wage change affecting Toronto**. Include a third unprepared audience prompt in rehearsal to test the generic fallback. Every run must create relevant stakeholders, actions, metrics, and causal pathways. The UI must not be a disguised fare calculator.

### Track eligibility and demo obligations

The [written rules](https://hack-the-valley-11.devpost.com/rules) allow one project to enter multiple prize categories, and the [Devpost overview](https://hack-the-valley-11.devpost.com/) says to select the categories in the submission. No published Papiers requirement to use its software/API was found. The team is four people, within the published maximum of four, assuming all members are registered, eligible students, and physically present for judging.

| Track | Published requirement / brief | Our fit if built as specified | Must show in demo/submission |
| --- | --- | --- | --- |
| **Papiers Autoresearch — primary** | Human and AI agents work together; agents build on what people have read, questioned, and learned, ask for expertise, and keep humans informed | **Strong, conditional**: the research-memory and revision loop must actually work | Two human-authored notes or judgments, an agent use of one note, a challenge/question, a human correction, and a rerun with audit trail |
| **School of Cities — secondary** | Useful civic prototype for a concrete Toronto urban problem, founded on Toronto urban data; no election prediction/candidate support | **Strong, conditional**: general simulation alone does not satisfy the data/user requirement | Fare affordability question framed for a Toronto civic user; source-linked Toronto neighbourhood/GTFS/fare inputs; accessible result and limitation |
| **Sustainable FinTech & Economic Inclusion — additional** | Public page lists the category title without a detailed rubric | **Plausible stretch**: economic inclusion needs to be visible, not merely mentioned | Household fare burden and wage/budget effects, subgroup comparison, financial tradeoffs; describe sustainability only if evidenced |
| **Best AI for Social Impact — optional** | Public page lists the category title without a detailed rubric | **Plausible** if civic use and human-guided AI are demonstrated | Select if the initial submission offers it; do not divert engineering effort from primary tracks |

Top 3 overall consideration is automatic per Devpost. Do not select climate action based solely on an unmeasured CO₂ story. Final awards remain judge decisions; this matrix is a published-brief fit assessment, not an eligibility guarantee.

## 2. The problem

Policy researchers and civic teams need to think through who is affected, what people may do in response, and which indirect effects deserve investigation. Research, stakeholder consultation, and model building take time. Simple dashboards expose correlations; generic chatbots produce fluent narratives; complex agent-based models require specialized setup. Teams also lose institutional context when their prior notes, disagreements, and source judgments are scattered.

The product compresses the **early hypothesis exploration** stage. It helps a researcher formulate mechanisms, surface overlooked stakeholder groups, compare plausible scenarios, and create a testable research agenda. It is useful before commissioning surveys, consultations, or a full causal study.

### Target users and jobs

| User | Job | Success signal |
| --- | --- | --- |
| Policy analyst / civic researcher (primary) | Stress-test a proposed intervention and prepare questions for deeper research | Can trace each result to an agent action, rule, assumption, and source |
| Community organization (secondary) | Identify which groups might experience burdens or benefits | Can inspect subgroup paths without being told simulated personas are real residents |
| Journalist / student researcher (secondary) | Explore a public-policy claim and its caveats | Can export a readable brief with evidence and uncertainty |
| Research team member | Carry forward reading notes and challenge a model assumption | Sees their note used or rejected with a reason and can trigger a revision |

## 3. Strategic options — decide consciously

These are genuinely different products. The recommended choice combines the strongest pieces of A, B, and C without promising the evidence level of a full policy model.

| Option | What it is | Strength | Cost / weakness | Hackathon fit |
| --- | --- | --- | --- | --- |
| **A. Pure LLM society sandbox** | Many personas talk and act in a simulated city after any prompt | High wow factor; broad prompts; emergent stories | Expensive/slow; hard to reproduce; believable dialogue is not validated prediction | Great visual demo, weak answer to “why trust it?” |
| **B. Hypothesis compiler + modular world engine (recommended)** | LLM compiles a prompt into typed changes; agents choose from bounded actions; deterministic world applies them | Truly reusable pipeline; replayable; inspectable causal chains | Limited action vocabulary and world mechanics must be built carefully | Best balance of generality, technical quality, and honest claims |
| **C. Stakeholder deliberation lab** | Synthetic residents, businesses, and experts debate a proposal; human researcher moderates | Strong Papiers fit; fast to ship; surfaces blind spots | Reports perspectives more than outcomes; weaker “see the city change” moment | Strong fallback if simulation engine slips |
| **D. Research co-pilot + evidence graph** | Agents gather literature, find contradictions, and propose experiments | Strongest research rigor and Papiers fit | Less visually distinctive; does not realize the swarm concept | Strong companion layer or reduced-scope fallback |
| **E. Domain-specific policy model** | One calibrated transit/urban/economic model | Credible numbers in one domain | Violates the intended general product promise | Use only as one demo module, never as the whole product |

**Product decision:** Build B as the core for known mechanisms, with A as a **generic exploratory fallback** for any unrecognized hypothesis. Use C’s human challenge loop and D’s evidence graph. The living city is the primary output and research brief is secondary. The Toronto fare case is one **grounded example**, not the product definition. This dual engine maximizes breadth and visual interactivity while labeling ungrounded claims as speculative.

## 4. Goals, non-goals, and success criteria

### Product goals

1. A user can enter any natural-language hypothesis without choosing a prebuilt scenario template, and always receive a run.
2. The system derives the intervention, target population, time horizon, candidate mechanisms, metrics, and missing assumptions.
3. The system autonomously generates a **distinct, relevant** synthetic society for each hypothesis and shows why each stakeholder type was included.
4. Agents make choices, interact, update state, and create an event trace over time.
5. The system compares baseline and intervention with the same starting population and random seed.
6. A human can supply research notes, answer a clarifying question, edit assumptions, and rerun.
7. Every result identifies observed data, model assumptions, simulated observations, and unsupported speculation separately.
8. The visual world is the primary experience: buses, cars, people, homes, shops, and workplaces visibly change as agents act. The analytical report uses the exact same event/result data.

### Hackathon acceptance criteria

| ID | Measurable criterion | Priority |
| --- | --- | --- |
| G1 | Two substantively different freeform hypotheses complete the same end-to-end pipeline, plus one unprepared prompt completes the generic fallback in rehearsal | P0 |
| G2 | Each hypothesis creates different stakeholder mix, intervention rules, actions, and metrics | P0 |
| G3 | Baseline and changed run share seed and initial state; replay produces identical structured outputs for a fixed model response snapshot | P0 |
| G4 | At least 4 deep decision-making personas plus 50–200 lightweight population entities or weighted cohorts participate in a 3–5 tick run; target 8 deep personas if budget permits | P0 for 4; adjust above that to API budget |
| G5 | At least one agent-to-agent or agent-to-institution interaction changes another actor’s subsequent action/state | P0 |
| G6 | A human note or correction visibly changes a compiled assumption or result, with audit history | P0 |
| G7 | Each headline result has an event path and evidence/assumption label | P0 |
| G8 | Live demo reaches a result in about 90 seconds per scenario; cached replay works if model/network is unavailable | P0 |
| G9 | Toronto scenario uses at least one actual Toronto dataset and links to it | P0 for School of Cities |
| G10 | User can compare subgroup effects and export/share a one-page research brief | P1 |
| G11 | Live city shows moving buses/cars, people leaving/entering homes and shops, and a state-changing business/institution response, all driven by the run's event log | P0 |
| G12 | The city has a polished visual system: coherent art direction, readable camera, clear policy-change moment, responsive controls, and a traceable connection between animation and metrics | P0 |

### Explicit non-goals for the weekend

- Claiming synthetic people are respondents or a replacement for public consultation.
- Predicting real-world election outcomes, endorsing candidates, or determining a policy is “best.”
- Calibrating every domain from a single census file.
- Running thousands of separate LLM calls per simulation.
- Treating persona dialogue as the numerical model.
- Auto-executing arbitrary code generated from a user's prompt.
- Full Toronto-scale geographic fidelity, real-time TTC operations, or city-wide economic forecasts. A polished small district is acceptable if it contains the required live systems.

## 5. Product principles

1. **Unrestricted input, two execution paths.** Freeform language maps to a bounded scenario schema and effect operators when possible; otherwise a generic event/action simulation runs with visible speculative assumptions.
2. **Scenario-specific people.** A fare hypothesis needs riders, drivers, employers, TTC, and businesses; a wage hypothesis needs workers, employers, customers, and public agencies. The persona generator must explain coverage and exclusions.
3. **Interactions matter.** A decision changes budgets, access, demand, information, or another agent's opportunities. The world records these changes as events.
4. **Human judgment stays in the loop.** Notes and corrections are first-class inputs. The system asks one useful question rather than silently guessing a critical parameter.
5. **Claims match evidence.** A number in a simulated world is not automatically an estimate for Toronto. Results display their epistemic status.
6. **Same model, two worlds.** Control and intervention differ only in the specified change and downstream responses.
7. **Visible life comes from state.** Animated buses, cars, shoppers, residents, and businesses must represent events produced by the simulation. The scene is a primary product surface.

## 6. Core user journey

### 6.1 Create a study

1. User enters: “What if Toronto increased the adult TTC fare by $0.50 next year?”
2. System proposes a study card: intervention, baseline, geography, time horizon, units, primary outcomes, potentially affected groups, evidence tier, and missing inputs.
3. The first run begins with visible default assumptions. The user may pause/edit the card; a single high-value clarification appears without blocking the exploratory run (e.g. “Does Fair Pass also increase?”). A revised answer creates a new run version.
4. User can attach a source link and a note (“Keep low-income discount unchanged because we want to test distributional effects of adult fares”).

### 6.2 Construct the synthetic world

5. System retrieves allowed source facts and constructs a **population blueprint**: stakeholder types, proportions/weights where evidence exists, constraints, goals, resources, location, ties, and default behaviours.
6. A coverage panel lists included groups and exclusions. It labels which traits came from data and which were synthesized as assumptions.
7. User can inspect/edit one persona before running; edits become a versioned override.

### 6.3 Run and inspect

8. Baseline and intervention start from a common saved snapshot. World engine advances 3–5 ticks (e.g. weeks/months), requesting bounded decisions from a small set of LLM agents while larger cohorts follow reusable decision functions.
9. Users watch a map/scene transition. The same event log feeds counters, charts, and a “why did this happen?” causal path.
10. Results show direct effects, indirect effects within the model, subgroup differences, and sensitivity to key parameters. The report says what further real-world data would test the hypothesis.

### 6.4 Research loop

11. Researcher flags a result or adds contradictory evidence. Skeptic agent explains what assumption it challenges.
12. User changes/approves a model input, reruns, and sees a version comparison. The brief records the original and revised conclusion.

## 7. Functional requirements

### 7.1 Hypothesis intake and compiler

| ID | Requirement | Acceptance |
| --- | --- | --- |
| H1 | Accept arbitrary natural-language hypothesis | Textbox accepts fare, wage, bike-lane, and unrelated prompts without routing to a preset page |
| H2 | Extract `intervention`, `baseline`, `target`, `geography`, `horizon`, `outcomes`, `mechanisms`, `source needs` | Typed schema passes validation; unknown fields are visible |
| H3 | Map familiar interventions to bounded operators | Operators include `change_cost`, `change_income`, `change_travel_time`, `change_access`, `change_capacity`, `change_information`, `change_rule` |
| H4 | Ask for clarification only when the unknown parameter changes plausible outcomes materially | Max one high-value nonblocking question for demo; initial defaults logged and editable |
| H5 | Assign support tier | Grounded / assumption-driven / speculative; cannot label a run grounded without source + relevant behavioural rule |
| H6 | Run unrestricted prompts | If an intervention cannot map to known operators, generate a scenario-specific world schema and bounded JSON actions; run anyway as speculative exploration |
| H7 | Show generated assumptions before or during run | User can inspect and revise them without having to author a model |

The compiler produces a **ScenarioSpec**, not executable code. Its output is validated against a JSON schema. For unfamiliar domains it creates a dynamic list of state variables, agent roles, allowed actions, and illustrative transition rules encoded as data; the generic engine can run them without executing generated code. The user may edit assumptions through form controls. Prompt injection from retrieved pages must not alter system rules or tools.

### 7.2 Evidence and human research memory

| ID | Requirement | Acceptance |
| --- | --- | --- |
| E1 | Source registry with URL, title, publisher, year, geography, licence, claim, and retrieval date | Every external data/parameter has provenance |
| E2 | Human notes with author, timestamp, source/reference, stance, and target assumption | A note can influence a run and is visible in the audit trail |
| E3 | Research agent extracts candidate facts and causal claims | Output distinguishes source text, interpretation, and unsupported extrapolation |
| E4 | Skeptic agent challenges weak leaps and missing groups | At least one useful challenge occurs in demo; no empty generic warning |
| E5 | Results identify unresolved assumptions | Brief includes “needs validation” and direct links |

This loop is the primary [Papiers Autoresearch challenge](https://hack-the-valley-11.devpost.com/) evidence: agents build on what people previously read, question, and know; they ask for expertise and keep researchers informed. A citation list alone is insufficient.

### 7.3 Personas and population

| ID | Requirement | Acceptance |
| --- | --- | --- |
| P1 | Generate stakeholder types from causal graph | Fare and wage studies have meaningfully different stakeholder sets |
| P2 | Generate each reasoning agent with role, goals, budget/resources, constraints, location, knowledge, relationships, action options, and memory | Persona JSON validates; UI explains why included |
| P3 | Allocate synthetic population using defensible source margins where available | Source and sampling method shown; unsupported joint distributions labeled as assumptions |
| P4 | Include vulnerable/low-power groups when relevant to scenario | Coverage checklist flags missing groups rather than assuming one average resident |
| P5 | Avoid sensitive stereotypes and fake identity claims | Personas are synthetic archetypes; attributes are relevant to mechanism |
| P6 | Permit manual edit/lock of a persona or group | Rerun shows override in provenance |
| P7 | Give every visible person a distinct persistent profile | People differ in at least role, goal, constraint, resources, location, relationship or preference; deep-agent subset gets LLM decisions, others use profile-conditioned rules |

**Recommended scale:** 8–16 LLM reasoning agents with persistent memory; 50–200 additional **individually profiled** lightweight entities for visual density and aggregation. Every person has a generated identity within the synthetic world and can make profile-conditioned choices; only the deep subset uses a separate LLM call each tick. A few deep agents represent households, a business, transit agency, employer, and community organization. Entity count is not a scientific sample size.

**Autonomous persona-generation recipe (P0):**

1. Turn the compiled hypothesis into a causal graph: direct targets, decision-makers, beneficiaries, burdened groups, intermediaries, and institutions.
2. Generate a **coverage matrix** of stakeholder roles × mechanisms × locations. Require at least one agent on both sides of a resource exchange or policy tradeoff (for example rider–TTC, worker–employer, tenant–landlord).
3. Create role-specific constraints and resources, then diversify individuals within each role by goals, routines, relationships, budget, access, and risk tolerance. Keep traits relevant to the hypothesis; do not use protected identity as a shortcut for behaviour.
4. If public data exist, fit only supported margins and tag each fitted field. If data are absent, generate plausible ranges, tag them `ai_assumption`, and present the run as speculative.
5. Connect agents into a small social/economic/spatial graph. Every deep agent must have someone or something it can affect; isolated agents fail validation.
6. Validate every persona against world schema and action availability. Show the roster and coverage rationale before/during the run, and retain the same personas across baseline/intervention.

**Persona example:** The system might create an hourly worker with fixed shifts and a low cash buffer, a local shop owner with labour costs and customer traffic, and a bus rider with a time-sensitive commute. Their profile fields and resulting actions must be generated from the scenario and visible in the UI. A new hypothesis should yield a different roster without a hand-written persona list.

### 7.4 Simulation world

**World state:** Zones/locations, households, workers, businesses, transport/access links, budgets, prices, schedules/capacity, policy settings, and social/market edges. Only include state dimensions relevant to the compiled scenario.

**Tick loop:**

1. Apply policy intervention at a specified tick.
2. Each agent observes local state and relevant events.
3. Decision engine selects one or more actions from a typed action set: travel, work, shop, change spending, set price/wage, hire, reduce hours, switch route/mode, communicate, delay/cancel activity.
4. Rule engine applies costs, time, capacity, income, and access constraints; rejects impossible actions.
5. Interactions update shared state (e.g. firm revenue or transit crowding) and other agents' subsequent observations.
6. Event log records actor, time, action, state before/after, rule, model reason, and source/assumption IDs.
7. Repeat baseline and proposal from the same initial state; aggregate typed metrics.

**Hybrid decision engine:** LLM agents choose and explain bounded actions for a small set of salient personas. Cohorts use deterministic/rule-based choices driven by scenario parameters. This makes “swarm” interaction visible without hundreds of slow calls. Do not allow the LLM to overwrite world totals or supply final numeric outcomes.

**Grounded operator path:** A new policy composes existing operators. Example: fare rise → `change_cost` for transit rides; bike lane → `change_travel_time`/`change_access` for cycling; minimum wage → `change_income` for covered workers and `change_cost` for firms. Mechanisms and coefficients remain explicit.

**Generic fallback path:** For any unfamiliar hypothesis, the compiler defines a small domain-specific state vocabulary (entities, resources, locations, relationships, measures) and proposes an initial set of allowed actions. Each deep agent emits a JSON action such as `move`, `communicate`, `exchange`, `change_state`, or `choose_option`, with an actor, target, and constrained state delta. The engine validates references and limits, applies actions as transactions, and records all changes. It can render the run as an exploratory story and chart **within-run** counts. It must label generated mechanisms and values as speculative. This path is what makes truly unrestricted prompts demonstrably runnable without pretending all domains share validated equations.

### 7.5 Results and visualization

| ID | Requirement | Acceptance |
| --- | --- | --- |
| R1 | Baseline vs intervention cards | Same units, horizon, starting state, and seed |
| R2 | Direct and indirect effects | Each effect links to an event chain; speculative paths labeled |
| R3 | Distributional view | User can compare relevant groups, not only an average |
| R4 | “Surprise” cards | Highlight non-obvious **within-model** effects with path and sensitivity; never claim discovery about real Toronto without validation |
| R5 | Sensitivity controls | At least one uncertain parameter has low/base/high reruns or precomputed variants |
| R6 | World view | Agents/flows visually change based on event data; clicks reveal agent state and action history |
| R7 | Exportable brief | Question, assumptions, source facts, scenario outputs, limits, human notes, next validation steps |

**Visual mandate from the founder:** The live city is the hero. Build a small, dense, highly polished district with homes, shops, workplaces, streets, bus routes/stops, cars, and people. Bus and car movements, entering/leaving a building, shop visits, and business responses must be driven by `WorldEvent`s. Show baseline and intervention through a split view or synchronized toggle with a clear policy-change moment. Camera motion, speed controls, hover/click inspection, and legible data overlays make the city useful rather than decorative. Three.js is preferred if the team can deliver it; an isometric canvas scene is the technical fallback **only if it meets the same visible behaviour and polish bar**. Choose the rendering stack in the first hour after a 30-minute spike.

## 8. Evidence tiers and output language

| Tier | Required inputs | What UI may say | What UI must avoid |
| --- | --- | --- | --- |
| Grounded | Relevant observed baseline + explicit behavioural rule/parameter + checks | “Under these assumptions, the model estimates…” | “This will happen” |
| Assumption-driven | Plausible mechanism + declared assumptions; incomplete calibration | “In this simulated world, agents chose…” | Real-world percentages presented as forecasts |
| Speculative exploration | No relevant empirical model or data; generated world and transitions are visible | “This run illustrates one possible chain of choices. These numbers describe only the simulation.” | Claims of real-world prediction or confidence intervals |

**Every tier produces a run.** The system can optionally propose a research plan after the run, as a next step. **Within-model effect** means a path occurred under the specified rules. **Real-world inference** needs validation against human behaviour or historical interventions. Never infer a business will close, welfare will rise, or emissions will fall solely from a persona's narration. A transit fare increase could shift people toward cars, walking, cycling, or fewer trips; emissions depend on those substitutions. This tier system lets the product handle broad hypotheses while keeping the output honest.

## 9. Data strategy and Toronto demonstration

The School of Cities prize asks for a useful prototype addressing a real Toronto urban issue in the context of the 2026 municipal election, founded on Toronto urban data. It explicitly does not ask teams to predict the election or support a candidate. Use a Toronto hypothesis as one of the two live examples. Public-data grounding is **opportunistic for the general product** and **required for the Toronto sponsor demo**.

The sponsor's [Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk) lists multiple domains. Its key value for this PRD is a source catalogue the compiler can match to a prompt; it is not a single dataset to ingest whole.

| Hypothesis domain | Candidate sources named in sponsor guide | Possible world state |
| --- | --- | --- |
| Transit and cycling | TTC GTFS, bus/subway/streetcar delays, Toronto cycling network, Bike Share, Metrolinx, OpenStreetMap | Routes, stops, travel time, accessibility, congestion |
| Housing and affordability | CMHC rental tables, Housing Data Hub, affordable rental map, RentSafeTO apartment evaluations, permits/development applications | Rents, vacancy, units, conditions, construction, household budgets |
| Civic services | 311 requests, childcare centres, parks/recreation facilities | Service demand, capacity, wait/access time, local amenities |
| Demographics and geography | Statistics Canada Census Profile, Toronto neighbourhood and ward profiles/boundaries, census tract boundaries | Population margins, income, commute mode, age, location |
| Land use | Zoning by-law, development applications, active/cleared permits, OpenStreetMap | Building and land-use constraints, growth, destinations |
| Elections | Historical municipal election data and disclosures | Civic context only; do not forecast the election or support a candidate |

The guide specifically warns that the public 311 dataset covers only part of the system and that categories/geographies changed over time. Do not treat it as a complete record of resident need. It also mentions R5/r5py for travel-time accessibility analysis, but that is a later integration unless a teammate already knows it.

| Source | Product role | Limitation |
| --- | --- | --- |
| [Toronto 2021 neighbourhood profiles](https://open.toronto.ca/dataset/neighbourhood-profiles/) | Population, income, commute-mode or other available margins for selected neighbourhoods | Historical aggregates; no individual records or joint distributions |
| [Toronto neighbourhood boundaries](https://open.toronto.ca/dataset/neighbourhoods/) | Map/zone geometry | Geometry alone does not prove travel behaviour |
| [TTC merged GTFS](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/) | Routes, stops, scheduled service context | Scheduled, not observed journeys |
| [TTC fare rules](https://www.ttc.ca/en/Fares-and-passes) | Current baseline: adult PRESTO $3.30, Fair Pass PRESTO $2.10, 47 eligible fares/month cap | Rules vary by fare category/payment/transfer; snapshot date needed |
| [TTC fare modernization](https://www.ttc.ca/Fares-and-passes/Fare-Modernization) | Policy objectives and human consultation context | Qualitative goals do not supply causal parameters |
| [UK bus fare elasticity review](https://www.gov.uk/government/publications/bus-elasticities-and-diversion-factors) or [Holmgren meta-analysis](https://www.sciencedirect.com/science/article/pii/S096585640700047X) | Sensitivity range candidate for fare response | Transfer to Toronto is uncertain; expose as assumption |

**Data import rule:** Record source year, unit, geography, licence, coverage, missingness, fields, and joins. The demo uses checked-in, attributed fixtures so it works offline. Numeric metrics need unit consistency. An income distribution and a commute-mode distribution cannot be combined into a known joint distribution without additional data or an explicit assumption.

**Sponsor handout received:** The Toronto Civic Data Starter Guide above is the longer data-source list the founder referenced. A teammate should still attend the School of Cities workshop to ask which datasets and user problems the judges especially care about.

## 10. Demo studies that prove generality

### Study A — Toronto fare increase (grounded or partly grounded)

**Input:** “What if adult TTC fare rises by $0.50 next year, with Fair Pass unchanged?”
**Compiled operators:** Change transit cost for eligible riders; preserve specified discount.
**Generated stakeholders:** Low-income transit rider, frequent commuter, occasional rider, car-owning worker, local retailer, TTC budget planner, employer.
**Interactions:** Households choose trips/modes; shop visits shift; retailer sees customer-flow change; TTC receives changed paid rides/revenue under assumptions.
**Metrics:** Fare burden, trips by mode, missed/deferred trips, simulated local spending, gross fare revenue sensitivity.
**Claim limit:** Changes in shopping/revenue are exploratory unless supported by data; no store-closure prediction.

### Study B — Minimum wage increase (exploratory)

**Input:** “What if Toronto-area minimum wage rises by 10%?”
**Compiler note:** Wage authority/geography must be clarified: [Ontario sets the general minimum wage under its Employment Standards Act](https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage). The system should flag jurisdiction and let the user frame it as a hypothetical Ontario policy affecting Toronto.
**Compiled operators:** Raise covered worker income; raise employer labour cost; possible price/hours response with explicit assumptions.
**Generated stakeholders:** Hourly worker, small-business owner, customer, employer manager, household with dependants, public analyst.
**Interactions:** Employers select hours/prices, workers adjust spending/transport decisions, customers respond, business revenue feeds back.
**Metrics:** Simulated wage income, hours, prices, spending, business margin under assumed behavioural rules.
**Claim limit:** All quantitative economy-wide effects are exploratory unless calibrated to credible data.

**Fallback Study B only if the wage mechanism fails its quality gate:** A protected bike-lane addition uses travel-time/access operators and is visually simpler. Do not replace the wage demo merely because it is easier; the wage case proves the engine spans more than transport.

## 11. Technical design and contracts

### Research-derived orchestrator design

The orchestrator is a **world controller**, not a group chat. [Concordia](https://deepmind.google/research/publications/64717/) uses a Game Master to mediate agent actions and keep them grounded in shared physical/social state. [Generative Agents](https://arxiv.org/abs/2304.03442) motivates per-agent memory, reflection, and plans; [AI Metropolis](https://mast.stanford.edu/pubs/ai_metropolis_scaling_large_language_model_based_multi_agent_simulation_with_out_of_order_execution/) motivates parallelizing independent decisions while respecting dependencies. [AgentSociety](https://aclanthology.org/2025.acl-industry.94/) shows richer mobility/economic interactions but also warns against trying to build a giant society in one weekend. Implement the **patterns** in a small custom runner; adopting a large framework is optional and must pass a same-day spike.

1. **Compile and inspect.** Meet's compiler extracts intervention, outcome, geography, horizon, plausible mechanisms, stakeholder roles, missing information, and an evidence tier from freeform text. Unknown mechanisms become explicit proposed assumptions; every prompt still proceeds to a speculative run. A human can edit the assumption panel and rerun.
2. **Construct one world.** James creates locations, constraints, resources, social links, and an initial state; Steven generates hypothesis-specific persona types and deep agents. The renderer receives world coordinates and visual cues but does not invent causal events.
3. **Fork a comparable baseline.** Clone the same initial world and agent memories into baseline and intervention; hold seed, initial conditions, and exogenous events constant. Only the policy variable differs. Save the model outputs used by both forks so replay is stable.
4. **Advance each tick.** Agents observe only relevant state and recent memory; independent agents propose structured actions concurrently. The Game Master validates location, budgets, capacities, policy rules, and action preconditions, then commits actions in a deterministic order. A dependent action (shop serves a customer, a friend reacts, a business changes staffing) sees the committed upstream event, never stale state. Invalid actions are rejected or repaired once, then logged.
5. **Create consequences.** Rule-based state transitions handle accounting, travel, capacity, income, and access; selected deep agents use the model for decisions and explanations. Each action emits a `WorldEvent` with pre/post state, causal reason, provenance, and visual cue. Metrics are computed from committed events, not model-written summary numbers.
6. **Compare, challenge, rerun.** The comparator traces outcome deltas back to events and assumptions. A skeptic highlights weak links and asks the researcher for one material input; the human note is versioned, and a rerun shows what changed. Label observed inputs, transferred parameters, assumptions, and simulated outcomes separately.

**Default scale:** 12–24 visible agents, 4–8 deep decision makers, 3–5 ticks, and rule-based cohorts/ambient pedestrians. The city can look populous without pretending each animated person is an independent LLM call. If the world contains an unmatched hypothesis, reuse the city as a **symbolic urban stage** with dynamically generated roles, places, metrics, and labels; mark the rendering as an illustration of the hypothetical world. This city-first presentation is a hackathon constraint, not a semantic limit on prompt input.

```text
Freeform hypothesis + human notes + source registry
       ↓
Hypothesis compiler → typed ScenarioSpec → validation / clarification / evidence tier
       ↓
Population planner → PersonaSpec[] + WorldSpec + coverage report
       ↓
Baseline snapshot ─────────────── Intervention snapshot (same seed)
       ↓                                  ↓
Known-operator engine OR generic JSON-action engine (3–5 ticks)
       └──────────────────┬───────────────┘
                          ↓
Comparator + path tracer + skeptic + human review
                          ↓
One Result JSON → LIVE CITY, then charts, explanation cards, export
```

### Data contracts (v0)

`ScenarioSpec`:

```json
{
  "question": "What if ...?",
  "geography": "Toronto",
  "horizon_ticks": 4,
  "intervention": [{"operator": "change_cost", "target": "adult_transit_ride", "delta": 0.5, "unit": "CAD"}],
  "protected_groups": ["fair_pass"],
  "outcomes": ["fare_burden", "trips", "local_spending"],
  "mechanisms": [{"from": "fare", "to": "trip_choice", "parameter_id": "fare_elasticity"}],
  "assumptions": [{"id": "a1", "value": "...", "source_type": "human_note"}],
  "evidence_tier": "assumption_driven",
  "execution_path": "known_operators",
  "dynamic_world_fields": []
}
```

`PersonaSpec`: ID, role, represented weight (if justified), relevant traits, resources, constraints, goals, location, relationships, available actions, initial memory, source IDs, assumption IDs. The generator also emits a **coverage rationale** explaining why each role exists for this hypothesis.

`WorldEvent`: run ID, tick, actor ID, action, targets, preconditions, state delta, rule ID, reason, source/assumption IDs, and `visual_cue` (`walk`, `drive`, `ride_bus`, `enter_home`, `enter_shop`, `work`, `exchange`, `message`, `other`). The visual cue is derived from the action; it cannot contradict the state delta.
`RunResult`: study ID, scenario/version/seed, population summary, event list, metric values and units, group slices, causal paths, sensitivity variants, evidence tier, warnings, source ledger.

### Suggested implementation

- **Frontend:** React + TypeScript. Run an early Three.js/isometric rendering spike; choose the fastest path to the required visual quality. The city reads `RunResult` only.
- **Backend:** TypeScript/Node or Python/FastAPI; choose based on the simulation owner's proficiency. Keep one typed service boundary.
- **Model:** One provider adapter for compiler/personas/decisions/skeptic/brief. Use schema-constrained JSON and cache responses. Do not couple the engine to one vendor.
- **Storage:** Local JSON/SQLite for studies, source ledger, notes, and runs. Authentication is out of scope.
- **Reproducibility:** Fixed seed, saved model JSON, versioned prompts/rules, source snapshot IDs.
- **Reliability:** Precomputed two-study demo and static source fixture; a run can replay without a model key or network.
- **Security:** Keep API keys server-side; allowlisted URLs/source snippets; no dynamic execution of model-authored code.

### Performance budget

Target one run at **≤90 seconds**, with a visible progress stage after each step. Cap LLM calls (e.g. scenario compilation, persona batch, 3–5 decision batches, skeptic/synthesis), cache by scenario hash, and use rule-based cohorts for scale. If latency exceeds budget, reduce deep-agent count/ticks rather than pretending the simulation finished.

## 12. Evaluation and quality gates

### Functional checks

- Fare and wage prompts compile through the same endpoint and result schema; bike-lane is a documented fallback only.
- `ScenarioSpec` rejects malformed operators and out-of-unit values.
- Same seed and saved model outputs reproduce exact event and metric JSON.
- Zero intervention produces zero policy deltas.
- Constraint engine rejects impossible actions (negative cash, movement through unavailable links, spending above budget unless credit is explicitly modelled).
- A human override changes the next run and appears in the audit trail.
- Every displayed number comes from `RunResult`; no visual-only invented metric.

### Research checks

- Sources are real, linked, and relevant to their claims; date/geography mismatches are flagged.
- Persona coverage includes directly and indirectly affected stakeholders; group weights do not exceed known population margins without explanation.
- Low/base/high sensitivity changes outcomes in a sensible direction where the rule implies monotonicity.
- The skeptic tries to break the causal story: omitted groups, confounders, feedback loops, and unsupported second-order effects.
- One expert/mentor from each primary sponsor can understand the demo and its limits after a short walkthrough; incorporate their feedback if available.

**What research supports the architecture:** The [Generative Agents paper](https://arxiv.org/abs/2304.03442) demonstrates believable agents with memory and interaction; believability is not proof of policy prediction. [Stanford's later 1,000-person work](https://hai.stanford.edu/policy/simulating-human-behavior-with-ai-agents) used extensive individual interviews and explicit benchmarks, far more information than census marginals alone. Agent-based social research literature emphasizes comparison with empirical patterns and validation of model mechanisms ([review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4430112/)). These sources motivate persistent memory, interaction logs, and honest evidence tiers.

## 13. UX surfaces and content

| Screen | Must show | Key interaction |
| --- | --- | --- |
| Study creation | Big unrestricted hypothesis field, examples, source/notes tray | Enter any hypothesis and always start an exploratory or grounded run |
| Study design | Compiled scenario card, autonomous stakeholder roster, causal graph, evidence tier, one clarification | Inspect/edit generated assumptions while the run starts |
| **Live world (hero)** | Polished district with homes, shops, workplaces, people, buses, cars, tick timeline, active agents, event feed | Follow an agent, pause, inspect a shop/home, compare baseline/proposal |
| Results | Metrics, subgroup slices, causal paths, sensitivity, surprises, source badges | Click “why?” and edit assumption |
| Research memory | Team notes, citations, challenged assumptions, run versions | Add note, accept/reject skeptic suggestion |
| Brief | One-page export with methods and limitations | Copy/download for judging |

**Copy rules:** Say “synthetic agent,” “in this run,” and “assumption” where appropriate. Do not show decimals implying precision unsupported by sources. Use accessible colour/shape differences for baseline/proposal, not colour alone. Keep a prominent “what changed” summary beside the visual.

**Visual acceptance storyboard:** Start with a living baseline: people leave homes, board buses or cars, work, and visit shops. Trigger the intervention; agent choices change routes/spending/work and update building/vehicle activity. Click a person to see their goal, constraint, last decision, and causal reason. Click a shop to see visits and budget change. Scrub back to the tick when an upstream choice caused a downstream effect. At least one visual element must clearly differ between the two demo hypotheses without rewriting the scene.

**Design brief for the hero screen:** Use the city as a scientific instrument with a memorable, game-like feel. The city occupies most of the viewport; a compact side rail holds the hypothesis, live metrics, evidence tier, and selected agent. A bottom timeline provides play/pause, speed, tick scrubbing, and a strong before/after transition. Agent paths and vehicle routes must remain readable at demo distance on a projector. Selecting a metric highlights the agents/events that produced it; selecting a building highlights its incoming/outgoing flows. Keep source badges and uncertainty visible but visually secondary until opened. Use a coherent illustration style, restrained motion, and readable typography; avoid a crowded particle swarm that judges cannot interpret in four minutes.

**Rendering contract:** The renderer consumes only locations, actors, `visual_cue`s, and state deltas from `RunResult`. It may interpolate positions for smooth motion, but it cannot invent a trip, shop visit, closure, or metric. Provide an instant-replay mode so the pitch does not depend on real-time LLM latency.

## 14. Team ownership and critical path

| Person | Owns | First deliverable (within 2–4 hours) | Definition of done / handoff |
| --- | --- | --- | --- |
| **Adit — city frontend** | React UI, Three.js/isometric district, animation, controls, agent/building inspection, baseline/intervention presentation | Render a fixture `RunResult` with moving people, bus, car, home, shop, and tick scrubber | Scene consumes `WorldEvent.visual_cue` and location/state data only; works with both demo scenarios; polished 4-minute projector view |
| **Steven — persona AI swarm** | Scenario-specific role discovery, unique persona generation, memory, deep-agent decision prompts, lightweight-agent choice rules, coverage report | `generatePersonas(ScenarioSpec, WorldSpec) -> PersonaSpec[]` and one valid decision batch for two different prompts | Personas differ by hypothesis, persist across ticks, and return bounded action JSON that James's engine can validate; no fabricated aggregate results |
| **James — world engine and orchestrator** | Backend/API, world state, turn/tick scheduler, action validation, interactions, baseline/proposal runs, event log, metrics, caching/replay | `runScenario(ScenarioSpec, PersonaSpec[], seed) -> RunResult` using fixture personas; `POST /scenario/run` stub | Deterministic replay from fixed seed/model responses; events drive Adit's scene; two domains use one runner; latency and call budget measured |
| **Meet — product, hypothesis compiler, evidence, integration** | Freeform prompt → `ScenarioSpec`, generic fallback schema, Toronto source fixture, human-note/evidence ledger, sponsor fit, integration checks, pitch and Devpost | Two prompt-to-ScenarioSpec fixtures (fare + Ontario wage), source/assumption cards, agreed contracts committed | Unknown prompts still yield a speculative run; source claims are traceable; human note changes a run; full demo and submission verified |

**Meet is integration owner and Devpost owner.** James owns the backend contract, Adit owns frontend visual quality, and Steven owns agent quality. Meet should not become the emergency implementer for every stream; each owner must publish a fixture and interface early. Pair Meet+James on schemas, James+Steven on action JSON, and James+Adit on the event/visual contract in the first hour.

**Shared contracts and file boundaries:** Meet defines `ScenarioSpec` and evidence/notes schemas; Steven defines `PersonaSpec` and decision schema with James; James defines `WorldEvent`/`RunResult` and API; Adit defines visual cues/coordinates with James. Put all types in one shared contracts folder or copy generated JSON schema to both languages. No one should change a shared field without notifying the other owner and updating a fixture.

**Daily handoff rule:** Push a working vertical slice every 3–4 hours, not a large private branch at the end. The first completed path is prompt → generated agents → baseline/proposal events → living scene. The second hypothesis is the generality test. If James cannot implement the generic engine in time, Steven should simplify action choices and Meet should supply a validated speculative fallback schema; Adit should keep the city reading the unchanged `RunResult` contract.

## 15. Hackathon execution and submission

The [written Devpost rules](https://hack-the-valley-11.devpost.com/rules) allow up to four people, require in-person demo, and say submitted code must be created during the event window. An initial entry with team members and prize categories is due **Saturday 17 Oct, 9:00 pm ET**. The [Devpost event header/dates](https://hack-the-valley-11.devpost.com/details/dates) show **Sunday 18 Oct, 8:00 am EDT** as the close, while written rules say **10:00 am ET** and the [live schedule](https://hackthevalley.io/schedule) says **9:30 am**. Use **8:00 am** as the conservative final cutoff and ask organizers to clarify.

| Time / gate | Deliverable |
| --- | --- |
| **Now / first hour** | Freeze the already-decided city-first scope, fare and wage demos, and named owners; choose stack, hard cost cap, and shared contracts. |
| **First 6 hours** | One arbitrary prompt compiles; persona planner returns role-different agents; city animates fixture buses, cars, people, homes and shops. |
| **By 12 hours** | Tick engine runs baseline/proposal for one scenario; event trace and same-seed replay work. |
| **By 18 hours** | Second hypothesis passes the *same* path; if not, cut secondary analytics/exports and fix generality. Keep the live city. |
| **By 24 hours** | Human note → challenged assumption → rerun works; Toronto source and evidence tier visible. |
| **Saturday before 9:00 pm** | Submit initial Devpost entry with all team members and all intended prize categories. |
| **Final 6–8 hours** | Polish city scene/interactions, run demo repeatedly, record backup, complete write-up, check GitHub link. |
| **Sunday 5:30 am internal target** | Final entry complete and verified before the 8:00 am displayed cutoff. |

Attend or send one teammate to the [School of Cities workshop Friday 10–11 pm](https://hackthevalley.io/schedule) and [Papier.ai workshop Saturday noon–1 pm](https://hackthevalley.io/schedule) to ask about sponsor judging and data sources. Feed answers into §17. Do not let workshops stall the core build.

### Four-minute pitch sequence

1. **Problem (25s):** Policy ideas have interacting human consequences; researchers need fast, inspectable first-pass experiments.
2. **Freeform input (40s):** Type fare hypothesis; show compiler and auto-generated stakeholder roster.
3. **Living world (60s):** Run baseline/intervention; inspect a household choice causing downstream business/agency effects and the event chain.
4. **Human research (45s):** Show a teammate note, skeptic challenge, corrected assumption, and changed result.
5. **Generality (45s):** Enter second, unrelated hypothesis; show different agents, rules, metrics from same pipeline.
6. **Evidence and close (25s):** Show tier/source badges and exportable brief; explain a next validation step.

**Judge Q&A preparation:** “Are these real people?”, “Why would their choices match Toronto?”, “Which effects are learned vs programmed?”, “What did the human researcher change?”, “Does any prompt really work?”, “How do you validate second-order effects?”, “What happens with no data?” The answer must be in the UI, not only in speech.

## 16. Risks and decision triggers

| Risk | Early signal | Response |
| --- | --- | --- |
| Generic prompt compiles into invalid/magic rules | Unprepared hypothesis fails to start | Use generic JSON-action fallback; expose speculative tier; preserve the same WorldEvent pipeline |
| Persona swarm is theatrical | Agents talk but do not change state or each other | Require state-changing actions and trace paths; cut dialogue volume |
| False credibility | UI presents synthetic percentages as Toronto predictions | Add tier labels, source/assumption badges, sensitivity, no unsupported external claim |
| Too many LLM calls | Run >90 seconds or API errors | Batch deep-agent decisions, rule-based cohorts, cache and replay |
| Visual consumes schedule | No working engine by 12 hours | Reduce scene size and effects while preserving buses/cars/people/shops/homes and event-driven animation; simplify analytics first |
| Sponsor fit is vague | Papiers loop absent or Toronto data decorative | Put note→agent→challenge→human rerun and Toronto source in main demo |
| Two demos fail | Only one prompt works by 18 hours | Cut secondary charts/polish; prioritize second prompt and same contracts |
| Submission mismatch | Team trusts later Sunday deadline | Initial by Saturday 9pm; final by displayed Sunday 8am |

## 17. Locked decisions and implementation gaps

### Confirmed by founder

- **Unrestricted prompts:** Every hypothesis should start an interactive simulation, even if it must be labeled speculative.
- **Primary output:** The live city and its agents. A rigorous report is secondary.
- **Non-negotiable features:** Autonomous generation of personas tailored to the prompt; agents interact and make state-changing decisions; a visually excellent world with moving buses, cars, people, activity in homes and shops.
- **Data:** Public data improves runs and grounds the Toronto sponsor case, but cannot be a prerequisite for arbitrary prompts.
- **UI:** A living city is the hackathon presentation for every hypothesis. The scene is a small, detailed district with buses, cars, homes, shops, workplaces, and people whose visible actions come from the event log.
- **Demo pair:** A Toronto transit fare proposal and a hypothetical Ontario minimum wage change affecting Toronto. The same compiler, swarm, world controller, and renderer handle both.
- **Team:** Adit owns the city frontend; Steven owns persona generation and AI decisions; James owns the world engine/orchestrator/backend; Meet owns hypothesis compilation, evidence/human research loop, integration, and submission.
- **Source material:** The founder supplied the School of Cities [Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk). Its relevant catalogue is in [research.md](./research.md).

### Implementation gaps to settle in the first hour

1. **Meet + James:** Which model/API, hard spend cap per run, backend stack, and deployment target are available? Cache the two demos regardless of provider.
2. **Adit + James:** Will Three.js meet the storyboard in §13 after a 30-minute spike? If the spike fails, use an isometric renderer with the same event contract and quality bar.
3. **Meet + Steven:** Which real team research note, disagreement, and resulting question will be used in the Papiers demo? Record its author, timestamp, source, and effect on the rerun.
4. **All four:** Agree on the schema fixtures in §11 before building separate modules. The product assumptions above stand unless a concrete implementation failure triggers the fallback in §16.

### Hard challenge to the concept

An unrestricted prompt plus autonomous agents plus a polished living city is ambitious for 36 hours. The fastest credible implementation is a **small district, small number of deep agents, and a generic speculative fallback**. If the team instead tries to simulate a whole city with hundreds of independent LLM agents, the likely failure is a slow theatrical demo whose numbers cannot be defended. Preserve the founder's essential experience—autonomous personas, interactions, and a living scene—while keeping the world small and the event trace explicit.

## 18. Research and event sources checked

- [Hack the Valley 11 Devpost overview, categories, Papiers and School of Cities challenges](https://hack-the-valley-11.devpost.com/)
- [Hack the Valley 11 written rules](https://hack-the-valley-11.devpost.com/rules), [Devpost dates](https://hack-the-valley-11.devpost.com/details/dates), and [live schedule](https://hackthevalley.io/schedule)
- [HTV hacker package](https://app.notion.com/p/hackthevalley11/Hack-the-Valley-11-Hacker-Package-3f1c354d5236804e94e9fe0dff81eb82) and [package schedule](https://app.notion.com/p/hackthevalley11/Schedule-3f1c354d5236800598ddc2e313567b3c?pvs=25)
- [School of Cities Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk) and this repo's [research dossier](./research.md)
- [Papiers product description](https://papiers.ai/); city and modelling sources linked in §§8–12

**Revision rule:** Update §17 when implementation gaps are settled and record any changed product decision, acceptance criterion, demo study, or owner here. Preserve unresolved assumptions explicitly; do not quietly turn the PRD back into a single-domain transit plan.
