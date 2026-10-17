# PRD — Counterfactual Lab

**Working title:** Counterfactual Lab (rename with the team)
**Status:** Final product scope v1.0; model credentials, exact stack, and deployment URL are implementation fields to fill at kickoff
**Hackathon:** Hack the Valley 11, 16–18 October 2026
**Owners:** Meet (compiler/economic definitions/evidence/integration), James (world engine/metrics/orchestrator/backend), Steven (persona swarm), Aadit (city and dashboard frontend)
**Product type:** General-purpose, human-guided social hypothesis simulator and policy decision workspace
**Primary competition target:** Papiers Autoresearch
**Secondary:** Hack the Valley × U of T School of Cities
**Additional:** Sustainable FinTech & Economic Inclusion, if the final demo visibly covers economic access

## 1. Executive decision

Counterfactual Lab accepts a freeform hypothesis such as “What if bus fares rose?”, “What if a bus route disappeared?”, “What if minimum wage increased?”, or “What if protected bike lanes were added?” It converts the hypothesis into a structured scenario, creates a scenario-specific population of synthetic households, workers, firms, and institutions, runs baseline and intervention worlds, and shows the resulting choices, interactions, and possible second-order effects. Researchers can add sources and their own notes, correct assumptions, and rerun the same world.

**Product promise:** “Turn an idea into an inspectable social experiment and decision brief in minutes.”

**Two connected outputs:** (1) a living city showing what agents do and how places change; (2) an economic and policy dashboard showing baseline-versus-policy metrics, subgroup effects, scenario trajectories, costs, benefits, assumptions, and evidence. Every chart and headline number must derive from the same committed simulation events and source ledger as the city. This is the product's bridge between the School of Cities and economic-inclusion tracks.

**Founder decision:** The input is truly unrestricted. Every submitted hypothesis produces an interactive run, including when relevant public data or a causal model is missing. Such a run is labeled **speculative exploration** and asks the user to inspect the generated assumptions. The product never silently refuses a hypothesis or substitutes a static research plan. It cannot truthfully produce a calibrated quantitative forecast for every hypothesis; its output label varies by evidence quality.

**Hackathon proof of generality:** Run **two different hypotheses through the same textbox, scenario compiler, persona generator, world engine, result schema, and UI**. Locked demo pair: a TTC adult-fare change in the UTSC-area Morningside–Highland Creek district and a hypothetical **Ontario minimum-wage change affecting Toronto**. Include a third unprepared audience prompt in rehearsal to test the generic fallback. Every run must create relevant stakeholders, actions, metrics, and causal pathways. The UI must not be a disguised fare calculator. The exact fare demo, ranked datasets, observed fixture, and multi-hop pass/fail test are in [demo-data.md](./demo-data.md).

### Track eligibility and demo obligations

