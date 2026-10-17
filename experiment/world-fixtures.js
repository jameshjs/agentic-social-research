/* One synthetic population and two policy specs for the mapped Bathurst–Spadina
 * section (data/world/bloor_spadina_bathurst.json). Both prepared questions use
 * the same people, homes, shops, routines and seed; only the policy lever differs.
 *
 * Observed: streets, crosswalks, signals' locations, Line 2 schedule, buildings,
 * business presence (see the world fixture's source ledger) and citywide TTC
 * fare rules. Synthetic: every person, home assignment, routine, preference,
 * budget, basket, off-map minute and shop staffing threshold below. */
(function (root) {
  'use strict';

  // Leg builders. Node references are resolved by the runner against the
  // sandbox graph: `door:<business_id>`, `lane:<eb|wb>:<intersection>` (the
  // cycle track for bikes when it exists, otherwise the car lane), or a node id.
  const walk = (to) => ({ mode: 'walk', to });
  const bike = (to) => ({ mode: 'bike', to });
  const car = (to) => ({ mode: 'car', to });
  const ride = (edge) => ({ mode: 'transit', ride: edge });
  const option = (action, mode, legs, extra = {}) => ({ action, mode, legs, offmap_minutes: 0, cost_cad: 0, ...extra });

  const SHOPS = [
    { business_id: 'osm_w22199522', label: 'Metro', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 50 },
    { business_id: 'osm_n310146977', label: 'Bulk Barn', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 26 },
    { business_id: 'osm_n252334755', label: 'Curbside Cycle', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 45 },
    { business_id: 'osm_n336141537', label: 'Dollarama', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 22 },
    { business_id: 'osm_n336141536', label: 'BMV Books', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 20 },
    { business_id: 'osm_n303251890', label: 'Nadege', closes_at: '21:00', reduced_closes_at: '18:00', receipt_floor_cad: 6 },
  ];

  // Off-map anchors. The mapped section is 619 m; any trip continuing beyond
  // it adds an assumed, policy-invariant number of minutes for each mode.
  const DOWNTOWN = 'Downtown / U of T (off-map)';
  const WEST = 'West along Bloor–Danforth (off-map)';

  const person = (id, name, role, data) => ({
    id, name, role, fare_category: 'adult', has_bike: false, has_car: false,
    daily_budget_cad: 40, cost_sensitivity: 1, time_sensitivity: 1, bike_safety_sensitivity: 1,
    mode_preference: {}, persona_source: 'synthetic_fixture', ...data,
  });
  const home = (node, building_id, street) => ({ kind: 'mapped', node, building_id, street });
  const offmapHome = (label) => ({ kind: 'offmap', label });

  // Commutes for residents west of Brunswick ride Line 2 eastbound through the
  // section; residents east of it ride westbound. This keeps every paid ride on a
  // mapped Line 2 edge, where the sandbox enforces departures and charges a fare.
  const downtownCommute = (start, i, extras = {}) => ({
    transit: option('transit', 'transit', [walk('stn_bathurst'), ride('line2_eb')], { offmap_minutes: 16, offmap_label: DOWNTOWN }),
    bike_bloor: option('bike_bloor', 'bike', [bike('portal_south_7')], { offmap_minutes: 10, offmap_label: DOWNTOWN, route: 'bloor_cycle_route' }),
    bike_side_street: option('bike_side_street', 'bike', [bike(`portal_south_${i}`)], { offmap_minutes: 15, offmap_label: DOWNTOWN, route: 'side_street_detour' }),
    drive: option('drive', 'car', [car('portal_south_7')], { offmap_minutes: 13, offmap_label: DOWNTOWN, cost_cad: 11 }),
    ...extras,
  });
  const westCommute = (extras = {}) => ({
    transit: option('transit', 'transit', [walk('stn_spadina'), ride('line2_wb')], { offmap_minutes: 15, offmap_label: WEST }),
    bike_bloor: option('bike_bloor', 'bike', [bike('lane:wb:0')], { offmap_minutes: 13, offmap_label: WEST, route: 'bloor_cycle_route' }),
    drive: option('drive', 'car', [car('lane:wb:0')], { offmap_minutes: 14, offmap_label: WEST, cost_cad: 6 }),
    ...extras,
  });
  const pick = (all, keys) => keys.map((k) => all[k]);
  const commute = (depart, options) => ({ id: 'commute', purpose: 'commute', depart, options });
  const errand = (depart, shop, basket_cad, options) => ({ id: 'errand', purpose: 'errand', depart, shop, basket_cad, options });
  const elsewhere = (minutes = 10, preference_label = 'A shop near home, outside the mapped section') => option('shop_elsewhere', 'none', [], { offmap_minutes: minutes, offmap_label: preference_label, destination_offmap: true });

  const population = {
    id: 'bloor-section-population-v1',
    source: 'synthetic_persona_fixture',
    representative: false,
    note: 'Nineteen synthetic people: twelve with homes on mapped side streets and seven visitors who enter the section to shop. Home buildings are chosen from City 3D Massing footprints for display only; no real household is represented.',
    personas: [
      person('nadia', 'Nadia', 'fair_pass_commuter', { fare_category: 'fair_pass', daily_budget_cad: 18, cost_sensitivity: 1.6,
        home: home('portal_south_1', 'b138342', 'Lippincott St'), mode_preference: { transit: 5, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('07:50', pick(downtownCommute('portal_south_1', 1), ['transit'])),
          errand('18:40', 'osm_n310146977', 14, [option('walk', 'walk', [walk('door:osm_n310146977')]), elsewhere(14)])] }),
      person('yusuf', 'Yusuf', 'fair_pass_commuter', { fare_category: 'fair_pass', daily_budget_cad: 20, cost_sensitivity: 1.5,
        home: home('portal_south_5', 'b138068', 'Major St'), mode_preference: { transit: 5, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('08:10', pick(westCommute(), ['transit'])),
          errand('12:30', 'osm_w22199522', 18, [option('walk', 'walk', [walk('door:osm_w22199522')]), elsewhere(16)])] }),
      person('maria', 'Maria', 'adult_near_fair_pass_cutoff', { has_bike: true, daily_budget_cad: 26, cost_sensitivity: 1.6, bike_safety_sensitivity: 1.2,
        home: home('portal_south_6', 'b138429', 'Robert St'), mode_preference: { transit: 4.6, bike_bloor: 1.4, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('07:45', pick(westCommute(), ['transit', 'bike_bloor'])),
          errand('18:30', 'osm_w22199522', 22, [option('walk', 'walk', [walk('door:osm_w22199522')]), elsewhere(15)])] }),
      person('ravi', 'Ravi', 'adult_car_owner', { has_car: true, daily_budget_cad: 45, cost_sensitivity: 1.3,
        home: home('portal_north_1', 'b360066', 'Albany Ave'), mode_preference: { transit: 4.8, drive: 5.6, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('08:00', pick(downtownCommute('portal_north_1', 1, { drive: option('drive', 'car', [car('portal_south_7')], { offmap_minutes: 13, offmap_label: DOWNTOWN, cost_cad: 6 }) }), ['transit', 'drive'])),
          errand('18:45', 'osm_n336141537', 12, [option('walk', 'walk', [walk('door:osm_n336141537')]), elsewhere(9)])] }),
      person('hawa', 'Hawa', 'adult_near_fair_pass_cutoff', { has_bike: true, daily_budget_cad: 24, cost_sensitivity: 1.7, bike_safety_sensitivity: 1.4,
        home: home('portal_north_2', 'b360083', 'Howland Ave'), mode_preference: { transit: 4.7, bike_bloor: 1.3, bike_side_street: .8, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('07:40', pick(downtownCommute('portal_north_2', 2), ['transit', 'bike_bloor', 'bike_side_street'])),
          errand('18:50', 'osm_n310146977', 16, [option('walk', 'walk', [walk('door:osm_n310146977')]), elsewhere(14)])] }),
      person('jun', 'Jun', 'adult_transit_commuter', { daily_budget_cad: 70, cost_sensitivity: .6,
        home: home('portal_south_3', 'b138262', 'Brunswick Ave'), mode_preference: { transit: 5, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('08:20', pick(westCommute(), ['transit'])),
          errand('13:10', 'osm_n336141536', 15, [option('walk', 'walk', [walk('door:osm_n336141536')]), elsewhere(12)])] }),
      person('elena', 'Elena', 'driver', { has_car: true, daily_budget_cad: 80, cost_sensitivity: .7,
        home: home('portal_north_6', 'b359936', 'Walmer Rd'), mode_preference: { drive: 4.6, transit: 3.3 },
        routine: [commute('08:15', pick(westCommute(), ['drive', 'transit']))] }),
      person('leila', 'Leila', 'less_confident_cyclist', { has_bike: true, daily_budget_cad: 35, bike_safety_sensitivity: 1.8,
        home: home('portal_north_2', 'b357617', 'Howland Ave'), mode_preference: { bike_bloor: 4.6, bike_side_street: 3.1, transit: 2.9, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('08:00', pick(downtownCommute('portal_north_2', 2), ['bike_bloor', 'bike_side_street', 'transit'])),
          errand('18:20', 'osm_n252334755', 30, [option('walk', 'walk', [walk('door:osm_n252334755')]), elsewhere(18)])] }),
      person('priya', 'Priya', 'confident_cyclist', { has_bike: true, daily_budget_cad: 40, bike_safety_sensitivity: .3,
        home: home('portal_north_1', 'b357606', 'Albany Ave'), mode_preference: { bike_bloor: 4.8, bike_side_street: 2.6, transit: 2.2, walk: 2.5, shop_elsewhere: .5 },
        routine: [commute('08:30', pick(downtownCommute('portal_north_1', 1), ['bike_bloor', 'bike_side_street', 'transit'])),
          errand('12:00', 'osm_n303251890', 9, [option('walk', 'walk', [walk('door:osm_n303251890')]), elsewhere(8)])] }),
      person('sam', 'Sam', 'less_confident_cyclist', { has_bike: true, daily_budget_cad: 32, bike_safety_sensitivity: 1.9,
        home: home('portal_north_3', 'b357594', 'Brunswick Ave'), mode_preference: { bike_bloor: 4.4, bike_side_street: 1.4, transit: 4.3 },
        routine: [commute('07:55', pick(westCommute({
          bike_side_street: option('bike_side_street', 'bike', [bike('portal_south_3')], { offmap_minutes: 17, offmap_label: WEST, route: 'side_street_detour' }),
        }), ['bike_bloor', 'bike_side_street', 'transit']))] }),
      person('theo', 'Theo', 'bike_courier', { has_bike: true, daily_budget_cad: 30, bike_safety_sensitivity: .6, time_sensitivity: 1.6,
        home: home('portal_south_2', 'b138290', 'Borden St'), mode_preference: { bike_bloor: 4.7, bike_side_street: 3.2, transit: 1.4 },
        routine: [commute('07:30', [
          option('bike_bloor', 'bike', [bike('portal_south_7')], { offmap_minutes: 9, offmap_label: DOWNTOWN, route: 'bloor_cycle_route' }),
          option('bike_side_street', 'bike', [], { offmap_minutes: 12, offmap_label: `${DOWNTOWN} via Harbord St`, route: 'side_street_detour' }),
        ])] }),
      person('mei', 'Mei', 'pedestrian', { daily_budget_cad: 30, mode_preference: { walk: 5 },
        home: home('portal_north_4', 'b357919', 'Dalton Rd'), routine: [
          commute('08:40', [option('walk', 'walk', [walk('portal_south_7')], { offmap_minutes: 20, offmap_label: DOWNTOWN })]),
          errand('18:10', 'osm_n336141536', 14, [option('walk', 'walk', [walk('door:osm_n336141536')]), elsewhere(15)])] }),

      // Visitors: their homes are outside the section. They enter at a mapped
      // station, the Bloor lane at Bathurst, or a side-street portal.
      person('omar', 'Omar', 'visitor_transit_shopper', { daily_budget_cad: 60, cost_sensitivity: 1, home: offmapHome('West of Bathurst, near Line 2'),
        mode_preference: { transit: 4.4, shop_elsewhere: 1.6 },
        routine: [errand('13:00', 'osm_w22199522', 34, [option('transit', 'transit', [ride('line2_eb'), walk('door:osm_w22199522')], { start: 'stn_bathurst', offmap_minutes: 12 }), elsewhere(9)])] }),
      person('grace', 'Grace', 'visitor_adult_near_cutoff', { daily_budget_cad: 22, cost_sensitivity: 2.2, home: offmapHome('East of Spadina, near Line 2'),
        mode_preference: { transit: 6.0, shop_elsewhere: 1.7 },
        routine: [errand('17:40', 'osm_n336141537', 15, [option('transit', 'transit', [ride('line2_wb'), walk('door:osm_n336141537')], { start: 'stn_spadina', offmap_minutes: 10 }), elsewhere(8)])] }),
      person('lena', 'Lena', 'visitor_fair_pass_shopper', { fare_category: 'fair_pass', daily_budget_cad: 16, cost_sensitivity: 1.5, home: offmapHome('East of Spadina, near Line 2'),
        mode_preference: { transit: 3.8, shop_elsewhere: 1.4 },
        routine: [errand('11:30', 'osm_n310146977', 13, [option('transit', 'transit', [ride('line2_wb'), walk('door:osm_n310146977')], { start: 'stn_spadina', offmap_minutes: 11 }), elsewhere(9)])] }),
      person('arun', 'Arun', 'visitor_student', { daily_budget_cad: 25, cost_sensitivity: 1.35, home: offmapHome('West of Bathurst, near Line 2'),
        mode_preference: { transit: 4.4, shop_elsewhere: 1.4 },
        routine: [errand('18:15', 'osm_n336141536', 12, [option('transit', 'transit', [ride('line2_eb'), walk('door:osm_n336141536')], { start: 'stn_bathurst', offmap_minutes: 12 }), elsewhere(10)])] }),
      person('kaya', 'Kaya', 'visitor_less_confident_cyclist', { has_bike: true, daily_budget_cad: 40, bike_safety_sensitivity: 2.0, home: offmapHome('Koreatown, west of Bathurst'),
        mode_preference: { bike_bloor: 4.0, bike_side_street: 2.0, shop_elsewhere: 2.4 },
        routine: [errand('18:05', 'osm_n252334755', 26, [
          option('bike_bloor', 'bike', [bike('portal_north_2'), walk('door:osm_n252334755')], { start: 'lane:eb:0', offmap_minutes: 6, route: 'bloor_cycle_route' }),
          option('bike_side_street', 'bike', [bike('portal_north_2'), walk('door:osm_n252334755')], { start: 'portal_south_2', offmap_minutes: 10, route: 'side_street_detour' }),
          elsewhere(9, 'A bike shop outside the mapped section')])] }),
      person('ben', 'Ben', 'visitor_confident_cyclist', { has_bike: true, daily_budget_cad: 45, bike_safety_sensitivity: .4, home: offmapHome('Christie Pits, west of Bathurst'),
        mode_preference: { bike_bloor: 4.3, bike_side_street: 2.2, shop_elsewhere: 1.4 },
        routine: [errand('12:40', 'osm_n310146977', 20, [
          option('bike_bloor', 'bike', [bike('portal_south_2'), walk('door:osm_n310146977')], { start: 'lane:eb:0', offmap_minutes: 5, route: 'bloor_cycle_route' }),
          option('bike_side_street', 'bike', [walk('door:osm_n310146977')], { start: 'portal_south_2', offmap_minutes: 9, route: 'side_street_detour' }),
          elsewhere(8)])] }),
      person('marta', 'Marta', 'visitor_driver', { has_car: true, daily_budget_cad: 70, cost_sensitivity: .8, home: offmapHome('South along Bathurst St'),
        mode_preference: { drive: 4.2, shop_elsewhere: 2.0 },
        routine: [errand('16:30', 'osm_w22199522', 46, [
          option('drive', 'car', [car('portal_south_6'), walk('door:osm_w22199522')], { start: 'portal_south_0', offmap_minutes: 8, cost_cad: 4 }),
          elsewhere(10)])] }),
    ],
  };

  const sources = [
    { id: 'bloor_world', kind: 'observed', url: '../world/README.md', claim: 'Streets, crosswalks, signal locations, Line 2 schedule, building footprints and business presence for Bloor St W, Bathurst–Spadina' },
    { id: 'ttc_fares', kind: 'observed', url: 'https://www.ttc.ca/en/Fares-and-passes', claim: 'Adult PRESTO fare CAD 3.30; Fair Pass CAD 2.10 (citywide rule)' },
    { id: 'osm', kind: 'observed', url: 'https://www.openstreetmap.org/copyright', claim: 'Business presence and names; no sales, staffing or hours' },
    { id: 'bloor_observed_context', kind: 'observed_context', url: 'https://www.toronto.ca/wp-content/uploads/2026/03/96e8-2025-Toronto-Cycling-Year-in-Review-FINAL.pdf', claim: '2025 Bloor counter west of Huron: 3,524 passages/day; context, not a removal effect' },
  ];

  const assumptions = [
    { id: 'synthetic_population', kind: 'synthetic', note: 'People, home assignments, routines, budgets and preferences are invented test inputs, shared by both policies.' },
    { id: 'synthetic_choice_rule', kind: 'synthetic', note: 'Choice score = preference − CAD cost × cost sensitivity × cost weight − total minutes / 30 × time sensitivity − shared-with-cars km × safety sensitivity × discomfort, plus fixed seeded variation of width 0.8.' },
    { id: 'offmap_minutes', kind: 'synthetic', note: 'Minutes beyond the 619 m section are fixed per option and do not change with either policy.' },
    { id: 'mode_costs', kind: 'synthetic', note: 'Parking and driving costs per trip are illustrative.' },
    { id: 'basket_value', kind: 'synthetic', note: 'Purchase amounts are illustrative; OSM supplies presence only.' },
    { id: 'shop_hours_response', kind: 'synthetic', note: 'A focal shop closes at 18:00 the next period if this sample’s receipts fall below its stated floor; this is not a closure or sales model.' },
    { id: 'cost_weight', kind: 'sensitivity', value: .5, low: .3, high: .8, unit: 'choice score per CAD', note: 'Converts a dollar of fare or parking into choice score before personal cost sensitivity.' },
    { id: 'unprotected_cycling_discomfort_per_km', kind: 'sensitivity', value: 4, low: 1.5, high: 6, unit: 'utility per km shared with cars', note: 'How much riding in a car lane lowers a cyclist’s choice score, before personal safety sensitivity. No observed Toronto removal response.' },
    { id: 'shop_staffing_response', kind: 'sensitivity', value: true, low: false, high: true, unit: 'on/off', note: 'Off gives the zero-retail-response case: shops keep their hours whatever the receipts.' },
  ];

  const base = {
    ticks: 4, policy_start: 2, period_unit: 'modelled weekday', evidence_tier: 'assumption_driven',
    geography: 'Toronto — Bloor St W, Bathurst St to Spadina Ave (mapped 619 m section)',
    world_id: 'bloor-spadina-bathurst',
    environment: { adult_fare_cad: 3.30, fair_pass_fare_cad: 2.10 },
    population, shops: SHOPS, sources, assumptions,
  };

  const fareSpec = {
    ...base,
    id: 'bloor-section-fare-050',
    scenario_id: 'fare',
    question: 'What if the adult TTC fare rose by 50 cents, with Fair Pass unchanged?',
    intervention: [{ operator: 'change_cost', target: 'adult_transit_ride', delta_cad: .5, unit: 'CAD', lever: 'adult_fare_cad' }],
    policy_source_ids: ['ttc_fares'],
  };
  const bikeSpec = {
    ...base,
    id: 'bloor-section-track-removal',
    scenario_id: 'bike',
    question: 'What if the protected Bloor cycle track between Bathurst and Spadina were removed?',
    intervention: [{ operator: 'set_lever', target: 'bloor_cycle_track', value: 'none', lever: 'bloor_cycle_track' }],
    policy_source_ids: ['bloor_world', 'bloor_observed_context'],
  };

  // Spec constants are named *Spec because `bike` is also the leg builder above.
  const api = { fare: fareSpec, bike: bikeSpec, population, shops: SHOPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualWorldFixtures = api;
})(typeof window !== 'undefined' ? window : null);
