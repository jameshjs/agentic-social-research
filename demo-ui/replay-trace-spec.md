# Demo replay trace — spec for the front-end

Status: proposal for the team. Matches the `ScenarioSpec` / `PersonaSpec` / `WorldEvent` / `RunResult` contracts in PRD §11, flattened into one file the city and the dashboard both read.

## Recommended hero case

**"What if the adult TTC fare rises by $0.50 next year, with Fair Pass unchanged?"** (PRD Study A)

Why it demos best:

| Goal | How this case shows it |
| --- | --- |
| Visible world | Fewer people at bus stops, more cars on the road, some people walking, a shop with fewer visits. All four building types and both vehicle types change. |
| Fiscal | TTC fare revenue rises per ride but falls on lost riders, so the net is a real trade-off, and the low/base/high elasticity variants flip how big it is. |
| Household | Fare burden as a share of income, per persona. |
| Business | Corner shop and café foot traffic and sales, driven by trips that did or did not happen. |
| Distribution | Fair Pass riders are protected, while near-poor riders just above the cutoff take the biggest hit. That is the "surprise card". |
| Evidence labels | Fare ($3.30) and Fair Pass ($2.10) are observed Toronto data. Elasticity is transferred from the UK/Holmgren literature. Shop spending is an assumption. Store closure is unsupported speculation. |
| Sponsor fit | Real Toronto data for School of Cities, household/business effects for the FinTech track, and an obvious place for a human note ("elasticity is too high for captive riders") and a rerun for Papiers. |

Runners-up:

- **Ontario minimum wage +10% (PRD Study B).** Strongest on business and household economics, but weaker visually (no vehicles change much) and every number is speculative. Keep it as the second "generality" prompt.
- **Fare-free buses.** Most dramatic visuals, but the fiscal story is one-sided and it is harder to ground in Toronto data. Good as the "unprepared prompt" that falls to the speculative tier.

## How to make it feel live without running the model

1. **Precompute** the whole run offline (or by hand) into `trace.json`: baseline and intervention from the same seed, plus `variants` (low/base/high elasticity) and a `v2` rerun after the human note.
2. **Replay the pipeline stages** with short staged delays: compile → stakeholders → world → simulate → compare. Each stage reveals content that already exists in the file (`stages[]`), so nothing is faked beyond timing.
3. **Stream events by tick.** The city plays `events` in `t` order; the dashboard recomputes metrics from the events played so far, so the charts grow as the city moves. Both read the same array, which makes "same data" true by construction.
4. **Split view or toggle**: `baseline` and `intervention` share `world`, `personas` and `seed`; only `events` and `metrics` differ.
5. **Rerun** = swap to `runs.v2`, animate the deltas, and show the changed assumption in the diff.

## File shape