The [written rules](https://hack-the-valley-11.devpost.com/rules) allow one project to enter multiple prize categories, and the [Devpost overview](https://hack-the-valley-11.devpost.com/) says to select the categories in the submission. No published Papiers requirement to use its software/API was found. The team is four people, within the published maximum of four, assuming all members are registered, eligible students, and physically present for judging.

| Track | Published requirement / brief | Our fit if built as specified | Must show in demo/submission |
| --- | --- | --- | --- |
| **Papiers Autoresearch — primary** | Human and AI agents work together; agents build on what people have read, questioned, and learned, ask for expertise, and keep humans informed | **Strong, conditional**: the research-memory and revision loop must actually work | Two human-authored notes or judgments, an agent use of one note, a challenge/question, a human correction, and a rerun with audit trail |
| **School of Cities — secondary** | Useful civic prototype for a concrete Toronto urban problem, founded on Toronto urban data; no election prediction/candidate support | **Strong, conditional**: general simulation alone does not satisfy the data/user requirement | Fare affordability question framed for a Toronto civic user; source-linked Toronto neighbourhood/GTFS/fare inputs; accessible result and limitation |
| **Sustainable FinTech & Economic Inclusion — additional** | Public page lists the category title without a detailed rubric | **Plausible if the linked economic dashboard works**: show household financial access and firm effects, beyond generic policy charts | Household fare burden and wage/budget effects, subgroup comparison, financial tradeoffs; describe sustainability only if evidenced |
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
8. The visual world is the primary experience: buses, cars, people, homes, shops, and workplaces visibly change as agents act. A linked decision dashboard uses the exact same event/result data.
9. The output gives a policy analyst the baseline comparison, fiscal/household/business effects, distributional impacts, uncertainty, alternatives, and next evidence needed to decide whether a proposal merits deeper analysis.

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
| G10 | A decision dashboard shows baseline/proposal time series, economic and access metrics, subgroup effects, and sensitivity ranges; clicking a result reveals contributing events and assumptions | P0 |
| G11 | Live city shows moving buses/cars, people leaving/entering homes and shops, and a state-changing business/institution response, all driven by the run's event log | P0 |
| G12 | The city has a polished visual system: coherent art direction, readable camera, clear policy-change moment, responsive controls, and a traceable connection between animation and metrics | P0 |
| G13 | User can export a one-page decision brief with a policy option, baseline, affected groups, benefits/costs, uncertainty, source ledger, and validation needs | P1 |

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
| H8 | Compile time and decision context | Capture policy start date, horizon, reporting period, who decides, target metric, and whether a calendar projection can be justified |

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
| R3 | Distributional view | User can compare relevant income, geography, role, or vulnerability groups, not only an average |
| R4 | “Surprise” cards | Highlight non-obvious **within-model** effects with path and sensitivity; never claim discovery about real Toronto without validation |
| R5 | Sensitivity controls | At least one uncertain parameter has low/base/high reruns or precomputed variants |
| R6 | World view | Agents/flows visually change based on event data; clicks reveal agent state and action history |
| R7 | Exportable brief | Question, assumptions, source facts, scenario outputs, limits, human notes, next validation steps |
| R8 | Economic decision dashboard | Baseline, intervention, and change shown in common units for households, firms, and public budget where the model supports them |
| R9 | Scenario trajectories | Per-tick paths for baseline, proposal, and low/base/high parameter variants; future dates only when tick-to-time mapping and assumptions are explicit |
| R10 | Policy option comparison | Compare at least status quo and the proposed intervention; support a second policy option without a new frontend or metric schema |

**Visual mandate from the founder:** The live city is the hero. Build a small, dense, highly polished district with homes, shops, workplaces, streets, bus routes/stops, cars, and people. Bus and car movements, entering/leaving a building, shop visits, and business responses must be driven by `WorldEvent`s. Show baseline and intervention through a split view or synchronized toggle with a clear policy-change moment. Camera motion, speed controls, hover/click inspection, and legible data overlays make the city useful rather than decorative. Three.js is preferred if the team can deliver it; an isometric canvas scene is the technical fallback **only if it meets the same visible behaviour and polish bar**. Choose the rendering stack in the first hour after a 30-minute spike.

### 7.6 Economist and policymaker decision workspace

The economic view is a **decision aid, not a model-generated forecast card**. The [Treasury Board of Canada's cost-benefit policy](https://www.canada.ca/en/government/system/laws/developing-improving-federal-regulations/requirements-developing-managing-reviewing-regulations/policy-cost-benefit-analysis.html) calls for explicit alternatives, costs and benefits, sensitivity, and distributional analysis. The [federal Guide to Costing](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32600) stresses cost drivers, uncertainty, and validation against historical or independent evidence. These guide the dashboard's structure; they do not make this prototype an official cost-benefit analysis.

| Decision question | Metric candidates | Required chart / interaction | Evidence and calculation rule |
| --- | --- | --- | --- |
| **Who is better or worse off?** | Disposable income, monthly fare/transport spend, share of income spent on transport, wages/hours, missed trips, reachable jobs/services, time cost | Baseline vs policy by group; distribution bars and agent drill-down | Use only available fields; show group size/weight and missing groups; distinguish a simulated persona from a population estimate |
| **What happens to local businesses?** | Visits, sales, wage bill, price, margin, hours staffed, hiring or closure risk flag | Time series and shop inspection linked to city | Compute from committed transactions and costs; a risk flag is not a closure forecast |
| **What happens to the public budget?** | Fare revenue, operating/capital cost if modelled, subsidy requirement, program cost, administrative cost | Revenue-cost waterfall with change from baseline | Show only components supported by inputs; do not equate higher fare revenue with social benefit or omit ridership response |
| **Does access or wellbeing change?** | Trips completed/deferred, travel time, access to work/groceries/services, time available, accessibility burden | Map/flow view plus trend and subgroup comparison | Trace to route, travel, and activity events; no unsupported wellbeing score |
| **How robust is the conclusion?** | Low/base/high outcomes for uncertain fare response, employer response, uptake, price pass-through | Fan/range chart or scenario bands; assumption slider | Bands are scenario sensitivity, **not statistical confidence intervals** unless a validated statistical model supplies them |
| **What happens over time?** | Cumulative household cost, business cash flow, fare revenue, access, and any scenario-specific outcome | Baseline/proposal trajectory with explicit horizon and unit | For a 3–5 tick toy run, label ticks as simulated steps; label months/years and say “projection” only after mapping time, behavior, population weights, and parameter stability |

**P0 dashboard for the hackathon:** 3–5 headline deltas, one baseline/proposal trend, one group comparison, one business/public-budget view, and one low/base/high sensitivity chart. All numbers are clickable back to events, formulas, sources, and assumptions. The fare demo should show household transport burden, trips/access, shop visits, and TTC fare revenue; the wage demo should show worker income, employer wage bill/hours, prices, and business margin. Distinct charts and metrics are generated from a shared metric registry keyed by scenario outcome, not hard-coded to transit.

**Accounting examples for the shared metric registry:** `household_transport_burden = period_transport_payments / period_disposable_income` (only if the denominator exists and is positive); `business_margin = sales_revenue - wage_bill - other_modelled_costs` (call it *partial* margin when costs are missing); `fare_revenue = sum(eligible_paid_trip_fares)` after caps/discounts; `net_public_operating_effect = change_in_public_revenue - change_in_modelled_operating_cost` (do not silently include unrelated TTC budget lines). Report each as baseline, intervention, and difference for the same period and population. A person-to-business or rider-to-TTC payment must reconcile across ledgers.

**Future scenario path:** The user selects a horizon (for example 1, 3, or 6 months). `ProjectionSpec` records policy start date, period length, how sampled agent activity is scaled into a period, assumed behaviour persistence, population coverage, and any inflation or trend inputs. The engine recomputes each future period and shows baseline/proposal trajectories with low/base/high assumption paths. If these fields are absent, show *simulated steps* on the x-axis; if present but empirically uncalibrated, label the chart **illustrative scenario projection, not a forecast**. Never extend a short trace by drawing a smooth curve with no transition rule. The source-backed TTC fare baseline and 2026 budget can anchor inputs, but one local district cannot be multiplied into a Toronto-wide forecast without justified sampling weights.

**P1 decision brief:** baseline and alternative, affected groups, annualized or cumulative costs/benefits *when supported*, unquantified effects, fiscal impact, a possible implementation/monitoring plan, and the next data required for a real evaluation. Net present value, benefit-cost ratio, emissions valuation, tax effects, and city-wide totals are **conditional**: display only if the model has valid units, a real time horizon, coverage/weights, appropriate discount or valuation assumptions, and no double counting. Transfers between actors (for example a fare paid by a rider and received by TTC) appear on stakeholder ledgers; they are not automatically a net social benefit. If these gates fail, mark the metric **not estimable from this run** and explain the missing evidence.

**Decision action:** The UI ends with “What this run suggests,” “What remains uncertain,” and “What to measure before acting.” A researcher can compare a second policy option or edit a material assumption and see the city and dashboard rerun together. The system does not recommend enactment from synthetic evidence alone.

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

**Locked Toronto MVP data stack:** TTC fare rules; 2021 Morningside/Highland Creek neighbourhood profiles; current TTC GTFS for 38 Highland Creek and 116 Morningside; the 2025 Morningside/Ellesmere pedestrian/vehicle/bicycle count; optionally local business licence locations; TTC 2026 budget as policy context. The [verified baseline fixture](./data/toronto_demo_baseline.json) includes real fare, census, and intersection values with source IDs. [Demo-data dossier](./demo-data.md) records what each source grounds and where the agent simulation must rely on explicit assumptions.

| Source | Product role | Limitation |
| --- | --- | --- |
| [Toronto 2021 neighbourhood profiles](https://open.toronto.ca/dataset/neighbourhood-profiles/) | Population, income, commute-mode or other available margins for selected neighbourhoods | Historical aggregates; no individual records or joint distributions |
| [Toronto neighbourhood boundaries](https://open.toronto.ca/dataset/neighbourhoods/) | Map/zone geometry | Geometry alone does not prove travel behaviour |
| [TTC merged GTFS](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/) | Routes, stops, scheduled service context | Scheduled, not observed journeys |
| [TTC fare rules](https://www.ttc.ca/en/Fares-and-passes) | Current baseline: adult PRESTO $3.30, Fair Pass PRESTO $2.10, 47 eligible fares/month cap | Rules vary by fare category/payment/transfer; snapshot date needed |
| [TTC fare modernization](https://www.ttc.ca/Fares-and-passes/Fare-Modernization) | Policy objectives and human consultation context | Qualitative goals do not supply causal parameters |
| [TTC 2026 operating budget report](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1) | Actual agency decision dimensions and published fare/ridership/budget context | System-wide budget components cannot be inferred from a district simulation |
| [UK bus fare elasticity review](https://www.gov.uk/government/publications/bus-elasticities-and-diversion-factors) or [Holmgren meta-analysis](https://www.sciencedirect.com/science/article/pii/S096585640700047X) | Sensitivity range candidate for fare response | Transfer to Toronto is uncertain; expose as assumption |

**Data import rule:** Record source year, unit, geography, licence, coverage, missingness, fields, and joins. The demo uses checked-in, attributed fixtures so it works offline. Numeric metrics need unit consistency. An income distribution and a commute-mode distribution cannot be combined into a known joint distribution without additional data or an explicit assumption.

**Sponsor handout received:** The Toronto Civic Data Starter Guide above is the longer data-source list the founder referenced. A teammate should still attend the School of Cities workshop to ask which datasets and user problems the judges especially care about.

## 10. Demo studies that prove generality

### Study A — Toronto fare increase (grounded or partly grounded)

**Input:** “What if the adult TTC fare rises by $0.50 next year, with Fair Pass unchanged? Show the effects around UTSC.”
**Compiled operators:** Change transit cost for eligible riders; preserve specified discount.
**Generated stakeholders:** Low-income transit rider, frequent commuter, occasional rider, car-owning worker, local retailer, TTC budget planner, employer.
**Interactions:** Households choose essential versus discretionary trips and transit, walking, driving, or deferral; shop visits shift; a synthetic shop owner changes staffing after its simulated margin changes; another worker sees changed hours next tick. TTC receives changed **sample** paid rides/revenue under assumptions. At least one cause chain spans three decisions and two agents.
**Metrics:** Fare burden, trips by mode, missed/deferred trips, simulated local spending, shop margin and staffing, and **local-sample** fare revenue sensitivity. Show emissions only if vehicle-kilometre and fleet assumptions justify it.
**Decision view:** Household transport-cost distribution versus TTC fare revenue; scenario range when ridership response changes; visible access and shop-visit consequences. The [TTC's 2026 operating budget](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1) explicitly assesses fare changes against ridership, revenue, equity, and customer experience, so these are the relevant decision dimensions. Its approved fare freeze and fare cap are baseline context, not evidence that a hypothetical fare rise would work.
**Claim limit:** Toronto sources ground fares, geography, neighbourhood margins, routes, businesses' possible locations, and baseline intersection activity. They do **not** observe fare-induced mode switches, store sales, or closures. Label those mechanisms assumption-driven; never name a real business as likely to fail or present the local sample as a TTC-wide forecast.

### Study B — Minimum wage increase (exploratory)

**Input:** “What if Toronto-area minimum wage rises by 10%?”
**Compiler note:** Wage authority/geography must be clarified: [Ontario sets the general minimum wage under its Employment Standards Act](https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage). The system should flag jurisdiction and let the user frame it as a hypothetical Ontario policy affecting Toronto.
**Compiled operators:** Raise covered worker income; raise employer labour cost; possible price/hours response with explicit assumptions.
**Generated stakeholders:** Hourly worker, small-business owner, customer, employer manager, household with dependants, public analyst.
**Interactions:** Employers select hours/prices, workers adjust spending/transport decisions, customers respond, business revenue feeds back.
**Metrics:** Simulated wage income, hours, prices, spending, business margin under assumed behavioural rules.
**Decision view:** Worker gain versus employer cost and price/hours response, split by income and business type. Treat jurisdiction and the counterfactual date as assumptions; do not show city-wide job or GDP forecasts from a toy economy.
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
  "projection": {"period_unit": "month", "period_count": 4, "policy_start": "2026-11", "mode": "illustrative", "scaling_assumptions": ["a_period_activity"]},
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
`MetricDefinition`: stable ID, label, unit, stakeholder/denominator, formula or aggregation rule, time grain, applicable scenarios, required inputs, provenance, allowed evidence tiers, and display status (`computed`, `assumption_driven`, `not_estimable`).

`MetricPoint`: metric ID, run ID, tick/time label, baseline/proposal/alternative, group ID, value, unit, contributing event IDs, source/assumption IDs, and optional sensitivity case. A missing value is explicit; never fill it with an LLM guess.

`RunResult`: study ID, scenario/version/seed, population summary, event list, metric definitions and points, group slices, causal paths, sensitivity variants, evidence tier, warnings, source ledger. The city, charts, and brief consume this same object.

### Suggested implementation

- **Frontend:** React + TypeScript. Run an early Three.js/isometric rendering spike; choose the fastest path to the required visual quality. The city and economic dashboard read `RunResult` only.
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
- Every displayed number comes from `RunResult`; no visual-only or model-authored aggregate metric.
- Household payments and recipient revenue reconcile where they are two sides of the same transaction; public and business ledgers do not double-count the transfer as a social benefit.
- A chart's baseline, intervention, units, group denominator, time horizon, and scenario sensitivity are visible; unsupported metrics render as `not_estimable` with a reason.
- Changing one parameter updates agent decisions, city events, economic metrics, and chart trajectories in the same versioned run.

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
| **Economy & policy dashboard** | Household, business, public-budget, and access metrics; subgroup impacts; baseline/proposal trends; scenario ranges; assumptions and source badges | Click a number or chart segment to trace it to agents, events, formulas, and evidence; edit an assumption |
| Results / decision brief | Causal paths, sensitivity, unquantified impacts, alternatives, validation plan | Export a concise analyst briefing |
| Research memory | Team notes, citations, challenged assumptions, run versions | Add note, accept/reject skeptic suggestion |
| Brief | One-page export with methods and limitations | Copy/download for judging |

**Copy rules:** Say “synthetic agent,” “in this run,” and “assumption” where appropriate. Do not show decimals implying precision unsupported by sources. Use accessible colour/shape differences for baseline/proposal, not colour alone. Keep a prominent “what changed” summary beside the visual.

**Visual acceptance storyboard:** Start with a living baseline: people leave homes, board buses or cars, work, and visit shops. Trigger the intervention; agent choices change routes/spending/work and update building/vehicle activity. Click a person to see their goal, constraint, last decision, and causal reason. Click a shop to see visits and budget change. Scrub back to the tick when an upstream choice caused a downstream effect. At least one visual element must clearly differ between the two demo hypotheses without rewriting the scene.

**Design brief for the hero screen:** Use the city as a scientific instrument with a memorable, game-like feel. The city occupies most of the viewport; a compact side rail holds the hypothesis, live metric deltas, evidence tier, and selected agent. A bottom timeline provides play/pause, speed, tick scrubbing, and a strong before/after transition. An expandable economic drawer or linked second panel shows charts without shrinking the city into a thumbnail. Agent paths and vehicle routes must remain readable at demo distance on a projector. Selecting a metric highlights the agents/events that produced it; selecting a building highlights its incoming/outgoing flows and financial state. Keep source badges and uncertainty visible but visually secondary until opened. Use a coherent illustration style, restrained motion, and readable typography; avoid a crowded particle swarm that judges cannot interpret in four minutes.

**Rendering contract:** The renderer consumes only locations, actors, `visual_cue`s, and state deltas from `RunResult`. It may interpolate positions for smooth motion, but it cannot invent a trip, shop visit, closure, or metric. Provide an instant-replay mode so the pitch does not depend on real-time LLM latency.

## 14. Team ownership and critical path

| Person | Owns | First deliverable (within 2–4 hours) | Definition of done / handoff |
| --- | --- | --- | --- |
| **Aadit — city and dashboard frontend** | React UI, Three.js/isometric district, animation, controls, inspection, baseline/intervention presentation, linked economic charts | Render a fixture `RunResult` with moving people, bus, car, home, shop, tick scrubber, and at least one chart linked to an event | Scene consumes `WorldEvent.visual_cue` and metric points; works with both demo scenarios; polished 4-minute projector view |
| **Steven — persona AI swarm** | Scenario-specific role discovery, unique persona generation, memory, deep-agent decision prompts, lightweight-agent choice rules, coverage report | `generatePersonas(ScenarioSpec, WorldSpec) -> PersonaSpec[]` and one valid decision batch for two different prompts | Personas differ by hypothesis, persist across ticks, and return bounded action JSON that James's engine can validate; no fabricated aggregate results |
| **James — world engine and orchestrator** | Backend/API, world state, turn/tick scheduler, action validation, interactions, baseline/proposal runs, event log, metric computation, caching/replay | `runScenario(ScenarioSpec, PersonaSpec[], seed) -> RunResult` using fixture personas; `POST /scenario/run` stub | Deterministic replay from fixed seed/model responses; event-derived metric points drive Aadit's charts and scene; two domains use one runner; latency and call budget measured |
| **Meet — product, compiler, economics/evidence, integration** | Freeform prompt → `ScenarioSpec`, generic fallback schema, metric definitions and evidence gates, Toronto source fixture, human-note/evidence ledger, sponsor fit, integration checks, pitch and Devpost | Two prompt-to-ScenarioSpec fixtures (fare + Ontario wage), metric registry, source/assumption cards, agreed contracts committed; verify [demo-data.md](./demo-data.md) | Unknown prompts still yield a speculative run; economic claims pass provenance/unit checks; human note changes a run; full demo and submission verified |

**Meet is integration owner and Devpost owner.** James owns the backend contract, Aadit owns frontend visual quality, and Steven owns agent quality. Meet should not become the emergency implementer for every stream; each owner must publish a fixture and interface early. Pair Meet+James on schemas, James+Steven on action JSON, and James+Aadit on the event/visual contract in the first hour.

**Shared contracts and file boundaries:** Meet defines `ScenarioSpec`, `MetricDefinition`, and evidence/notes schemas; Steven defines `PersonaSpec` and decision schema with James; James defines `WorldEvent`, computes `MetricPoint`, and owns `RunResult`/API; Aadit defines visual cues/coordinates and chart interactions with James. Put all types in one shared contracts folder or copy generated JSON schema to both languages. No one should change a shared field without notifying the other owner and updating a fixture.

**Git sync and handoff rule:** Every teammate pulls `main` before starting a work block, fetches at least every 30 minutes during a long agent run, and syncs again before changing a shared contract, integrating another owner's work, or pushing. Claude Code runs a committed hook before every prompt: it fetches `origin` and fast forwards a clean, non-divergent `main`. On a dirty tree it fetches but reports that a manual integration is needed; it never resets, force-pulls, or stashes work. Resolve conflicts with the affected owner. Push a working vertical slice every 3–4 hours, not a large private branch at the end, and share the commit hash and interface changes. The first completed path is prompt → generated agents → baseline/proposal events → living scene. The second hypothesis is the generality test. If James cannot implement the generic engine in time, Steven should simplify action choices and Meet should supply a validated speculative fallback schema; Aadit should keep the city reading the unchanged `RunResult` contract. See [CLAUDE.md](./CLAUDE.md) for the executable Claude workflow.

## 15. Hackathon execution and submission

The [written Devpost rules](https://hack-the-valley-11.devpost.com/rules) allow up to four people, require in-person demo, and say submitted code must be created during the event window. An initial entry with team members and prize categories is due **Saturday 17 Oct, 9:00 pm ET**. The [Devpost event header/dates](https://hack-the-valley-11.devpost.com/details/dates) show **Sunday 18 Oct, 8:00 am EDT** as the close, while written rules say **10:00 am ET** and the [live schedule](https://hackthevalley.io/schedule) says **9:30 am**. Use **8:00 am** as the conservative final cutoff and ask organizers to clarify.

| Time / gate | Deliverable |
| --- | --- |
| **Now / first hour** | Freeze the already-decided city-first scope, fare and wage demos, and named owners; choose stack, hard cost cap, and shared contracts. |
| **First 6 hours** | One arbitrary prompt compiles; persona planner returns role-different agents; city animates fixture buses, cars, people, homes and shops; dashboard renders fixture metric points. |
| **By 12 hours** | Tick engine runs baseline/proposal for one scenario; event trace, one reconciled economic metric, and same-seed replay work. |
| **By 18 hours** | Second hypothesis passes the *same* path; if not, cut secondary analytics/exports and fix generality. Keep the live city. |
| **By 24 hours** | Human note → challenged assumption → rerun works; Toronto source/evidence tier, group comparison, and sensitivity chart visible. |
| **Saturday before 9:00 pm** | Submit initial Devpost entry with all team members and all intended prize categories. |
| **Final 6–8 hours** | Polish city scene/interactions, run demo repeatedly, record backup, complete write-up, check GitHub link. |
| **Sunday 5:30 am internal target** | Final entry complete and verified before the 8:00 am displayed cutoff. |

Attend or send one teammate to the [School of Cities workshop Friday 10–11 pm](https://hackthevalley.io/schedule) and [Papier.ai workshop Saturday noon–1 pm](https://hackthevalley.io/schedule) to ask about sponsor judging and data sources. Feed answers into §17. Do not let workshops stall the core build.

### Four-minute pitch sequence

1. **Problem (25s):** Policy ideas have interacting human consequences; researchers need fast, inspectable first-pass experiments.
2. **Freeform input (40s):** Type fare hypothesis; show compiler and auto-generated stakeholder roster.
3. **Living world + economy (60s):** Run baseline/intervention; inspect a household choice causing downstream business/agency effects, then open its linked household cost, shop, and public-budget charts.
4. **Human research (45s):** Show a teammate note, skeptic challenge, corrected assumption, and changed result.
5. **Generality (45s):** Enter second, unrelated hypothesis; show different agents, rules, metrics from same pipeline.
6. **Evidence and close (25s):** Show uncertainty band, tier/source badges, and decision brief; explain the next measurement needed before policy action.

**Judge Q&A preparation:** “Are these real people?”, “Why would their choices match Toronto?”, “Which effects are learned vs programmed?”, “What did the human researcher change?”, “Does any prompt really work?”, “How do you validate second-order effects?”, “What happens with no data?” The answer must be in the UI, not only in speech.

## 16. Risks and decision triggers

| Risk | Early signal | Response |
| --- | --- | --- |
| Generic prompt compiles into invalid/magic rules | Unprepared hypothesis fails to start | Use generic JSON-action fallback; expose speculative tier; preserve the same WorldEvent pipeline |
| Persona swarm is theatrical | Agents talk but do not change state or each other | Require state-changing actions and trace paths; cut dialogue volume |
| False credibility | UI presents synthetic percentages as Toronto predictions | Add tier labels, source/assumption badges, sensitivity, no unsupported external claim |
| Economy dashboard becomes fake precision | NPV, GDP, confidence bands, or city-wide totals appear without a calibrated model | Show only reconciled within-run effects; mark unsupported metrics `not_estimable`; distinguish scenario ranges from statistical intervals |
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
- **Team:** Aadit owns the city and dashboard frontend; Steven owns persona generation and AI decisions; James owns the world engine, metric computation, orchestrator, and backend; Meet owns hypothesis compilation, metric definitions, evidence/human research loop, integration, and submission.
- **Collaboration:** The team uses the shared [AGENTS.md](./AGENTS.md) product rules and a root [CLAUDE.md](./CLAUDE.md) for Claude Code. A committed prompt hook fetches `origin` and fast forwards a clean `main`; dirty, offline, or divergent states require manual resolution. Every owner fetches at least every 30 minutes during a long work block and shares pushed commit hashes and interface changes.
- **Source material:** The founder supplied the School of Cities [Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk). Its relevant catalogue is in [research.md](./research.md).

### Implementation gaps to settle in the first hour

1. **Meet + James:** Which model/API, hard spend cap per run, backend stack, and deployment target are available? Agree the first fare/wage metric formulas and projection time grain; cache the two demos regardless of provider.
2. **Aadit + James:** Will Three.js meet the storyboard in §13 after a 30-minute spike? If the spike fails, use an isometric renderer with the same event contract and quality bar.
3. **Meet + Steven:** Which real team research note, disagreement, and resulting question will be used in the Papiers demo? Record its author, timestamp, source, and effect on the rerun.
4. **All four:** Agree on the schema fixtures in §11 before building separate modules. The product assumptions above stand unless a concrete implementation failure triggers the fallback in §16.

### Hard challenge to the concept

An unrestricted prompt plus autonomous agents plus a polished living city is ambitious for 36 hours. The fastest credible implementation is a **small district, small number of deep agents, and a generic speculative fallback**. If the team instead tries to simulate a whole city with hundreds of independent LLM agents, the likely failure is a slow theatrical demo whose numbers cannot be defended. Preserve the founder's essential experience—autonomous personas, interactions, and a living scene—while keeping the world small and the event trace explicit.

## 18. Research and event sources checked

- [Hack the Valley 11 Devpost overview, categories, Papiers and School of Cities challenges](https://hack-the-valley-11.devpost.com/)
- [Hack the Valley 11 written rules](https://hack-the-valley-11.devpost.com/rules), [Devpost dates](https://hack-the-valley-11.devpost.com/details/dates), and [live schedule](https://hackthevalley.io/schedule)
- [HTV hacker package](https://app.notion.com/p/hackthevalley11/Hack-the-Valley-11-Hacker-Package-3f1c354d5236804e94e9fe0dff81eb82) and [package schedule](https://app.notion.com/p/hackthevalley11/Schedule-3f1c354d5236800598ddc2e313567b3c?pvs=25)
- [School of Cities Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk) and this repo's [research dossier](./research.md)
- [Locked Toronto demo, dataset shortlist, evidence limits, and observed baseline fixture](./demo-data.md)
- [Papiers product description](https://papiers.ai/); city and modelling sources linked in §§8–12

**Revision rule:** Update §17 when implementation gaps are settled and record any changed product decision, acceptance criterion, demo study, or owner here. Preserve unresolved assumptions explicitly; do not quietly turn the PRD back into a single-domain transit plan.
