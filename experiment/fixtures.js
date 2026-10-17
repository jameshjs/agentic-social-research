/* Synthetic people and assumptions for an offline experiment demonstration.
 * Toronto sources supply context and fare rules, not individual records. */
(function (root) {
  'use strict';
  const trip = (id, purpose, destination, distance_km, extra = {}) => ({ id, purpose, destination, distance_km, ...extra });
  const person = (id, name, role, data = {}) => ({
    id, name, role, home: `home_${id}`, weekly_income_cad: 650, disposable_cash_weekly_cad: 42,
    fare_category: 'adult', has_car: false, has_bike: false, max_walk_km: 3,
    cost_sensitivity: 1, time_sensitivity: 1, bike_safety_sensitivity: 1,
    purchase_chance: 1, mode_preference: {}, routine: [],
    persona_source: 'synthetic_fixture', ...data,
  });
  const world = (label) => ({
    label, coordinate_system: 'schematic',
    locations: [
      { id: 'local_shop', type: 'shop', label: 'Neighbourhood shop', x: 55, y: 50 },
      { id: 'plaza', type: 'shop', label: 'Alternate shopping area', x: 88, y: 40 },
      { id: 'workplace', type: 'workplace', label: 'Workplace', x: 76, y: 12 },
      { id: 'bus_stop', type: 'bus_stop', label: 'Transit stop', x: 30, y: 26 },
    ],
  });
  const fare = {
    id: 'ttc-fare-experiment-v1',
    question: 'What if the adult TTC fare rose by 50 cents, with Fair Pass unchanged?',
    geography: 'Toronto — synthetic Morningside/Highland Creek microdistrict',
    ticks: 4, policy_start: 2, evidence_tier: 'assumption_driven',
    population_source: 'synthetic_persona_fixture; not drawn from census joint records',
    intervention: [{ operator: 'change_cost', target: 'adult_transit_ride', delta_cad: .5, unit: 'CAD' }],
    policy_source_ids: ['ttc_fares'],
    environment: { adult_fare_cad: 3.30, fair_pass_fare_cad: 2.10, bike_lane_protected: true, unprotected_bike_penalty: 0,
      shop_hours: 9, reduced_shop_hours: 6, shop_receipt_floor_cad: 125 },
    routes: {
      bus: { id: 'ttc_bus', minutes: 25 }, walk: { id: 'walk', minutes: 46 },
      drive: { id: 'car', minutes: 19, cost_cad: 2.4 }, bike_bloor: { id: 'bike', minutes: 27 },
    },
    world: world('Schematic Toronto microdistrict for a fare experiment'),
    sources: [
      { id: 'ttc_fares', kind: 'observed', url: 'https://www.ttc.ca/en/Fares-and-passes', claim: 'Adult and Fair Pass single-fare rules' },
      { id: 'neighbourhood_profile', kind: 'observed_context', url: 'https://open.toronto.ca/dataset/neighbourhood-profiles/', claim: 'Separate 2021 income and commute margins only' },
    ],
    assumptions: [
      { id: 'synthetic_choice_rule', kind: 'synthetic', note: 'Profiles score bounded mode choices using costs, travel time, preferences and fixed random variation.' },
      { id: 'synthetic_weekly_budget', kind: 'synthetic', note: 'Disposable cash is a fixture, not a census estimate.' },
      { id: 'shop_hours_response', kind: 'synthetic', note: 'The shop sets next-period hours to 6 if sample receipts are below CAD 125; not a business closure model.' },
      { id: 'basket_value', kind: 'synthetic', note: 'Individual basket values are illustrative.' },
      { id: 'purchase_propensity', kind: 'synthetic', note: 'Purchase decision is a seeded fixture rule.' },
    ],
    personas: [
      person('nadia', 'Nadia', 'fair_pass_rider', { fare_category: 'fair_pass', weekly_income_cad: 390, disposable_cash_weekly_cad: 28, mode_preference: { bus: 5, walk: 1.2 }, routine: [trip('work', 'commute', 'workplace', 5), trip('groceries', 'errand', 'local_shop', 4.5, { shop: 'local', basket_cad: 12, time_window: 'late' })] }),
      person('yusuf', 'Yusuf', 'fair_pass_rider', { fare_category: 'fair_pass', weekly_income_cad: 420, disposable_cash_weekly_cad: 30, mode_preference: { bus: 4.7, walk: 2.1 }, routine: [trip('work', 'commute', 'workplace', 4.5), trip('groceries', 'errand', 'local_shop', 2.5, { shop: 'local', basket_cad: 14 })] }),
      person('maria', 'Maria', 'near_fair_pass_cutoff', { weekly_income_cad: 610, disposable_cash_weekly_cad: 36, cost_sensitivity: 1.22, mode_preference: { bus: 5.6, walk: 2.1 }, routine: [trip('work', 'commute', 'workplace', 5), trip('groceries', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 16, time_window: 'late', mode_preference: { bus: 2.8 } })] }),
      person('ravi', 'Ravi', 'near_fair_pass_cutoff', { weekly_income_cad: 660, disposable_cash_weekly_cad: 43, has_car: true, cost_sensitivity: 1.12, mode_preference: { bus: 5.3, drive: 3.5, walk: 1 }, routine: [trip('work', 'commute', 'workplace', 6), trip('groceries', 'errand', 'local_shop', 4, { shop: 'local', basket_cad: 18 })] }),
      person('hawa', 'Hawa', 'near_fair_pass_cutoff', { weekly_income_cad: 580, disposable_cash_weekly_cad: 33, cost_sensitivity: 1.45, mode_preference: { bus: 5.8, walk: 1.9 }, routine: [trip('work', 'commute', 'workplace', 5), trip('groceries', 'errand', 'local_shop', 4.4, { shop: 'local', basket_cad: 14, time_window: 'late' })] }),
      person('jun', 'Jun', 'transit_commuter', { weekly_income_cad: 1100, disposable_cash_weekly_cad: 82, cost_sensitivity: .72, mode_preference: { bus: 5, walk: 1.3 }, routine: [trip('work', 'commute', 'workplace', 6), trip('groceries', 'errand', 'local_shop', 2.2, { shop: 'local', basket_cad: 19 })] }),
      person('elena', 'Elena', 'car_owner', { weekly_income_cad: 1320, disposable_cash_weekly_cad: 95, has_car: true, cost_sensitivity: .68, mode_preference: { bus: 3.5, drive: 4.4, walk: 1.2 }, routine: [trip('work', 'commute', 'workplace', 7), trip('groceries', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 21 })] }),
      person('tom', 'Tom', 'car_owner', { weekly_income_cad: 1450, disposable_cash_weekly_cad: 101, has_car: true, cost_sensitivity: .7, mode_preference: { bus: 3.5, drive: 4.2, walk: 1 }, routine: [trip('work', 'commute', 'workplace', 7), trip('groceries', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 23 })] }),
    ],
  };
  const bike = {
    id: 'bloor-bike-removal-experiment-v1',
    question: 'What if protected Bloor Street West bike lanes between Shaw Street and Avenue Road were removed?',
    geography: 'Toronto — schematic Bloor West microdistrict',
    ticks: 4, policy_start: 2, evidence_tier: 'assumption_driven',
    population_source: 'synthetic_persona_fixture; no measured removal response distribution',
    intervention: [{ operator: 'set_lane_protection', target: 'bloor_west_cycle_track', value: false }],
    policy_source_ids: ['bloor_observed_context'],
    environment: { adult_fare_cad: 3.30, fair_pass_fare_cad: 2.10, bike_lane_protected: true, unprotected_bike_penalty: 2.1,
      shop_hours: 9, reduced_shop_hours: 6, shop_receipt_floor_cad: 45 },
    routes: {
      bike_bloor: { id: 'bloor_main', minutes: 17 }, bike_detour: { id: 'side_street', minutes: 27 },
      bus: { id: 'ttc_alternative', minutes: 24 }, walk: { id: 'walk', minutes: 44 },
      drive: { id: 'car', minutes: 21, cost_cad: 3 },
    },
    world: world('Schematic Bloor West microdistrict for a street experiment'),
    sources: [
      { id: 'bloor_observed_context', kind: 'observed_context', url: 'https://www.toronto.ca/wp-content/uploads/2026/03/96e8-2025-Toronto-Cycling-Year-in-Review-FINAL.pdf', claim: '2025 count west of Huron: 3,524 passages/day, not a removal effect' },
      { id: 'bloor_pilot', kind: 'historical_context', url: 'https://www.toronto.ca/wp-content/uploads/2017/10/8ef6-cycling-bloor-backgroundfile-107582.pdf', claim: 'Historical installation evaluation; cannot reverse its coefficient' },
    ],
    assumptions: [
      { id: 'synthetic_choice_rule', kind: 'synthetic', note: 'Bounded route and mode choices; no observed Toronto removal probability.' },
      { id: 'bike_route_response', kind: 'synthetic', note: 'Unprotected Bloor lowers utility in proportion to each synthetic cyclist’s safety sensitivity.' },
      { id: 'shop_hours_response', kind: 'synthetic', note: 'The sample shop sets next-period hours based on synthetic receipts; no closure forecast.' },
      { id: 'basket_value', kind: 'synthetic', note: 'Illustrative local basket amounts.' },
    ],
    personas: [
      person('leila', 'Leila', 'less_confident_cyclist', { has_bike: true, bike_safety_sensitivity: 1.8, mode_preference: { bike_bloor: 3.5, bike_detour: 1.4, bus: 2.4, walk: 1.2 }, routine: [trip('work', 'commute', 'workplace', 5), trip('shop', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 17, detour_destination: 'plaza' })] }),
      person('sam', 'Sam', 'less_confident_cyclist', { has_bike: true, bike_safety_sensitivity: 1.5, mode_preference: { bike_bloor: 3.3, bike_detour: 1.1, bus: 2.5 }, routine: [trip('work', 'commute', 'workplace', 5), trip('shop', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 15, detour_destination: 'plaza', time_window: 'late' })] }),
      person('priya', 'Priya', 'experienced_cyclist', { has_bike: true, bike_safety_sensitivity: .25, mode_preference: { bike_bloor: 4.2, bike_detour: 1.5, bus: 1.7 }, routine: [trip('work', 'commute', 'workplace', 6), trip('shop', 'errand', 'local_shop', 4.5, { shop: 'local', basket_cad: 20 })] }),
      person('theo', 'Theo', 'bike_courier', { has_bike: true, bike_safety_sensitivity: 1.15, time_sensitivity: 1.5, mode_preference: { bike_bloor: 4.5, bike_detour: 2.6, bus: 1.8 }, routine: [trip('delivery', 'commute', 'workplace', 5), trip('shop', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 11, detour_destination: 'plaza' })] }),
      person('kaya', 'Kaya', 'local_cycling_customer', { has_bike: true, bike_safety_sensitivity: 1.6, mode_preference: { bike_bloor: 3.7, bike_detour: .5, bus: 2.1 }, routine: [trip('work', 'commute', 'workplace', 5), trip('shop', 'errand', 'local_shop', 5, { shop: 'local', basket_cad: 18, detour_destination: 'plaza', time_window: 'late' })] }),
      person('marta', 'Marta', 'driver', { has_car: true, mode_preference: { drive: 5, bus: 2 }, routine: [trip('work', 'commute', 'workplace', 7), trip('shop', 'errand', 'local_shop', 6, { shop: 'local', basket_cad: 22 })] }),
      person('arun', 'Arun', 'transit_rider', { mode_preference: { bus: 5.4, walk: 1.2 }, routine: [trip('work', 'commute', 'workplace', 6), trip('shop', 'errand', 'local_shop', 4, { shop: 'local', basket_cad: 15 })] }),
      person('mei', 'Mei', 'pedestrian', { max_walk_km: 6, mode_preference: { walk: 5.1, bus: 1.3 }, routine: [trip('work', 'commute', 'workplace', 4), trip('shop', 'errand', 'local_shop', 2, { shop: 'local', basket_cad: 13 })] }),
    ],
  };
  const api = { fare, bike };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualExperimentFixtures = api;
})(typeof window !== 'undefined' ? window : null);