```jsonc
{
  "study_id": "ttc-fare-050",
  "version": 1,
  "seed": 42,
  "evidence_tier": "assumption_driven",          // grounded | assumption_driven | speculative

  "scenario": {
    "question": "What if the adult TTC fare rises by $0.50 next year, with Fair Pass unchanged?",
    "geography": "Toronto — sample district",
    "horizon_ticks": 4,                          // 1 tick = 1 simulated week
    "intervention": [{ "operator": "change_cost", "target": "adult_transit_ride", "delta": 0.5, "unit": "CAD" }],
    "protected_groups": ["fair_pass"],
    "mechanisms": [
      { "id": "m1", "from": "fare", "to": "mode_choice", "parameter_id": "p_elasticity" },
      { "id": "m2", "from": "mode_choice", "to": "shop_visits", "parameter_id": "p_trip_spend" }
    ],
    "missing_info": ["Ridership elasticity specific to Toronto", "Share of riders just above Fair Pass cutoff"]
  },

  "stages": [                                    // replayed with delays to feel live
    { "id": "compile",   "label": "Reading the hypothesis",       "ms": 1200 },
    { "id": "personas",  "label": "Choosing who is affected",     "ms": 1500 },
    { "id": "world",     "label": "Building the district",        "ms": 1000 },
    { "id": "simulate",  "label": "Running baseline and policy",  "ms": 0 },   // 0 = driven by event playback
    { "id": "compare",   "label": "Comparing outcomes",           "ms": 800 }
  ],

  "sources": [                                   // every number in the UI points at one of these
    { "id": "s_fare",   "kind": "observed",    "label": "TTC adult PRESTO fare $3.30", "url": "https://www.ttc.ca/en/Fares-and-passes" },
    { "id": "s_fair",   "kind": "observed",    "label": "Fair Pass PRESTO fare $2.10", "url": "https://www.ttc.ca/en/Fares-and-passes" },
    { "id": "s_elast",  "kind": "transferred", "label": "Bus fare elasticity -0.4 (UK review)", "url": "https://www.gov.uk/government/publications/bus-elasticities-and-diversion-factors" }
  ],
  "assumptions": [
    { "id": "p_elasticity", "label": "Fare elasticity", "value": -0.4, "low": -0.2, "high": -0.6, "kind": "transferred", "source_ids": ["s_elast"], "status": "accepted" },
    { "id": "p_trip_spend", "label": "Spend per shop visit", "value": 12, "unit": "CAD", "kind": "ai_assumption", "status": "proposed" }
  ],

  "world": {
    "locations": [
      { "id": "home_1", "type": "home",      "x": 2,  "y": 3, "label": "Apartment block" },
      { "id": "shop_1", "type": "shop",      "x": 8,  "y": 4, "label": "Corner grocery" },
      { "id": "work_1", "type": "workplace", "x": 14, "y": 2, "label": "Office tower" },
      { "id": "stop_1", "type": "bus_stop",  "x": 5,  "y": 4 }
    ],
    "routes": [{ "id": "bus_29", "type": "bus", "stops": ["stop_1", "stop_2"], "path": [[5,4],[10,4],[14,3]] }]
  },

  "personas": [
    {
      "id": "p_maria", "name": "Maria", "role": "low_income_rider", "home": "home_1", "work": "work_1",
      "traits": { "income_weekly": 620, "fare_category": "adult", "has_car": false },
      "deep_agent": true,                          // LLM-reasoned vs rule-based
      "why_included": "Earns just above the Fair Pass cutoff, so the full increase hits her.",
      "source_ids": ["s_fair"], "assumption_ids": ["p_elasticity"]
    },
    { "id": "shop_owner_1", "name": "Dev", "role": "local_retailer", "home": "home_2", "work": "shop_1",
      "deep_agent": true, "why_included": "Customers arrive by bus; foot traffic depends on transit trips." }
  ],

  "runs": {
    "baseline":     { "events": [ /* WorldEvent[] */ ], "metrics": { /* see below */ } },
    "intervention": { "events": [ /* WorldEvent[] */ ], "metrics": { } }
  },

  "variants": {                                  // precomputed sensitivity reruns, same shape as runs
    "elasticity_low":  { "baseline_ref": "baseline", "intervention": { "events": [], "metrics": {} } },
    "elasticity_high": { "baseline_ref": "baseline", "intervention": { "events": [], "metrics": {} } }
  },

  "revisions": [                                 // the human-guided rerun
    {
      "version": 2,
      "human_note": "Captive riders without cars barely respond to fare; use -0.2 for them.",
      "changed_assumptions": [{ "id": "p_elasticity", "from": -0.4, "to": -0.2, "applies_to": "has_car=false" }],
      "runs": { "intervention": { "events": [], "metrics": {} } }
    }
  ],

  "findings": [                                  // dashboard cards; each one is labelled and traceable
    {
      "id": "f1", "kind": "simulated",             // observed | assumption | simulated | speculation
      "text": "In this simulated world, riders just above the Fair Pass cutoff cut 2 of 10 weekly trips.",
      "metric": "trips_per_week", "group": "near_poor",
      "event_ids": ["e_031", "e_044"], "assumption_ids": ["p_elasticity"]
    },
    { "id": "f2", "kind": "speculation", "text": "Sustained sales loss could threaten the corner grocery. The model does not test closures." }
  ],

  "next_evidence": ["Toronto fare elasticity by income band", "PRESTO tap counts near the district's stops"]
}
```

### `WorldEvent`

```jsonc
{
  "id": "e_031",
  "tick": 2,
  "t": 2.35,                                     // tick + fraction of the day, for smooth animation ordering
  "actor": "p_maria",
  "action": "choose_mode",
  "visual_cue": "walk",                          // walk | drive | ride_bus | enter_home | enter_shop | work | exchange | message | other
  "from": "home_1", "to": "work_1",
  "path": [[2,3],[6,3],[14,2]],                  // optional; else front-end routes between locations
  "duration": 0.15,                              // in tick units
  "state_delta": { "p_maria.trips_by_bus": -1, "p_maria.trips_walked": 1 },
  "reason": "The new $3.80 fare is 6% of Maria's daily take-home; she walks the 2 km on dry days.",
  "rule_id": "mode_choice_v1",
  "caused_by": ["e_000_policy"],                 // links events into the causal chain the dashboard draws
  "assumption_ids": ["p_elasticity"],
  "evidence": "simulated"
}
```

The policy itself is the first event in the intervention run (`"action": "policy_change", "actor": "city"`, `"visual_cue": "other"`) so the city can show a banner at the exact moment it applies.

### `metrics`

Per tick, per group, so the dashboard can draw lines and slice by group without recomputing:

```jsonc
{
  "by_tick": [
    { "tick": 1, "bus_trips": 410, "car_trips": 220, "walk_trips": 95, "missed_trips": 12,
      "fare_revenue": 1353.0, "shop_sales": 4820, "avg_fare_burden_pct": 4.1 }
  ],
  "by_group": {
    "fair_pass":   { "fare_burden_pct": 3.2, "trips_per_week": 9.8 },
    "near_poor":   { "fare_burden_pct": 6.1, "trips_per_week": 8.0 },
    "car_owner":   { "fare_burden_pct": 0.9, "trips_per_week": 11.2 }
  },
  "totals": { "fare_revenue": 5410.0, "shop_sales": 19100, "car_km": 3120 }
}
```

The dashboard shows `intervention − baseline` for every field, with the low/high variants as an uncertainty band.

## Front-end playback rule

```
clock advances at speed × tick/sec
  for each event with event.t <= clock not yet played:
    city.animate(event.visual_cue, event.actor, event.from → event.to, event.duration)
    dashboard.apply(event.state_delta)       // running totals
    if event.id is in a finding's event_ids → pulse that card
```

Clicking a person shows their persona, `why_included`, and their events in order; clicking a finding highlights its `event_ids` in the city.
