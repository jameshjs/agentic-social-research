# Bloor bike lane: selected demo research and data pack

**Status (17 October 2026):** Originally assembled as a candidate, this is now the **second prepared demo** after the founder chose hypothetical Bloor West bike-lane removal. The decision is recorded in [prd.md](./prd.md#17-locked-decisions-and-implementation-gaps), with the [scenario and visual brief](./bloor-bike-demo.md) alongside this deeper evidence pack. All summaries are agent-curated; none is a human Papiers annotation, and no paper here is claimed to be in our Papiers library yet. Source IDs in this pack and the separate scenario brief are local to each document and must be reconciled before combining fixtures.

Machine-readable files:

- [data/bloor_bike_lane_baseline.json](./data/bloor_bike_lane_baseline.json): observed Toronto inputs only (counts, network, census, 2016–17 pilot evaluation)
- [data/bike_lane_evidence.json](./data/bike_lane_evidence.json): 11-source evidence index plus conflicts
- [data/bike_lane_evidence_packet.json](./data/bike_lane_evidence_packet.json): offline `EvidencePacket` fixture in the same shape as the [fare packet](./data/ttc_fare_evidence_packet.json)

## The investigation

**Question:** In a small synthetic district on Bloor St W between Shaw St and Avenue Rd (the 2016 pilot area, about 2.4 km), what might happen to cyclists, drivers, transit riders, local shops, shop workers and the public budget if the protected bike lane is **removed** under Ontario's Bill 212, versus kept? The loop can also test keep-with-changes options (restore some parking, add loading zones).

**Why it is live:** The [Reducing Gridlock, Saving You Time Act, 2024](https://thetrillium.ca/municipalities-newsletter/ford-government-passes-bill-remove-3-toronto-bike-lanes-9876645) lets the province remove the Bloor, Yonge and University lanes. The Superior Court found that unconstitutional on 30 July 2025 ([CP24](https://www.cp24.com/politics/queens-park/2025/08/03/a-judge-struck-down-the-ford-governments-bike-lane-removals-in-toronto-what-comes-next)). The Court of Appeal allowed the province's appeal on 14 August 2026, in *Cycle Toronto v. Ontario (AG)*, 2026 ONCA 582 ([CP24](https://www.cp24.com/local/toronto/2026/08/14/ford-government-can-rip-out-toronto-bike-lanes-court-of-appeal-for-ontario-rules/), [McCarthy Tétrault](https://www.mccarthy.ca/en/insights/blogs/canadian-appeals-monitor/no-charter-right-to-bicycle-lanes-court-of-appeal-for-ontario-reins-in-section-7-claim)). City staff estimated removal at $48 million or more with minimal travel-time gain ([CP24, Nov 2024](https://www.cp24.com/politics/toronto-city-hall/2024/11/13/removing-bike-lanes-on-bloor-yonge-and-university-would-cost-at-least-48-million-city-staff/)). The exact Bloor limits in the statute are **not yet verified** here.

**Why it suits this product:**

- The core evidence is about **this exact street**: the City's own before/after evaluation and the Bloor economic study.
- The economic evidence is **survey-based**, with published questionnaires the agents can reuse.
- Merchants, drivers, cyclists and residents **disagree in the data**, which gives the personas real starting beliefs.
- The live city can already show bikes, cars, parked cars, buses and shops.

**What the evidence can and cannot do:** It supports the existence of cycling diversion, vehicle volume and travel-time changes, parking-supply change, customer mode shares, and a range of retail outcomes from negative to positive. It does **not** give:

- a removal elasticity
- shop-level sales
- the probability that a business closes
- a forecast of collisions after removal
- a Toronto-wide traffic effect

Those must be labelled assumptions, simulated outputs or not estimable. **All economic evidence is from installing lanes, not removing them.** Riders, routes and businesses have adapted since 2016, so reversal is a sensitivity case, not a mirror image.

## The multi-step story to demonstrate

```text
Remove protected lane (restore a curb lane and some parking; construction period first)
  → cyclists choose: stay on Bloor in mixed traffic, reroute (Harbord/Dupont), switch to transit/car, or make fewer trips
  ├─ → Bloor and parallel-street vehicle and bike volumes, peak travel time
  ├─ → parking supply and drivers' search time → driver visits to shops
  ├─ → walking/cycling visitors' frequency and spend → shop sales by business type
  │      → owner adjusts staff hours or hours of operation → worker income/schedule next tick
  ├─ → injury risk exposure (relative, wide range) → safety tile marked assumption-driven
  └─ → public ledger: removal/reconstruction cost and parking revenue
```

The interesting tension is that removal **adds parking** (drivers gain) but may **lose frequent walking/cycling customers** (B02, B04). Which effect dominates differs by shop type (B06). The autoresearch loop sweeps exactly that.

## Read first: the five sources that shape the demo

| Source | What to test in the model | Why it matters / transfer limit |
|---|---|---|
| [B01 City of Toronto (2017), Bloor pilot evaluation](https://www.toronto.ca/legdocs/mmis/2017/pw/bgrd/backgroundfile-107582.pdf) | Cycling +49% (3,309 → 4,925/day; 25% new riders, rest rerouted from Harbord −25% and Dupont −11%); Bloor vehicles −16%, three-corridor net −3%; peak travel time +0:32 to +4:15; on-street parking 303 → 167; conflicts −44% overall but bike–pedestrian +61% | Official Toronto before/after numbers for the same segment. Installation, not removal; less than one year of collision data. |
| [B02 Smith Lea et al. (2017, updated 2019), Bloor economic study](https://ero.ontario.ca/public/public_uploads/2024-11/Bloor-Economic-Impact-Study-Full-Report-2019-09-03_4.pdf) | Visit frequency +3 days/month; merchant-reported customer counts and visitor spending up; vacancy stable | The report itself says similar growth on the Danforth control means the gains **may be due to other factors**. It was funded by the BIAs and the City. |
| [B04 Forkes & Smith Lea (2010), Bloor West Village](https://www.tcat.ca/wp-content/uploads/2016/08/BikeLanes_Parking_Business_BloorWestVillageNewCover.pdf) | Merchant belief gap: 21% of visitors drove, but 69% of merchants thought more than 20% did; 46% expected fewer customers | Measured perceptions, not sales. Seed shop-owner personas with this belief and let evidence challenge it. |
| [B06 Volker & Handy (2021)](https://doi.org/10.1080/01441647.2021.1912849) | Positive or non-significant retail effects in general, but possible harm to **auto-oriented** businesses | Use for business-type heterogeneity, not a coefficient. |
| [B08 Stantec (2011), Vancouver](https://council.vancouver.ca/20110728/documents/penv3-BusinessImpactStudyReportDowntownSeparatedBicycleLanes-StantecReport.pdf) | Negative case: estimated sales −10% (Hornby), −4% (Dunsmuir) | Perception-based, low response, heavily confounded; primary PDF not checked. Required so the sweep is not one-sided. |

## Evidence matrix: 11 sources

| ID | Original source and checked finding | Demo use | Transfer / review boundary |
|---|---|---|---|
| B01 | City of Toronto (2017), [pilot evaluation](https://www.toronto.ca/legdocs/mmis/2017/pw/bgrd/backgroundfile-107582.pdf). Figures above. Moneris point-of-sale value grew 4.45% in the pilot area vs 3.73% surrounding, 2.21% Danforth, 4.96% city-wide. 57% of drivers who don't bike and 51% of business respondents disagreed; 92% of cyclists and 74% of nearby residents agreed. | Diversion branches, parking supply, real opinion split for personas. | **Full report text checked.** Observational; installation. |
| B02 | Smith Lea, Verlinden, Savan, Arancibia, Farber, Vernich & Allen (2017/2019), [Bloor Annex/Korea Town study](https://ero.ontario.ca/public/public_uploads/2024-11/Bloor-Economic-Impact-Study-Full-Report-2019-09-03_4.pdf). 3,005 visitor and 525 merchant surveys; walking/cycling visitors visit most often. | Survey instrument; visit-frequency mechanism. | **Executive summary and Appendix B checked.** Vacancy reported as 6% here and 7% in B01; Danforth control got cycle tracks in 2020. |
| B03 | Arancibia et al. (2019), *JAPA* 85(4): 463–481 ([TCAT listing](https://tcat.ca/resources/bloor-street-economic-impact-studies/)). Peer-reviewed version of B02. | Cite once a human checks it. | Full text not checked. |
| B04 | Forkes & Smith Lea (2010), [CAP Year 2 report](https://www.tcat.ca/wp-content/uploads/2016/08/BikeLanes_Parking_Business_BloorWestVillageNewCover.pdf). 96 merchants, 510 visitors; non-drivers visit more and report spending more per month. | Merchant belief vs reality; neighbourhood heterogeneity. | **Full report text checked.** Perceptions only. |
| B05 | Clean Air Partnership (2009), [Annex study](https://www.pedbikeinfo.org/resources/resources_details.cfm?id=4391). 2008: 46% walk, 32% transit, 12% cycle, 10% drive; Annex merchants estimated modes broadly accurately. | Pre-pilot customer mode share for Annex shops. | Secondary summary and B04 comparison tables. |
| B06 | Volker & Handy (2021), [*Transport Reviews* 41(4)](https://doi.org/10.1080/01441647.2021.1912849). 23 studies. | Business-type heterogeneity. | Publisher abstract. |
| B07 | Liu & Shi (2020), [NITC report](https://doi.org/10.15760/trec.248). 14 US corridors: positive or no significant effect; food service gained most. | Include a zero retail case. | Abstract and university release; co-sponsored by PeopleForBikes. |
| B08 | Stantec (2011), [Vancouver study](https://council.vancouver.ca/20110728/documents/penv3-BusinessImpactStudyReportDowntownSeparatedBicycleLanes-StantecReport.pdf). | Negative retail case. | Secondary summaries only. |
| B09 | Teschke et al. (2012), [*AJPH* 102(12)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3519333). Toronto + Vancouver: cycle tracks OR 0.11 (95% CI 0.02–0.54) vs major streets with parked cars. | Safety branch with a wide range. | Relative odds, not a Bloor collision forecast. |
| B10 | Buehler & Dill (2016), [*Transport Reviews* 36(1)](https://ideas.repec.org/a/taf/transr/v36y2016i1p9-27.html). Separated facilities preferred; network evidence thin. | Cyclist preference and reroute branch. | Publisher abstract. |
| B11 | City staff report on Bill 212 (Nov 2024), via [CP24](https://www.cp24.com/politics/toronto-city-hall/2024/11/13/removing-bike-lanes-on-bloor-yonge-and-university-would-cost-at-least-48-million-city-staff/). Removal costs $48M or more; minimal travel-time gain; multi-season reconstruction Spadina–Avenue Rd. | Public ledger; construction-disruption ticks. | News coverage; primary report not retrieved; province disputed the cost. |

## Verified Toronto facts for the fixture

Checked 17 October 2026 against the City's open-data API. Full values are in [data/bloor_bike_lane_baseline.json](./data/bloor_bike_lane_baseline.json).

**Cycling network** ([dataset](https://open.toronto.ca/dataset/cycling-network/), refreshed 2026-09-14): Bloor St W cycle tracks are recorded as installed in 2016 (Avenue Rd → Shaw, upgraded 2018–2024). They were extended west in 2020–2024, past Runnymede to Resurrection Rd and beyond. Danforth Ave got cycle tracks in 2020 (Broadview → Dawes), so it **no longer works as the no-lane control** used in B01/B02.

**Intersection counts, 14 hours** ([dataset](https://open.toronto.ca/dataset/traffic-volumes-at-intersections-for-all-modes/), `tmc_most_recent_summary_data`):

| Intersection | Date | Vehicles | Bicycles | Pedestrians |
|---|---|---:|---:|---:|
| Bloor / Avenue Rd / Queen's Park | 2025-06-25 | 26,685 | 6,189 | 21,613 |
| Bloor / St George | 2025-06-25 | 16,654 | 6,885 | 15,696 |
| Bloor / Spadina | 2025-06-25 | 25,211 | 6,554 | 15,013 |
| Bloor / Bathurst | 2026-07-25 | 21,527 | 4,521 | 23,763 |
| Bloor / Manning | 2025-06-25 | 14,788 | 6,254 | 13,180 |
| Bloor / Ossington | 2025-06-25 | 21,550 | 5,609 | 13,062 |
| Bloor / Shaw | 2025-06-25 | 13,337 | 7,687 | 6,659 |
| *Comparison:* Danforth / Broadview | 2025-06-24 | 25,745 | 2,963 | 14,996 |

These are single-day counts for scene scale and context. They are not daily totals, customer counts, or causal effects of the lane.

**2021 neighbourhood profiles** ([workbook](https://open.toronto.ca/dataset/neighbourhood-profiles/), 158-model; columns CH, BT, BU):

| Measure | Annex (95) | University (79) | Palmerston–Little Italy (80) |
|---|---:|---:|---:|
| Median after-tax household income (2020) | $72,000 | $68,500 | $76,500 |
| Low-income prevalence, LIM-AT | 14.4% | 14.6% | 10.9% |
| Renter households / all (25% sample) | 9,655 / 16,325 | 1,980 / 3,240 | 3,620 / 6,180 |
| Commute by bicycle / all commuters | 615 / 7,175 (8.6%) | 140 / 1,460 (9.6%) | 545 / 3,395 (16.1%) |
| Commute by car, truck or van | 2,720 (37.9%) | 510 (34.9%) | 1,335 (39.3%) |

**Key teaching contrast:** about 35–39% of employed residents **commute to work** by car, but only about 10% of **visitors to Bloor shops** arrived by car (B01, B05). Residents' work commutes and shoppers' trips are different populations. The persona generator must not use census commute shares as customer mode shares.

**Not yet extracted:** Bike Share trip records ([dataset](https://open.toronto.ca/dataset/bike-share-toronto-ridership-data/); 2025 and 2026 files updated 2026-10-13). They could show trips starting or ending near Bloor stations. Business licences could place anonymized synthetic shops by type.

## Variables for the autoresearch loop

| Class | Examples | Source | Loop may vary? |
|---|---|---|---|
| Observed facts | Counts above, parking 303 → 167, census margins, 2016–17 before/after values | B01, open data | **Never** |
| Policy levers | Keep vs remove; parking spaces restored (0–136); loading zones; construction duration | Bill 212, B01, B11 | **Yes** (policy search) |
| Behavioural uncertainties | Reversal share of the +49% cycling gain; reroute vs mode switch vs no trip; driver visit gain from parking; visit-frequency loss for walking/cycling customers; retail response by shop type (−, 0, +) | B01, B02, B04, B06–B08, B10 | **Yes**, within cited ranges, after human approval |
| Persona priors | Merchant estimate of customers who drive; support/opposition by road-user group | B04, B05, B01 survey | Seeded from data; may change through in-sim evidence |

**Example first sweep:**

- Cycling reversal {0%, 25%, 50%}. 25% matches B01's estimated new-rider share, but that is an illustrative anchor only.
- Retail response {B08-style negative, zero, B02-style positive}.
- Parking restored {0, 136}.

Same seed and personas throughout. This is a proposed experiment, not a calibrated grid.

## Parameter and claim gate

1. **Observed inputs** come only from the baseline fixture. Census commute shares never become visitor mode shares.
2. **Reversal:** removal effects are explicit sensitivity cases with source IDs, including partial and zero reversal. Never present the 2016–17 installation deltas as a removal forecast.
3. **Retail:** always run negative, zero and positive cases. Business-type matters (B06). Never name a real business or claim a closure.
4. **Travel time:** B01 shows installation added 0:32 to 4:15 at peak after adjustments, and B11 expects minimal gains from removal. Driver time savings are an assumption-driven range. A construction-disruption period should appear before any steady state.
5. **Safety:** B09 supports relative risk by route type with a very wide interval. Show collisions as **not estimable** unless an exposure model and Bloor collision data are loaded; a relative-risk badge is allowed.
6. **Public budget:** removal cost is a **reported staff estimate** disputed by the province. Show it as a labelled input, not a computed result. Parking revenue changes come from B01 as context only.

## Survey instrument the agents can reuse

B02 Appendix B (p. 49 onward) publishes the merchant questionnaire. The demo can reuse it for shop-owner personas:

- Customers served per weekday and Saturday (bands: under 25 to 200+)
- How the respondent got to work, and ease of parking
- **Estimated share of customers arriving by bike, car, transit and foot** (bands)
- Perceived safety cycling on Bloor (5-point)
- Free comment on the bike lane

Visitor personas answer mode, visit frequency and monthly spend. Synthetic answers explain agent reasoning and generate the real survey design. They are **not** public opinion and must never be compared to B02 as if they were respondents.

## Papiers human–agent loop for this scenario

1. **Human reads and annotates:** a teammate saves B01 and B04 in the Papiers app and writes their own note. For example, they might note that installation gains may not reverse and that merchant beliefs varied by neighbourhood. That wording is a **suggestion**, not an existing note.
2. **Agent investigates:** CLI `search`/`read` retrieves the passage and the real note. The research agent proposes reversal, reroute and retail mechanisms with source IDs.
3. **Agent evaluates:** the skeptic weighs B01/B02/B07 against B08 and flags B02's own control-street caveat. It also flags the installation-vs-removal gap and the Danforth control's 2020 lanes.
4. **Agent proposes next step:** the reversal × retail × parking sweep above, then a keep-with-changes policy search.
5. **Human contributes:** a teammate accepts, edits or rejects one assumption with a reason, then the system creates a versioned rerun with before/after metrics.

The local JSON pack replays the paper evidence offline. It cannot be called a Papiers result or a human annotation.

## Search terms for curating the Papiers library

`papiers search "Bloor bike lane economic impact" --limit 20 --json`, `papiers search "bike lane parking business" --limit 20 --json`, `papiers search "cycle track injury risk" --limit 20 --json`, then `papiers read <id> --json`. Save B01, B02 (or B03), B04, B06 and B08 in the app first. See [papiers-setup.md](./papiers-setup.md).

## Team handoff for the selected demo

- **Meet:** align this pack with the Bloor scenario brief and PRD; curate B01/B04 in Papiers with a genuine human note.
- **James:** load the baseline fixture; implement reroute/mode-switch, parking-search and shop-visit transactions; keep collisions and city-wide traffic `not_estimable`.
- **Steven:** generate cyclist, driver, transit-rider, merchant (with B04 belief prior), shop worker, resident and BIA personas; reuse the B02 merchant survey items.
- **Aadit:** render bike lane vs restored curb lane and parking, cyclists rerouting to Harbord/Dupont, and shop inspection; add the reversal × retail sweep chart.
