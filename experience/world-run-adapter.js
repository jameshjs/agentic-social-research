/* Maps one experiment.v2 RunResult (mapped Bathurst–Spadina world) onto an
 * /experience/ scenario template. Works for both prepared policies and for any
 * compiled set_lever / change_cost spec; every chart series is read from
 * result.runs[arm].metrics.by_tick and nothing else. Copy that names a value
 * (fares, changed people, travel counts) is read from the same run. */
(function (root) {
  'use strict';

  const SECTORS = ['mobility', 'access', 'commerce', 'households', 'public'];
  const ARMS = ['baseline', 'intervention'];
  const CAVEAT = 'Synthetic people and assumption-driven responses on the mapped Bathurst–Spadina section; not a Toronto forecast.';
  const BREADCRUMB = 'BLOOR WEST · BATHURST–SPADINA';
  const VIEWPORT = 'BATHURST–SPADINA SECTION';
  const MAP_TAGS = { fare: 'TTC FARE / BATHURST–SPADINA', bike: 'BLOOR TRACK / BATHURST–SPADINA', compiled: 'COMPILED LEVER / BATHURST–SPADINA' };
  const SOURCE_LABELS = {
    bloor_world: 'Mapped Bathurst–Spadina world and source ledger',
    ttc_fares: 'TTC fares and passes (citywide rule)',
    osm: 'OpenStreetMap business presence',
    bloor_observed_context: '2025 Toronto Cycling Year in Review (Bloor counter context)',
  };
  const NOT_ESTIMABLE_LABELS = {
    citywide_ttc_revenue_cad: 'city-wide TTC revenue', business_closures: 'business closures', injuries: 'injuries',
    emissions_kg: 'emissions', gdp_cad: 'GDP', driver_time_beyond_section: 'driver time beyond the section',
    removal_construction_cost_cad: 'removal construction cost',
  };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const currency = (v) => (isNum(v) ? `$${v.toFixed(2)}` : '—');
  const num = (v, unit = '') => (isNum(v) ? `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}` : '—');
  const tone = (policy, baseline, higherIsBetter) => (!isNum(policy) || !isNum(baseline) || policy === baseline ? 'neutral' : (policy > baseline) === higherIsBetter ? 'positive' : 'negative');
  const upper = (s) => String(s).replace(/_/g, ' ').toUpperCase();

  function assertRun(result) {
    if (!result || result.schema_version !== 'experiment.v2' || !result.scenario || !result.runs || !result.runs.baseline || !result.runs.intervention || !Array.isArray(result.changed_decisions)) {
      throw new TypeError('Expected an experiment.v2 RunResult');
    }
  }

  /* Plain-language list of the compiled levers, e.g. "line2_headway_multiplier = 2". */
  function leverText(result) {
    const changes = result.scenario.intervention || [];
    if (!changes.length) return 'no lever change';
    return changes.map((c) => {
      if (c.operator === 'change_cost') return `${c.lever || c.target} ${c.delta_cad < 0 ? '−' : '+'}${currency(Math.abs(c.delta_cad))}`;
      if (c.operator === 'set_lever') return `${c.lever} = ${c.value}`;
      return `${c.operator}${c.lever ? ` on ${c.lever}` : ''}`;
    }).join(', ');
  }

  const choiceLabel = (c, other) => (c.action !== other.action ? c.action : c.route !== other.route ? `${c.action} via ${c.route}` : `${c.action} to ${c.destination}`);

  /* Policy-tick decision changes for the UI ledger, ordered by tick then actor. */
  function changedSummary(result) {
    assertRun(result);
    const start = result.scenario.policy_start;
    const people = new Map((result.personas || []).map((p) => [p.id, p]));
    return result.changed_decisions
      .filter((c) => c.tick >= start)
      .map((c) => ({
        key: c.key, actor: c.actor, name: people.get(c.actor)?.name || c.actor, role: people.get(c.actor)?.role || null,
        tick: c.tick, trip_id: c.trip_id, from: choiceLabel(c.baseline, c.intervention), to: choiceLabel(c.intervention, c.baseline),
        baseline_event_id: c.baseline_event_id, intervention_event_id: c.intervention_event_id,
      }))
      .sort((a, b) => a.tick - b.tick || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0));
  }

  function toMappedScenario(result, template = {}) {
    assertRun(result);
    const kind = result.scenario_id === 'fare' || result.scenario_id === 'bike' ? result.scenario_id : 'compiled';
    const ticks = result.runs.baseline.metrics.by_tick.length;
    const start = result.scenario.policy_start;
    const P = `P${ticks}`;
    // Sum of one or more by_tick fields; a single field is passed through unchanged.
    const series = (arm, ids) => result.runs[arm].metrics.by_tick.map((p) => (ids.length === 1 ? p[ids[0]] : ids.reduce((s, id) => s + (p[id] ?? 0), 0)));
    const last = (arm, ids) => series(arm, ids).at(-1);
    const pairOf = (ids, fmt) => `${fmt(last('intervention', ids))} / ${fmt(last('baseline', ids))}`;
    const afterPolicyMean = (arm, ids) => {
      const values = series(arm, ids).filter((v, i) => i + 1 >= start && isNum(v));
      return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 100) / 100 : null;
    };
    const sector = (key, ids, copy) => ({
      ...((template.sectors || {})[key] || {}), ...copy, metric_ids: ids,
      baseline: series('baseline', ids), policy: series('intervention', ids),
    });
    const eventsOf = (arm, action) => result.runs[arm].events.filter((e) => e.action === action);

    const changes = changedSummary(result);
    const changed = result.changed_decisions.length;
    const decisions = result.runs.intervention.decisions.length;
    const policyDecisions = result.runs.intervention.decisions.filter((d) => d.tick >= start).length;
    const rejected = result.runs.baseline.game_master.rejected_actions + result.runs.intervention.game_master.rejected_actions;
    const travels = ARMS.reduce((s, arm) => s + eventsOf(arm, 'travel').length, 0);
    const pop = result.population;
    const tier = String(result.evidence_tier || 'speculative').replace(/_/g, '-');
    const levers = leverText(result);
    const notEstimable = (result.not_estimable || [])
      .filter((m) => !(kind === 'fare' && m.id === 'removal_construction_cost_cad'))   // a bike-layout item; irrelevant to a fare change
      .map((m) => NOT_ESTIMABLE_LABELS[m.id] || m.id.replace(/_/g, ' ')).join(', ');

    // Focus markers follow the first two people whose choice changed; otherwise generic labels.
    const actors = [...new Map(changes.map((c) => [c.actor, c])).values()];
    const focusDefaults = { fare: ['RIDER DECISION', 'LOCAL BUSINESS'], bike: ['CYCLIST REROUTES', 'SHOP & CURB'], compiled: ['PROPOSED CHANGE', 'EFFECT TO INVESTIGATE'] }[kind];
    const focus = [0, 1].map((i) => `0${i + 1} / ${actors[i] ? `${upper(actors[i].name)} · ${upper(actors[i].from)} → ${upper(actors[i].to)}` : focusDefaults[i]}`);

    const sourceIds = new Set(['bloor_world', 'osm', ...(eventsOf('intervention', 'policy_change')[0]?.source_ids || [])]);
    const sourceLinks = (result.sources || []).filter((s) => kind === 'compiled' || sourceIds.has(s.id)).map((s) => [SOURCE_LABELS[s.id] || s.id, s.url]);
    const observed = 'Streets, crosswalks, signal locations, the Line 2 schedule, building footprints and OSM business presence come from the mapped Bathurst–Spadina world; adult and Fair Pass fares are citywide TTC rules.';
    const synthetic = `All ${pop.count} people, their homes, routines, preferences, budgets and baskets, the off-map minutes and the shop staffing rule are synthetic.`;

    const common = {
      ...template, run: result,
      breadcrumb: BREADCRUMB, viewport: VIEWPORT, mapTag: template.mapTag || MAP_TAGS[kind],
      worldCaption: `Mapped Bathurst–Spadina section · ${pop.count} synthetic people replay ${travels} recorded travel events`,
      focus,
      narrative: `${pop.count} synthetic people (${pop.residents} with homes on mapped side streets, ${pop.visitors} visitors) make ${decisions} bounded choices per arm over ${ticks} modelled weekdays in the mapped Bathurst–Spadina section. Every move passed the world's rule checks (${rejected} rejected), and the city, ledger and charts read the same events. ${CAVEAT}`,
      sourceRibbon: `Seed ${result.seed} · v${result.version} · ${changed} changed decisions · synthetic responses · ${tier}`,
    };

    if (kind === 'fare') {
      const adultBefore = result.scenario.levers.baseline.adult_fare_cad, adultAfter = result.scenario.levers.intervention.adult_fare_cad;
      const fairPassFares = new Set(ARMS.flatMap((arm) => eventsOf(arm, 'pay_fare').filter((e) => e.fare_product === 'fair_pass').map((e) => e.amount_cad)));
      const fairPass = fairPassFares.size === 1 ? [...fairPassFares][0] : null;
      const fairPassText = fairPass === null ? 'Fair Pass riders are tracked separately' : `Fair Pass stays at ${currency(fairPass)}`;
      const adultVerb = adultAfter > adultBefore ? 'pay more' : adultAfter < adultBefore ? 'pay less' : 'pay the same';
      const accessIds = ['deferred_trips', 'errands_elsewhere'];
      return {
        ...common,
        title: result.scenario.question,
        summary: `The adult fare goes from ${currency(adultBefore)} to ${currency(adultAfter)} from period ${start}; ${fairPassText}. ${changed} of ${decisions} paired choices differ. ${CAVEAT}`,
        chain: [
          `Adult fare ${currency(adultBefore)} → ${currency(adultAfter)} from period ${start}; ${fairPassText}`,
          'Each person scores only the legal options the mapped world allows',
          'Rides, detours, deferrals and shop entries are recorded as events',
          'Fares, receipts and next-period shop hours are summed from those events',
        ],
        headline: { label: 'SAMPLE TTC RECEIPTS / PERIOD AFTER CHANGE', value: `${currency(afterPolicyMean('intervention', ['fare_revenue_cad']))} / ${currency(afterPolicyMean('baseline', ['fare_revenue_cad']))}`, direction: `policy / baseline · synthetic, ${tier}` },
        mini: [
          { label: `Sample Line 2 trips / ${P}`, value: pairOf(['transit_trips'], num), tone: tone(last('intervention', ['transit_trips']), last('baseline', ['transit_trips']), true) },
          { label: `Household fare spend / ${P}`, value: pairOf(['household_fare_spend_cad'], currency), tone: tone(last('intervention', ['household_fare_spend_cad']), last('baseline', ['household_fare_spend_cad']), false) },
          { label: `Focal shop receipts / ${P}`, value: pairOf(['shop_sales_cad'], currency), tone: tone(last('intervention', ['shop_sales_cad']), last('baseline', ['shop_sales_cad']), true) },
        ],
        evidence: {
          title: 'Fare response is a question, not a coefficient.',
          text: `${observed} ${synthetic} No Toronto fare elasticity or retail-sales coefficient is applied; mode changes come from a stated synthetic choice score. Not estimable from this run: ${notEstimable}.`,
          links: [...sourceLinks, ['Fare research and conflicting retail evidence', '../papers.md']],
        },
        sectors: {
          mobility: sector('mobility', ['transit_trips'], {
            title: 'Who keeps riding Line 2.', description: 'Completed sample trips that board Line 2 at Bathurst or Spadina. Each ride waited for a scheduled departure on the mapped platforms.',
            delta: `${pairOf(['transit_trips'], num)} LINE 2 TRIPS · ${P}`, chartTitle: `SAMPLE LINE 2 TRIPS / ${ticks} PERIODS`,
            unit: 'synthetic completed trips using Line 2 per modelled weekday', evidence: `Mode changes come from a stated synthetic score; no Toronto fare elasticity is applied. ${CAVEAT}` }),
          access: sector('access', accessIds, {
            title: 'Some trips do not happen here.', description: 'Trips deferred, plus errands taken to a shop outside the mapped section. Off-map shops are not modelled destinations.',
            delta: `${pairOf(accessIds, num)} DEFERRED OR ELSEWHERE · ${P}`, chartTitle: `SAMPLE TRIPS DEFERRED OR TAKEN ELSEWHERE / ${ticks} PERIODS`,
            unit: 'synthetic trips deferred or taken outside the section per modelled weekday (deferred_trips + errands_elsewhere)', evidence: `Shop hours follow a synthetic receipts floor; this is not an access forecast. ${CAVEAT}` }),
          commerce: sector('commerce', ['shop_sales_cad'], {
            title: 'The shop ledger follows purchases.', description: 'Receipts at six OSM-listed Bloor shops sum synthetic purchase events recorded at their doors. No sales, profit or survival estimate.',
            delta: `${pairOf(['shop_sales_cad'], currency)} · ${P}`, chartTitle: `SAMPLE FOCAL SHOP RECEIPTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic purchase events at focal shops', evidence: `OSM supplies business presence only; baskets and receipt floors are synthetic. ${CAVEAT}` }),
          households: sector('households', ['household_fare_spend_cad'], {
            title: `Adult riders ${adultVerb}; ${fairPassText}.`, description: 'Fares recorded for sample households. Adult and Fair Pass spending per period are split in run.metrics.by_group.',
            delta: `${pairOf(['household_fare_spend_cad'], currency)} · ${P}`, chartTitle: `SAMPLE HOUSEHOLD FARE SPENDING / ${ticks} PERIODS`,
            unit: 'CAD from synthetic fare-payment events (payer side)', evidence: `Fares are the citywide TTC rules; who rides is synthetic. ${CAVEAT}` }),
          public: sector('public', ['fare_revenue_cad'], {
            title: 'More per ride, counted ride by ride.', description: 'Sample TTC receipts sum fare payments made inside this section. City-wide revenue, ridership or budget effects are not estimable from this sample.',
            delta: `${pairOf(['fare_revenue_cad'], currency)} SAMPLE TTC · ${P}`, chartTitle: `SAMPLE TTC RECEIPTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic fare-payment events (recipient side)', evidence: `Equal to household fare spending by construction; no transfer is counted twice. ${CAVEAT}` }),
        },
      };
    }

    if (kind === 'bike') {
      const sameDriverTime = JSON.stringify(series('baseline', ['driver_mapped_minutes'])) === JSON.stringify(series('intervention', ['driver_mapped_minutes']));
      return {
        ...common,
        title: result.scenario.question,
        summary: `The protected cycle track is removed from period ${start} and cyclists share the car lanes. ${changed} of ${decisions} paired choices differ. ${CAVEAT}`,
        chain: [
          `Protected track removed from period ${start}; no car lane is added`,
          'Cyclists keep Bloor in a car lane, take a side street, switch mode or go elsewhere',
          'This period’s shop receipts set next period’s synthetic opening hours',
          'Exposure distance, receipts and driver minutes are summed from recorded events',
        ],
        headline: { label: `SAMPLE BLOOR CYCLING TRIPS / ${P}`, value: pairOf(['bloor_bike_trips'], num), direction: `policy / baseline · synthetic, ${tier}` },
        mini: [
          { label: `Cycling shared with cars / ${P}`, value: pairOf(['bloor_shared_cycling_m'], (v) => num(v, ' m')), tone: tone(last('intervention', ['bloor_shared_cycling_m']), last('baseline', ['bloor_shared_cycling_m']), false) },
          { label: `Focal shop receipts / ${P}`, value: pairOf(['shop_sales_cad'], currency), tone: tone(last('intervention', ['shop_sales_cad']), last('baseline', ['shop_sales_cad']), true) },
          { label: `Driver in-map minutes / ${P}`, value: pairOf(['driver_mapped_minutes'], num), tone: 'neutral' },
        ],
        evidence: {
          title: 'Removing a lane has no measured reverse effect.',
          text: `${observed} The 2025 Bloor counter gives context, not a removal effect, and installation-era studies are not inverted into removal coefficients. ${synthetic} Route changes come from an assumed discomfort per km shared with cars. Not estimable from this run: ${notEstimable}.`,
          links: [...sourceLinks, ['Bloor demo research and source caveats', '../bloor-bike-demo.md'], ['Bloor evidence pack and observed baseline', '../bike-lane-papers.md']],
        },
        sectors: {
          mobility: sector('mobility', ['bloor_bike_trips'], {
            title: 'Some cyclists leave Bloor.', description: 'Completed sample bike trips with a leg on a Bloor lane or the track. A side-street route keeps the trip but leaves Bloor.',
            delta: `${pairOf(['bloor_bike_trips'], num)} BLOOR BIKE TRIPS · ${P}`, chartTitle: `SAMPLE BLOOR CYCLING TRIPS / ${ticks} PERIODS`,
            unit: 'synthetic completed bike trips using Bloor per modelled weekday', evidence: `Route changes come from an assumed discomfort per km shared with cars; no observed removal response. ${CAVEAT}` }),
          access: sector('access', ['bloor_shared_cycling_m'], {
            title: 'Riding with cars: an exposure distance.', description: 'Metres sample cyclists ride in a Bloor car lane once the track is gone. This is exposure distance, not injuries or collisions; no injury model is attached.',
            delta: `${pairOf(['bloor_shared_cycling_m'], (v) => num(v, ' M'))} SHARED · ${P}`, chartTitle: `SAMPLE CYCLING DISTANCE SHARED WITH CARS / ${ticks} PERIODS`,
            unit: 'metres of sample cycling in car lanes (exposure distance, not injuries)', evidence: `Injuries are not estimable from this run. ${CAVEAT}` }),
          commerce: sector('commerce', ['shop_sales_cad'], {
            title: 'The shop ledger follows purchases.', description: 'Receipts at six OSM-listed Bloor shops sum synthetic purchase events recorded at their doors. No sales, closure or survival estimate.',
            delta: `${pairOf(['shop_sales_cad'], currency)} · ${P}`, chartTitle: `SAMPLE FOCAL SHOP RECEIPTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic purchase events at focal shops', evidence: `Installation-era merchant studies do not give a removal coefficient. ${CAVEAT}` }),
          households: sector('households', ['household_transport_spend_cad'], {
            title: 'Recorded travel payments.', description: 'Fares and stated travel costs paid by sample households. Time, comfort and safety are not priced in this ledger.',
            delta: `${pairOf(['household_transport_spend_cad'], currency)} · ${P}`, chartTitle: `SAMPLE HOUSEHOLD TRANSPORT PAYMENTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic fare and travel-cost events', evidence: `Parking and driving costs are illustrative. ${CAVEAT}` }),
          public: sector('public', ['driver_mapped_minutes'], {
            title: 'Zero driver-time gain case.',
            description: `Mean in-map minutes per sample car leg. This layout adds no car lane when the track goes${sameDriverTime ? ', and in this run driver minutes inside the section are identical in both arms' : '; in this run the driver series differ because different car trips were chosen'}. A period with no car leg reads 0.`,
            delta: `${pairOf(['driver_mapped_minutes'], (v) => num(v, ' MIN'))} · ZERO DRIVER-TIME GAIN CASE`, chartTitle: `SAMPLE DRIVER MINUTES IN SECTION / ${ticks} PERIODS`,
            unit: 'mean in-map minutes per synthetic car leg (0 when no car leg)', evidence: `The zero driver-time gain case is a modelling choice, not a forecast; driver time beyond the section is not estimable. ${CAVEAT}` }),
        },
      };
    }

    // Any other compiled spec: one generic mapping over the same metrics.
    const accessIds = ['deferred_trips', 'errands_elsewhere'];
    const leverNote = `Compiled levers: ${levers}.`;
    return {
      ...common,
      title: result.scenario.question || `What if ${levers}?`,
      summary: `Compiled levers (${levers}) apply from period ${start} on the mapped Bathurst–Spadina section. ${changed} of ${decisions} paired choices differ. ${CAVEAT}`,
      chain: [
        `Compiled lever${(result.scenario.intervention || []).length === 1 ? '' : 's'} ${levers} from period ${start}`,
        'Each person scores only the legal options the changed world allows',
        'Rides, detours, deferrals and shop entries are recorded as events',
        'Trips, payments and receipts are summed from those events',
      ],
      headline: { label: 'CHANGED SAMPLE DECISIONS AFTER THE CHANGE', value: `${changes.length} / ${policyDecisions}`, direction: `changed / paired choices · synthetic, ${tier}` },
      mini: [
        { label: `Sample Line 2 trips / ${P}`, value: pairOf(['transit_trips'], num), tone: tone(last('intervention', ['transit_trips']), last('baseline', ['transit_trips']), true) },
        { label: `Household transport payments / ${P}`, value: pairOf(['household_transport_spend_cad'], currency), tone: tone(last('intervention', ['household_transport_spend_cad']), last('baseline', ['household_transport_spend_cad']), false) },
        { label: `Focal shop receipts / ${P}`, value: pairOf(['shop_sales_cad'], currency), tone: tone(last('intervention', ['shop_sales_cad']), last('baseline', ['shop_sales_cad']), true) },
      ],
      evidence: {
        title: 'A compiled lever is a mechanism test, not a finding.',
        text: `${leverNote} The lever changes the mapped world's rules; no source has measured this response. ${observed} ${synthetic} Not estimable from this run: ${notEstimable}.`,
        links: [...sourceLinks, ['Product requirements', '../prd.md']],
      },
      sectors: {
        mobility: sector('mobility', ['transit_trips'], {
          title: 'Line 2 trips under the compiled levers.', description: 'Completed sample trips that board Line 2 at Bathurst or Spadina, read from recorded travel events.',
          delta: `${pairOf(['transit_trips'], num)} LINE 2 TRIPS · ${P}`, chartTitle: `SAMPLE LINE 2 TRIPS / ${ticks} PERIODS`,
          unit: 'synthetic completed trips using Line 2 per modelled weekday', evidence: `${leverNote} ${CAVEAT}` }),
        access: sector('access', accessIds, {
          title: 'Trips deferred or taken elsewhere.', description: 'Trips deferred, plus errands taken to a shop outside the mapped section.',
          delta: `${pairOf(accessIds, num)} DEFERRED OR ELSEWHERE · ${P}`, chartTitle: `SAMPLE TRIPS DEFERRED OR TAKEN ELSEWHERE / ${ticks} PERIODS`,
          unit: 'synthetic trips deferred or taken outside the section per modelled weekday (deferred_trips + errands_elsewhere)', evidence: `${leverNote} ${CAVEAT}` }),
        commerce: sector('commerce', ['shop_sales_cad'], {
          title: 'The shop ledger follows purchases.', description: 'Receipts at six OSM-listed Bloor shops sum synthetic purchase events recorded at their doors. No sales, closure or survival estimate.',
          delta: `${pairOf(['shop_sales_cad'], currency)} · ${P}`, chartTitle: `SAMPLE FOCAL SHOP RECEIPTS / ${ticks} PERIODS`,
          unit: 'CAD from synthetic purchase events at focal shops', evidence: `OSM supplies business presence only; baskets and receipt floors are synthetic. ${CAVEAT}` }),
        households: sector('households', ['household_transport_spend_cad'], {
          title: 'Recorded travel payments.', description: 'Fares and stated travel costs paid by sample households. Time, comfort and safety are not priced in this ledger.',
          delta: `${pairOf(['household_transport_spend_cad'], currency)} · ${P}`, chartTitle: `SAMPLE HOUSEHOLD TRANSPORT PAYMENTS / ${ticks} PERIODS`,
          unit: 'CAD from synthetic fare and travel-cost events', evidence: `Parking and driving costs are illustrative. ${CAVEAT}` }),
        public: sector('public', ['fare_revenue_cad'], {
          title: 'Sample TTC receipts.', description: 'Fare payments made inside this section. City-wide revenue, ridership or budget effects are not estimable from this sample.',
          delta: `${pairOf(['fare_revenue_cad'], currency)} SAMPLE TTC · ${P}`, chartTitle: `SAMPLE TTC RECEIPTS / ${ticks} PERIODS`,
          unit: 'CAD from synthetic fare-payment events (recipient side)', evidence: `Equal to household fare spending by construction. ${CAVEAT}` }),
      },
    };
  }

  const api = { toMappedScenario, changedSummary, SECTORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualWorldRunAdapter = api;
})(typeof window !== 'undefined' ? window : null);
