# Locked Toronto MVP demo — fare shock near UTSC

**Decision:** Demo a hypothetical **$0.50 increase in the adult TTC pay-as-you-go fare**, leaving Fair Pass and the existing monthly cap rules unchanged, in a small **Morningside–Highland Creek / UTSC** district. The policy itself is TTC-wide; the 3D scene and computed outcomes represent a **local illustrative sample**, never an unweighted City-wide forecast. This is one test of the general hypothesis engine, not a fare-specific product. The second prepared demonstration is [hypothetical Bloor West bike-lane removal](./bloor-bike-demo.md); Ontario minimum wage is an optional cross-domain prompt test.

**Why this is the first prepared demo:** The intervention is concrete and within a municipal transit decision context. The district is familiar to judges at UTSC, contains different neighbourhood income/transit profiles, has actual TTC stops/routes and observed pedestrian/vehicle counts, and lets agents cause several downstream effects. It connects School of Cities' Toronto-data requirement, Papiers' human research loop, and the economic-inclusion dashboard. The Bloor case adds a distinct street-space and route-choice mechanism with its own Toronto evidence and economic questions. The [TTC's 2026 budget](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1) discusses fare affordability, ridership, revenue, and equity and sets a fare freeze and monthly cap as current context.

**Alternate policy using the same data and engine:** Lower the existing 47-paid-fare monthly cap to 35. This reverses the affordability/revenue pressure and may be a useful judge follow-up, but it is **not** the first MVP run: the effect is concentrated among frequent eligible riders and makes the local shop chain harder to demonstrate quickly. Do not build separate code for this option.

## The multi-step story to demonstrate

```text
Adult fare +$0.50 (Fair Pass unchanged; eligible monthly cap still applies)
  → different effective trip prices by persona and payment method
  → agents protect essential trips, walk nearby, drive, or defer discretionary trips
  ├─ → paid rides × applicable fares → simulated TTC fare revenue
  ├─ → household transport spend + time → disposable cash/access
  ├─ → mode substitution → walking/vehicle flows; emissions only with valid vehicle-km/fleet assumptions
  └─ → changed visits to a synthetic local shop → sales/margin → owner changes hours
       → worker's hours/income and other agents' access change next tick
```

This is a **branching, multi-agent counterfactual chain**, not a claim that several observed correlations establish causation. A fare increase can raise or lower fare revenue depending on paid trips. Lost bus rides may become walking, car trips, or no trip; emissions can rise or fall, and fixed bus service does not automatically emit less when a rider leaves. No Toronto dataset in this shortlist directly reports the fare-induced mode switch, shop revenue, or business closure. The agents and assumptions explore those links. Show a synthetic shop's **margin pressure under stated assumptions**, never claim a real named business will close.

## Data shortlist, ranked for this demo

| Priority | Source and usable fields | What it grounds | Critical limitation / extraction action |
| --- | --- | --- | --- |
| **1 / load** | [TTC fares and passes](https://www.ttc.ca/en/Fares-and-passes): adult PRESTO/contactless **$3.30**, Fair Pass PRESTO **$2.10**, **47 eligible paid fares** per calendar month, payment/transfer eligibility | Correct baseline price and which personas actually pay the increase | Snapshot rules before demo; cash, tickets, transfers, discounts, and capping differ. Do not charge +$0.50 to a protected or already-capped ride. |
| **1 / load** | [2021 Toronto neighbourhood profile workbook](https://open.toronto.ca/dataset/neighbourhood-profiles/) (`neighbourhood-profiles-2021-158-model`): Morningside and Highland Creek population, income, low-income prevalence, commuting mode | Two real neighbourhood baselines and distributional differences | These are separate **marginal aggregates**, not linked individual records; income is 2020, commuting reflects the unusual 2021 pandemic period. Do not infer that a given transit rider is low income. |
| **1 / load** | [TTC complete GTFS](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/) (ZIP; September 2026 resource): stops, routes, trips, schedules | Actual 38 Highland Creek and 116 Morningside route/stop geometry and travel options near UTSC | Scheduled service, not actual boarding, occupancy, or real-time reliability. Subset just the demo corridor; the full ZIP is ~84 MB. [TTC's campus guide](https://www.ttc.ca/en/riding-the-ttc/Explore-Toronto) confirms these UTSC options. |
| **1 / load** | [Toronto turning-movement counts](https://open.toronto.ca/dataset/traffic-volumes-at-intersections-for-all-modes/), `tmc_most_recent_summary_data`: vehicles, pedestrians, bicycles, count date/location | Real background activity for the animated Morningside/Ellesmere intersection | A **14-hour observed count** from 2025, not daily flow, bus ridership, or causal fare-response data. Use as scene/context validation, not to calibrate an elasticity. |
| **2 / load if time** | [Business licences and permits](https://open.toronto.ca/dataset/municipal-licensing-and-standards-business-licences-and-permits/): category, licence address, issued/cancel date | Plausible location/type of nearby food and retail destinations | Only businesses requiring a City licence appear; address needs geocoding. It has **no sales, visits, profit, or reason for cancellation**. Do not attach speculative failure labels to a real business. Use anonymized synthetic shops. |
| **2 / context** | [TTC 2026 operating budget](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1): ridership, public funding, affordability objectives, cap/freeze context | Policy decision criteria and source card | Agency-wide accounting cannot be allocated to our simulated district without a justified model. Show **sample fare revenue**, not “the City's revenue” or TTC net funding effect. |
| **3 / optional** | [Toronto sidewalk inventory](https://open.toronto.ca/dataset/sidewalk-inventory/), [cycling network](https://open.toronto.ca/dataset/cycling-network/), [OpenStreetMap](https://www.openstreetmap.org/) | Walking/cycling route feasibility and 3D street/building layout | Sidewalk source is older; OSM requires attribution/licence care. Avoid a new routing stack if it threatens the demo. |

### Verified local facts for the first fixture

From the City's [2021 neighbourhood workbook](https://open.toronto.ca/dataset/neighbourhood-profiles/) (columns **DP = Highland Creek**, **DQ = Morningside** in the 158-neighbourhood resource), checked 16 October 2026:

| Measure | Highland Creek | Morningside | Interpretation |
| --- | ---: | ---: | --- |
| Public-transit commuters / all mode commuters (2021, 25% sample) | 640 / 4,085 (15.7%) | 1,495 / 5,795 (25.8%) | Derived shares of employed commuters, **not** TTC fare elasticity or a count of UTSC students |
| Low-income prevalence, LIM-AT (2020 income) | 6.4% | 12.4% | Neighbourhood distributional context, **not** a joint income × transit table |
| Median after-tax household income (2020 CAD) | $105,000 | $76,500 | Historical median, not a cash budget for each synthetic household |
| City designation | Not an NIA or emerging neighbourhood | Neighbourhood Improvement Area | Relevant to equity framing, not a causal coefficient |

From the City's [most-recent intersection count resource](https://open.toronto.ca/dataset/traffic-volumes-at-intersections-for-all-modes/): **Ellesmere Rd / Morningside Ave**, 3 July 2025, **14 continuous hours**, recorded **29,600 vehicles, 3,815 pedestrians, and 96 bicycles**. The City describes these as short-term turning-movement counts for infrastructure design. They should anchor scene scale/context only; they do not measure trips made by our personas or predict a post-fare world.

The 2021 commuting counts describe **employed residents with a usual workplace**, not all transit riders or UTSC students. A student role in the swarm is plausible near campus but needs a separate source or a clearly tagged assumption. Do not use the neighbourhood-level transit and income marginals to assert a particular rider's income.

Machine-readable source facts are in [data/toronto_demo_baseline.json](./data/toronto_demo_baseline.json). It contains **observed inputs only**, not scenario results or invented elasticities. Store any extracted GTFS/business subset separately with source date, query, licence, and checks.

## Evidence ledger for every arrow

| Link | Status in MVP | Required assumption or measurement |
| --- | --- | --- |
| Fare rule → price paid | **Directly grounded** in TTC rules | Fare type, payment method, transfers, cap progress, and Fair Pass eligibility |
| Neighbourhood → population/mode/income margins | **Directly grounded** in 2021 census-derived workbook | Synthetic joint profile and which residents use a given route remain assumptions |
| Price → changed ride/mode/trip choice | **Transferred evidence + sensitivity**, not Toronto-calibrated | Fare-response range, essential/discretionary trip distinction, walking/driving feasibility; cite [bus-fare elasticity review](https://www.gov.uk/government/publications/bus-elasticities-and-diversion-factors) if used |
| Mode/trip choice → paid rides and household fare spend | **Computed from committed events** | Apply cap/discount/transfer rules; no model-written totals |
| Deferred/diverted trips → shop visits → sales/margin/hours | **Exploratory assumption-driven chain** | Visit purpose, spend per visit, shop costs, owner's response; show threshold pressure, not real closure |
| Mode shift → emissions | **Optional, conditional** | Car distance, vehicle/fuel mix, changed bus service kilometres and suitable emission factors; no “fewer riders = lower emissions” shortcut |
| Local sample → TTC or Toronto-wide annual outcome | **Not estimable in MVP** | Representative sampling/weights, fare product mix, complete network, and validation |

## Four-minute live demo and pass/fail test

1. Enter the freeform fare hypothesis, show the compiler choosing **Morningside–Highland Creek**, actual fare/GTFS/census/count badges, and the distinct persona roster. Explain that shops and some behavior parameters are synthetic.
2. Run the unchanged and +$0.50 worlds from one seed. Follow one frequent adult rider who switches a discretionary shop trip to a nearby walk, one rider who skips a longer trip, and one protected Fair Pass rider who sees no direct fare increase. These are **illustrative possible choices**, not pre-asserted empirical findings.
3. Click the shop to trace a **three-hop interaction**: fewer visits → lower simulated sales → owner reduces a shift → a worker's income changes next tick. Open the linked economy chart. In parallel, inspect paid rides and **sample** TTC fare revenue; it may increase or decrease by sensitivity case.
4. Show a genuine team research note: for example, a teammate points out that the monthly cap and Fair Pass rule were omitted from a first assumption. The research agent asks for the applicable fare product, a human fixes it, and the same run is versioned and replayed. Make the changed subgroup result visible.
5. Toggle a low/base/high fare-response assumption. The dashboard shows different ridership, shop-margin, and fare-revenue paths. The emissions tile says **not estimable** until a valid mode/vehicle-distance model exists. Close with what Toronto should measure to validate the hypothesis (fare-product by group, trip substitution, local shop foot traffic/revenue).

**Pass:** At least one downstream business decision changes another agent's state; both city and charts point to the same event IDs; two outcome branches respond to a changed assumption; real source badges and speculative badges are clearly different. **Fail:** a predetermined chart animates independently of agent actions, neighbourhood averages are treated as individual correlations, shop closure is claimed as fact, or local simulated totals are presented as TTC-wide forecasts.

## First-hour data handoff

| Owner | Deliverable |
| --- | --- |
| **Meet** | Check `toronto_demo_baseline.json` against the linked source versions, choose one fare-response sensitivity range with its source/transfer warning, and put the source/assumption badges in `ScenarioSpec` fixtures. |
| **James** | Apply fare/cap/discount rules and compute sample paid rides, fare spend, shop transactions, and stakeholder ledgers from events; keep City-wide totals marked not estimable. |
| **Steven** | Give personas trip purpose, mode options, cash/time constraints, fare product, and decision memory; produce distinct outcomes under different response assumptions. |
| **Aadit** | Render the UTSC-area district, route/stop context, one observed baseline badge, agent/shop inspection, and linked ridership/household/business/revenue charts from `RunResult`. |

**Build constraint:** The full product still accepts any hypothesis. Do not embed these Toronto numbers in the generic world engine, persona prompt, or renderer. Load them through source fixtures and the shared contracts.
