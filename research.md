# Research and source dossier — Hack the Valley 11

**Purpose:** Give every teammate and coding agent the event rules, sponsor targets, source catalogue, and research caveats in one repository file. Read [prd.md](./prd.md) for the product requirements. This file summarizes sources; follow the links when implementing or citing a dataset.

**Checked:** 16 October 2026, Toronto time. Event pages can change; a named teammate should reconfirm deadlines with organizers and record any update here.

## Sponsor tracks and judging

### Papiers Autoresearch — primary

[Devpost challenge](https://hack-the-valley-11.devpost.com/) asks what research could look like when humans and AI agents work together. Its concrete prompts are: can agents build on what people previously **read, questioned, and learned**; can teams combine the knowledge and judgment of multiple people; can agents keep humans informed, ask for expertise, and help them learn from discoveries? [Papiers](https://papiers.ai/) describes its product as a workspace for reading, highlights, notes, saved links, and autonomous research.

**PRD implication:** Show a real human research note affecting a run, a second human or skeptic challenging an assumption, an agent asking for input, and an auditable rerun. A city full of autonomous personas alone does not demonstrate the stated human–AI research challenge.

**Verified integration path (16 Oct 2026):** [Papiers' agent documentation](https://wiki.papiers.ai/docs/agents) describes a read-only `papiers` CLI (Node.js 22+) authenticated with a token created in Papiers Settings. Agents can `search` and `read` JSON for saved papers/articles, passages, highlights, notes, and conversations. The docs explicitly say the CLI cannot import, edit, highlight, tag, or publish; no write API should be assumed. This enables a concrete loop: a teammate curates and annotates analogous policy research in Papiers → our research adapter retrieves original passages plus that human judgment → the orchestrator proposes a mechanism or parameter range with a transfer warning → a human approves/edits/rejects → the simulation reruns and logs the decision. If the team cannot obtain a token or CLI access in time, use a cited local fixture through the same adapter and be candid that Papiers itself was not connected.

**First spike for Meet:** obtain a token in Papiers Settings → API tokens, keep it in `PAPIERS_TOKEN` outside Git, then run `papiers auth status`, `papiers search "transit fare elasticity ridership mode shift" --limit 10 --json`, and `papiers read <returned-passage-or-note-id> --json`. Confirm that one teammate's actual annotation and its original passage are returned before wiring the adapter. The CLI also ships a `papiers-research` skill, but the direct JSON commands are enough for the MVP. [Papiers CLI reference](https://wiki.papiers.ai/docs/agents).

**MVP research pack and setup (17 Oct):** [papers.md](./papers.md) evaluates 15 fare, access, equity, revenue, retail, and employment studies/reports against the locked Toronto demo; [data/ttc_fare_evidence.json](./data/ttc_fare_evidence.json) is a machine-readable, agent-curated fallback. [papiers-setup.md](./papiers-setup.md) records the local CLI installation and live acceptance test. CLI `0.1.5` is installed on Meet's machine but was unauthenticated when checked; the paper pack must **not** be presented as a Papiers result or a human note. James's team guidance for the pitch calls for a completed autonomous investigation, evaluation of evidence, an agent-generated next step, and genuine human contribution. Our proposed F03/F11 note → agent challenge → human-approved sensitivity rerun is the concrete proof. The retail and employment papers include counterevidence; a fare hike causing store closure is not an established empirical result.

### Hack the Valley × U of T School of Cities — secondary

[Devpost challenge](https://hack-the-valley-11.devpost.com/) asks for a useful civic technology prototype addressing a **real urban problem facing Toronto in the 2026 municipal election**. The target users can be residents, journalists, community organizations, or policymakers. Toronto urban data should be a foundation. The challenge says the goal is to make civic information useful, accessible, and actionable; it does **not** ask for election prediction or candidate support. Three awards total CAD $900 are listed.

The School of Cities' own [Toronto Civic Data Starter Guide](https://docs.google.com/document/u/0/d/1xkrJwUTqOOMaujorvh12dRXWtdL35bOf27dxgRnNuFY/mobilebasic#heading=h.hvv5c04l3mzk) encourages teams to find, download, clean, combine, and interpret relevant public datasets. Its list is a **starting point, not a required bundle**.

**PRD implication:** One live hypothesis must involve a concrete Toronto policy question and an actual, linked Toronto dataset. The general platform can work without city data for other prompts, with clearly speculative output.

### Sustainable FinTech & Economic Inclusion — additional

[Devpost](https://hack-the-valley-11.devpost.com/) lists this category but provides no detailed sponsor brief in the accessible overview. A fare, wage, childcare-cost, or housing-cost scenario can demonstrate household budgets and economic inclusion. Make this a coherent feature of the product, not a label applied at submission time. Avoid claiming extra criteria that have not been published.

### [MLH] Best Use of Vultr — conditional additional entry

[Devpost](https://hack-the-valley-11.devpost.com/) invites projects built with Vultr one-click deployment, cloud compute, or Cloud GPUs and lists free cloud credits; it does **not** specify that a GPU is required. The [MLH credit page](https://discover.vultr.com/mlh) says hackathon participants may claim credits, but this team had **no account as of 17 Oct**, and credit applicability to Serverless Inference was not verified. [Vultr's current catalog](https://api.vultrinference.com/docs/models) lists `clef`/`clef-flash` typed decision models through [`/v1/systemone`](https://api.vultrinference.com/docs/reference/create-systemone). This matches our bounded `decide()` slot; the research has **not** established their quality on city actions. The integration/deployment and honest proof gate are in [VULTR.md](./VULTR.md).

### Track entry check for this specific product

| Category | Enter? | Evidence the demo must show | Main gap to close |
| --- | --- | --- | --- |
| **Papiers: Autoresearch** | **Yes, primary** | A researcher's prior reading/note changes an agent assumption; another person challenges it; the system asks for expertise and reruns with a visible difference | An autonomous swarm alone is insufficient; show the human research loop explicitly |
| **Hack the Valley × School of Cities** | **Yes, secondary** | A Toronto civic policy question, at least one actually used Toronto urban dataset with source/year, and an actionable explanation for a resident or policy user | A generic city illustration or a mere source link is insufficient |
| **Sustainable FinTech & Economic Inclusion** | **Yes, if the finance view ships** | Household transport affordability and business cash-flow/partial-margin differences with group slices in the fare and Bloor scenarios | Category title has no detailed published criteria; financial metrics need real interaction with the model |
| **Best AI for Social Impact** | **Optional** | Explain how underserved groups are affected and how assumptions/uncertainty are exposed | Requires substantive impact, not a label |
| **[MLH] Best Use of Vultr** | **Yes, if live Vultr compute ships** | Show Vultr handling typed persona actions and the hosted orchestrator returning one event-backed result | Account/credit terms, live quality probe, and deployment are still missing; a local fixture does not qualify as proof |
| **Top 3** | **Automatic** | A working, distinctive, visually clear product and strong four-minute demo | All teams are considered |

[Devpost's requirements and prize descriptions](https://hack-the-valley-11.devpost.com/) allow a team to select any number of prize categories; the [rules](https://hack-the-valley-11.devpost.com/rules) allow one final project per team and up to four members. The four teammates must each satisfy the hackathon's student, age, and in-person participation rules. The team should enter the first two tracks in the **Saturday 9 pm initial submission**, and include FinTech if the financial behavior is implemented by then. This is a fit assessment from the published descriptions, not a guarantee of eligibility or an award; organizers decide any ambiguity.

### Overall judging and submission

[Devpost overview](https://hack-the-valley-11.devpost.com/) lists Technicality & Quality, Design, Impact, Presentation, Inspiration, and Authenticity. It requires a write-up explaining why the product was built, tech stack, and what it does; **a GitHub code link is required for judging**. The pitch is **4 minutes** and Q&A **1 minute**.

[Written rules](https://hack-the-valley-11.devpost.com/rules): up to **4** teammates; participants must be present in person; submitted code is to be created during the event window (Friday 16 October 8:00 pm ET through Sunday 18 October 10:00 am ET); one final project entry per team; multiple prize categories may be selected. The rules specify an **initial Devpost submission by Saturday 17 October 9:00 pm ET with team members and prize categories**.

**Conflicting final deadlines:** [Devpost header/dates](https://hack-the-valley-11.devpost.com/details/dates) say Sunday **8:00 am EDT**. Written rules say Sunday **10:00 am ET**. [Live HTV schedule](https://hackthevalley.io/schedule) says Sunday **9:30 am**. Use the earliest, **8:00 am Sunday**, until organizers clarify. A safe internal target is **5:30 am Sunday**. The live schedule says judging 10:00 am–1:00 pm; written rules say noon–3:00 pm, so ask organizers where/when your team demos.

## Event and hacker package

The [hacker package](https://app.notion.com/p/hackthevalley11/Hack-the-Valley-11-Hacker-Package-3f1c354d5236804e94e9fe0dff81eb82) says its times are Eastern Daylight Time (UTC-4). It links the pages below. Some individual entries say EST; use the Devpost EDT deadline above for submission.

| Page | Relevant details |
| --- | --- |
| [Package schedule](https://app.notion.com/p/hackthevalley11/Schedule-3f1c354d5236800598ddc2e313567b3c?pvs=25) | Friday check-in 5:00 pm; opening ceremony 8:00–9:30 pm; Sunday closing 2:30 pm. |
| [Live schedule](https://hackthevalley.io/schedule) | School of Cities workshop **Friday 10:00–11:00 pm, IA 2100**; Papier.ai workshop **Saturday noon–1:00 pm, IA 2160**; initial Devpost entry Saturday 9:00 pm. |
| [Venue](https://app.notion.com/p/hackthevalley11/Venue-3f1c354d523680dc9b30c00d898f2546?pvs=25) | Sam Ibrahim (IA) Building, UTSC, 1050 Military Trail, Toronto. Main-door check-in; bring HTV QR code and valid photo ID. Sponsor lounge IA 2110; executive room IA 1120. |
| [Arrival](https://app.notion.com/p/hackthevalley11/Arrival-3f1c354d52368050aff5c5ad2a0a4f62?pvs=25) | Get lanyard at front registration desk; use help desk or Discord questions channel for issues. |
| [Preparation](https://app.notion.com/p/hackthevalley11/Preparation-3f1c354d5236806692e5f779884529b5?pvs=25) | Valid photo ID required; bring laptop/charger and other project equipment. |
| [Transportation](https://app.notion.com/p/hackthevalley11/Transportation-3f1c354d52368015aceeded511ad15f1?pvs=25) | Hackers arrange their own travel; no travel reimbursement or parking accommodation. |

## Toronto Civic Data Starter Guide — direct source catalogue

These are the sponsor guide's source links, grouped by how Counterfactual Lab may use them. **“Listed” means the guide linked them; it does not mean we downloaded, cleaned, checked freshness, or approved them for a model.** Use a dataset only after recording its year, geography, unit, licence, missingness, and relevant fields.

### Core geography and demographics

| Source | Relevance |
| --- | --- |
| [City of Toronto Open Data](https://open.toronto.ca/) | Main municipal catalogue across policy domains |
| [Statistics Canada Census](https://www12.statcan.gc.ca/census-recensement/index-eng.cfm) and [2021 Census Profile](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm) | Demographic, income, housing, employment, commute indicators at several geographic levels |
| [Toronto Neighbourhood Profiles](https://open.toronto.ca/dataset/neighbourhood-profiles/) | Census-derived neighbourhood aggregates, easier to use for the demo |
| [Toronto Ward Profiles](https://www.toronto.ca/city-government/data-research-maps/neighbourhoods-communities/ward-profiles/) | Municipal ward-level context |
| [Neighbourhood boundaries](https://open.toronto.ca/dataset/neighbourhoods/) and [city wards](https://open.toronto.ca/dataset/city-wards/) | Map geometry and aggregation geography |
| [2021 Census boundary files](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index-eng.cfm) | Census tract spatial joins |
| [OpenStreetMap](https://www.openstreetmap.org/) and [School of Cities OSM guide](https://schoolofcities.github.io/urban-data-storytelling/urban-data-analytics/openstreetmap/openstreetmap.html) | Streets, paths, buildings, amenities for a district scene or access analysis |

### Transport, access, and cycling

| Source | Relevance / caution |
| --- | --- |
| [TTC routes and schedules](https://open.toronto.ca/dataset/ttc-routes-and-schedules/) and [merged GTFS](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/) | Stops/trips/routes; schedules are not observed trips |
| [TTC bus delays](https://open.toronto.ca/dataset/ttc-bus-delay-data/), [streetcar delays](https://open.toronto.ca/dataset/ttc-streetcar-delay-data/), [subway delays](https://open.toronto.ca/dataset/ttc-subway-delay-data/) | Historic service-reliability context; check coverage and dates |
| [Toronto Cycling Network](https://open.toronto.ca/dataset/cycling-network/) and [Bike Share Toronto](https://open.toronto.ca/dataset/bike-share-toronto/) | Cycling infrastructure and station/access context |
| [Metrolinx open data](https://www.metrolinx.com/en/about-us/open-data) and [Transitland](https://www.transit.land/) | Regional transit and standardized feeds |
| [TTC fares and passes](https://www.ttc.ca/en/Fares-and-passes) | Current fare rules: adult PRESTO $3.30, Fair Pass PRESTO $2.10, 47 eligible fares/month cap as checked October 2026 |
| [TTC fare modernization](https://www.ttc.ca/Fares-and-passes/Fare-Modernization) | TTC policy explicitly considers equity, affordability, revenue, and ridership |

The sponsor guide suggests R5/r5py with GTFS and street networks for travel-time analysis. Do not block the hackathon MVP on a new routing stack unless an owner already knows it.

### Housing, development, and land use

| Source | Relevance |
| --- | --- |
| [CMHC housing data](https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data), [rental market tables](https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/data-tables/rental-market/rental-market-report-data-tables), [Housing Market Information Portal](https://www03.cmhc-schl.gc.ca/hmip-pimh/en/TableMapChart/Table) | Rents, vacancy, stock, housing-market indicators |
| [Toronto Housing Data Hub](https://www.toronto.ca/city-government/data-research-maps/toronto-housing-data-hub/Housing-data/) and [Affordable Rental Housing Map](https://www.toronto.ca/city-government/data-research-maps/toronto-housing-data-hub/affordable-rental-housing-map/) | Housing targets, delivery, ward data, affordable projects |
| [Apartment Building Evaluation](https://open.toronto.ca/dataset/apartment-building-evaluation/) | RentSafeTO building condition information |
| [Active permits](https://open.toronto.ca/dataset/building-permits-active-permits/), [cleared permits](https://open.toronto.ca/dataset/building-permits-cleared-permits/), [development applications](https://open.toronto.ca/dataset/development-applications/) | Development and construction activity |
| [Toronto zoning by-law](https://open.toronto.ca/dataset/zoning-by-law/) | Land-use constraints |

### City services and civic participation

| Source | Relevance / caution |
| --- | --- |
| [Licensed childcare centres](https://open.toronto.ca/dataset/licensed-childcare-centres/) | Locations, capacity, program details for childcare access hypothesis |
| [Parks and recreation facilities](https://open.toronto.ca/dataset/parks-and-recreation-facilities/) | Service locations and accessibility |
| [311 service requests](https://open.toronto.ca/dataset/311-service-requests-customer-initiated/) | Resident-initiated requests; sponsor guide warns this is only part of 311 and categories/geographies changed over time |
| [Toronto municipal election results](https://www.toronto.ca/city-government/elections/election-results-reports/election-results/general-election-results/) and [election financial disclosures](https://secure.toronto.ca/EFD/jsf/main/home.xhtml?campaign=0) | Civic context; project should not predict 2026 election or support a candidate |

The guide also lists [Ontario election results](https://results.elections.on.ca/en/results-overview), [federal election results](https://www.elections.ca/content.aspx?section=res&dir=rep/off&document=index&lang=e), [Open Government Canada](https://search.open.canada.ca/opendata/), [CANUE](https://canue.ca/), [Google Dataset Search](https://datasetsearch.research.google.com/), [ArcGIS Hub](https://hub.arcgis.com/search), and [Native Land Digital](https://native-land.ca/) as additional discovery/context sources.

### Additional City sources verified for the locked demo

The best MVP subset and checked values are documented in [demo-data.md](./demo-data.md) and [data/toronto_demo_baseline.json](./data/toronto_demo_baseline.json). Beyond the sponsor guide's general catalogue, these City sources improve the multi-effect fare case:

| Source | Verified availability | Appropriate use |
| --- | --- | --- |
| [Toronto traffic volumes at intersections, all modes](https://open.toronto.ca/dataset/traffic-volumes-at-intersections-for-all-modes/) | CKAN resource `tmc_most_recent_summary_data` exposes count date, location, vehicles, pedestrians, bicycles; Morningside/Ellesmere has a 14-hour count dated 3 July 2025 | Observed local scene/activity context; not fare-induced mode response |
| [Municipal Licensing and Standards business licences](https://open.toronto.ca/dataset/municipal-licensing-and-standards-business-licences-and-permits/) | CKAN datastore exposes business category/address, issued date, cancel date; refreshed daily | Seed anonymized nearby shop types/positions. No visits, sales, profit, or causal closure inference |
| [2026 TTC operating budget report](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1) | Published ridership, fare cap/freeze, affordability, revenue and funding context | Specify real decision criteria; cannot scale a district agent run into the agency budget |

The **2021 Toronto neighbourhood profile workbook** was inspected directly: column DP is Highland Creek, DQ is Morningside. The commuter-mode and income numbers in the demo fixture come from different rows/universes; they are not linked individual observations. The **merged TTC GTFS** resource was confirmed as a September 2026 ZIP; route selection still needs an implementation-time extract. The City traffic-count documentation states that counts from September 2023 onward cover a continuous 14-hour period.

## Modelling evidence and boundaries

### What a policy/economic decision dashboard needs

- [Treasury Board of Canada Policy on Cost-Benefit Analysis](https://www.canada.ca/en/government/system/laws/developing-improving-federal-regulations/requirements-developing-managing-reviewing-regulations/policy-cost-benefit-analysis.html) calls for comparison of feasible alternatives, positive/negative costs and benefits, sensitivity to uncertain assumptions, and distribution across affected stakeholders. Discount rate, time period, common price year, and applicable valuation methods matter when monetizing future effects. **Product implication:** show status quo versus policy, who pays/benefits, and which assumptions drive the result; only calculate present value with valid time and valuation inputs.
- [Treasury Board Guide to Costing](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32600) distinguishes point estimates, uncertainty, cost risks, and validation against historical or independent evidence. **Product implication:** model a cost range and the driver behind it; do not label three hand-picked simulation cases a statistical confidence interval.
- [World Bank and Inter-American Development Bank, *Impact Evaluation in Practice*](https://www.worldbank.org/en/programs/sief-trust-fund/publication/impact-evaluation-in-practice) explains why a credible counterfactual and evaluation design are needed to learn real-world effects after implementation. **Product implication:** include a “what to measure next” section and never call a synthetic baseline an empirical causal estimate.
- [2026 TTC operating budget report](https://secure.toronto.ca/council/agenda-item.do?item=2026.TTC12.1) treats ridership, fare revenue, equity, and customer experience as decision criteria and records the 2026 fare freeze and fare-cap policy. **Product implication:** the transit demo's dashboard should display these competing dimensions; it should not imply higher fares automatically improve the TTC's net position.
- [Department of Finance Canada GBA+ budget template](https://www.canada.ca/en/department-finance/services/publications/federal-budget/proposals/gba.html) asks for income-distribution and other demographic effects, with source/data gaps noted. **Product implication:** subgroup outcomes and unknown coverage are first-class results, not an afterthought.

The PRD's [economist/policymaker workspace](./prd.md#76-economist-and-policymaker-decision-workspace) turns these references into concrete metric, chart, projection, and evidence requirements. It is a research-support interface, not an official Canadian CBA or forecast model.

- [Generative Agents](https://arxiv.org/abs/2304.03442) demonstrates agent memory, reflection, planning, and interactions producing believable behaviour in a small synthetic town. It establishes a useful interaction pattern, not evidence that arbitrary policy outputs predict real populations.
- [Google DeepMind's Concordia paper](https://deepmind.google/research/publications/64717/) describes generative agent-based modelling grounded in physical/social/digital spaces. Its Game Master mediates the shared world and checks actions. **Design implication:** James's orchestrator should validate and commit actions against one authoritative state rather than let agents freely narrate outcomes.
- [AI Metropolis](https://mast.stanford.edu/pubs/ai_metropolis_scaling_large_language_model_based_multi_agent_simulation_with_out_of_order_execution/) studies scaling LLM-agent simulations by recognizing dependency order and parallelizing independent work. **Design implication:** collect independent choices concurrently, then commit dependent actions in a consistent order; avoid waiting sequentially for every persona.
- [AgentSociety](https://aclanthology.org/2025.acl-industry.94/) combines mobility, interactions, and economic activity in a social simulation. **Design implication:** keep locations, budgets, and interactions in the same world state, but constrain this hackathon to a small district and a few deep agents. The paper's scale is research-infrastructure scale, not a weekend target.
- [Microsoft AutoGen paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2023/08/LLM_agent.pdf) describes configurable multi-agent conversation with tools and human participation. **Design implication:** useful for researcher/skeptic roles and structured handoffs; agent-to-agent dialogue alone should not replace an explicit causal world engine.
- [Stanford's 1,000-person simulation work](https://hai.stanford.edu/policy/simulating-human-behavior-with-ai-agents) used two-hour interviews with actual participants and benchmark comparisons. Census marginals alone do not provide that fidelity.
- [Agent-based models in empirical social research](https://pmc.ncbi.nlm.nih.gov/articles/PMC4430112/) emphasizes data-based model evaluation. A simulation should be checked against known patterns and assumptions, then validated before policy forecasting claims.
- [Holmgren's transit-demand meta-analysis](https://www.sciencedirect.com/science/article/pii/S096585640700047X) reports that fare response depends on how service quality is modelled. A foreign estimate is a sensitivity input, not a Toronto-calibrated coefficient.
- [Ontario minimum wage rules](https://www.ontario.ca/document/your-guide-employment-standards-act-0/minimum-wage) establish the current provincial rate and jurisdiction. A “Toronto increases minimum wage” prompt should be reframed as a hypothetical Ontario change affecting Toronto or a specific City fair-wage policy.

**Product interpretation:** Counterfactual Lab must distinguish (1) observed public data, (2) research-based parameters transferred from another setting, (3) human assumptions, (4) AI-generated assumptions, and (5) events measured inside its simulation. Every economic metric needs a unit, group denominator, time horizon, calculation rule, and trace to events/sources. Never promote a simulated result to a real-world forecast automatically.

## Founder decisions received

As of 17 October, the founder specified: unrestricted freeform hypotheses; **always** run an exploratory simulation when data are missing; the **interactive live city is the primary output** and the evidence-backed brief is secondary; autonomous persona creation and agents interacting/making decisions are non-negotiable; public data grounding is desirable but not required for every prompt; the scene needs live buses, cars, people, homes, shops, and high visual quality. The city is the hackathon renderer even for prompts from another domain, with clear symbolic labelling. The prepared pair is Toronto transit fare and hypothetical Bloor West bike-lane removal, with [Bloor source and assumption limits](./bloor-bike-demo.md); an Ontario minimum-wage prompt remains an optional cross-domain smoke test. The [interactive city experience](./experience/README.md) is a UI replay awaiting shared engine data. Named work ownership is in [prd.md §14](./prd.md#14-team-ownership-and-critical-path); remaining implementation decisions are in §17.
