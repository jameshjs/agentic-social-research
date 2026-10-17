/* Maps one experiment.v2 RunResult (mapped Bathurst–Spadina world) onto an
 * /experience/ scenario template. Works for both prepared policies; every chart
 * series is read from result.runs[arm].metrics.by_tick and nothing else. */
(function (root) {
  'use strict';

  const SECTORS = ['mobility', 'access', 'commerce', 'households', 'public'];
  const CAVEAT = 'Synthetic people and assumption-driven responses, not a Toronto forecast.';

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const currency = (v) => (isNum(v) ? `$${v.toFixed(2)}` : '—');
  const num = (v, unit = '') => (isNum(v) ? `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}` : '—');
  const tone = (policy, baseline, higherIsBetter) => (!isNum(policy) || !isNum(baseline) || policy === baseline ? 'neutral' : (policy > baseline) === higherIsBetter ? 'positive' : 'negative');

  function toMappedScenario(result, template = {}) {
    if (!result || result.schema_version !== 'experiment.v2' || !result.runs || !result.runs.baseline || !result.runs.intervention) throw new TypeError('Expected an experiment.v2 RunResult');
    const kind = result.scenario_id;
    if (kind !== 'fare' && kind !== 'bike') throw new TypeError(`No dashboard mapping for scenario ${kind}`);
    const ticks = result.runs.baseline.metrics.by_tick.length;
    const start = result.scenario.policy_start;
    const P = `P${ticks}`;
    // Sum of one or more by_tick fields; a single field is passed through unchanged (including null).
    const series = (arm, ids) => result.runs[arm].metrics.by_tick.map((p) => (ids.length === 1 ? p[ids[0]] : ids.reduce((s, id) => s + (p[id] ?? 0), 0)));
    const last = (arm, ids) => series(arm, ids).at(-1);
    const afterPolicyMean = (arm, ids) => {
      const values = series(arm, ids).filter((v, i) => i + 1 >= start && isNum(v));
      return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 100) / 100 : null;
    };
    const sector = (key, ids, copy) => ({
      ...((template.sectors || {})[key] || {}), ...copy, metric_ids: ids,
      baseline: series('baseline', ids), policy: series('intervention', ids),
    });

    const changed = result.changed_decisions.length;
    const decisions = result.runs.intervention.decisions.length;
    const rejected = result.runs.baseline.game_master.rejected_actions + result.runs.intervention.game_master.rejected_actions;
    const pop = result.population;
    const narrative = `${pop.count} synthetic people (${pop.residents} with homes on mapped side streets, ${pop.visitors} visitors) make ${decisions} bounded choices over ${ticks} modelled weekdays in the mapped Bathurst–Spadina section. Every move passed the world's rule checks (${rejected} rejected), and the city, ledger and charts read the same events. ${CAVEAT}`;
    const common = {
      ...template, run: result, title: result.scenario.question,
      breadcrumb: 'BLOOR WEST · BATHURST–SPADINA', viewport: 'BATHURST–SPADINA SECTION',
      worldCaption: 'Mapped Bathurst–Spadina section · motion replays recorded travel events',
      narrative, sourceRibbon: `Seed ${result.seed} · v${result.version} · ${changed} changed decisions · synthetic responses`,
    };

    if (kind === 'fare') {
      const env = result.scenario.environment || {};
      const adultBefore = result.scenario.levers.baseline.adult_fare_cad, adultAfter = result.scenario.levers.intervention.adult_fare_cad;
      const fairPass = env.fair_pass_fare_cad;
      const accessIds = ['deferred_trips', 'errands_elsewhere'];
      return {
        ...common,
        summary: `The adult fare goes from ${currency(adultBefore)} to ${currency(adultAfter)} from period ${start}; Fair Pass stays at ${currency(fairPass)}. ${changed} of ${decisions} paired choices differ. ${CAVEAT}`,
        headline: { label: 'SAMPLE TTC RECEIPTS / PERIOD AFTER CHANGE', value: `${currency(afterPolicyMean('intervention', ['fare_revenue_cad']))} / ${currency(afterPolicyMean('baseline', ['fare_revenue_cad']))}`, direction: 'policy / baseline · synthetic, assumption-driven' },
        mini: [
          { label: `Sample Line 2 trips / ${P}`, value: `${num(last('intervention', ['transit_trips']))} / ${num(last('baseline', ['transit_trips']))}`, tone: tone(last('intervention', ['transit_trips']), last('baseline', ['transit_trips']), true) },
          { label: `Household fare spend / ${P}`, value: `${currency(last('intervention', ['household_fare_spend_cad']))} / ${currency(last('baseline', ['household_fare_spend_cad']))}`, tone: tone(last('intervention', ['household_fare_spend_cad']), last('baseline', ['household_fare_spend_cad']), false) },
          { label: `Focal shop receipts / ${P}`, value: `${currency(last('intervention', ['shop_sales_cad']))} / ${currency(last('baseline', ['shop_sales_cad']))}`, tone: tone(last('intervention', ['shop_sales_cad']), last('baseline', ['shop_sales_cad']), true) },
        ],
        sectors: {
          mobility: sector('mobility', ['transit_trips'], {
            title: 'Who keeps riding Line 2.', description: 'Completed sample trips that board Line 2 at Bathurst or Spadina. Each ride waited for a scheduled departure on the mapped platforms.',
            delta: `${num(last('intervention', ['transit_trips']))} / ${num(last('baseline', ['transit_trips']))} LINE 2 TRIPS · ${P}`, chartTitle: `SAMPLE LINE 2 TRIPS / ${ticks} PERIODS`,
            unit: 'synthetic completed trips using Line 2 per modelled weekday', evidence: `Mode changes come from a stated synthetic score; no Toronto fare elasticity is applied. ${CAVEAT}` }),
          access: sector('access', accessIds, {
            title: 'Some trips do not happen here.', description: 'Trips deferred, plus errands taken to a shop outside the mapped section. Off-map shops are not modelled destinations.',
            delta: `${num(last('intervention', accessIds))} / ${num(last('baseline', accessIds))} DEFERRED OR ELSEWHERE · ${P}`, chartTitle: `SAMPLE TRIPS DEFERRED OR TAKEN ELSEWHERE / ${ticks} PERIODS`,
            unit: 'synthetic trips deferred or taken outside the section per modelled weekday (deferred_trips + errands_elsewhere)', evidence: `Shop hours follow a synthetic receipts floor; this is not an access forecast. ${CAVEAT}` }),
          commerce: sector('commerce', ['shop_sales_cad'], {
            title: 'The shop ledger follows purchases.', description: 'Receipts at six OSM-listed Bloor shops sum synthetic purchase events recorded at their doors. No sales, profit or survival estimate.',
            delta: `${currency(last('intervention', ['shop_sales_cad']))} / ${currency(last('baseline', ['shop_sales_cad']))} · ${P}`, chartTitle: `SAMPLE FOCAL SHOP RECEIPTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic purchase events at focal shops', evidence: `OSM supplies business presence only; baskets and receipt floors are synthetic. ${CAVEAT}` }),
          households: sector('households', ['household_fare_spend_cad'], {
            title: `Adult riders pay more; Fair Pass stays at ${currency(fairPass)}.`, description: `Fares recorded for sample households. Fair Pass is unchanged by this policy; adult and Fair Pass spending per period are split in run.metrics.by_group.`,
            delta: `${currency(last('intervention', ['household_fare_spend_cad']))} / ${currency(last('baseline', ['household_fare_spend_cad']))} · ${P}`, chartTitle: `SAMPLE HOUSEHOLD FARE SPENDING / ${ticks} PERIODS`,
            unit: 'CAD from synthetic fare-payment events (payer side)', evidence: `Fares are the citywide TTC rules; who rides is synthetic. ${CAVEAT}` }),
          public: sector('public', ['fare_revenue_cad'], {
            title: 'More per ride, counted ride by ride.', description: 'Sample TTC receipts sum fare payments made inside this section. City-wide revenue, ridership or budget effects are not estimable from this sample.',
            delta: `${currency(last('intervention', ['fare_revenue_cad']))} / ${currency(last('baseline', ['fare_revenue_cad']))} SAMPLE TTC · ${P}`, chartTitle: `SAMPLE TTC RECEIPTS / ${ticks} PERIODS`,
            unit: 'CAD from synthetic fare-payment events (recipient side)', evidence: `Equal to household fare spending by construction; no transfer is counted twice. ${CAVEAT}` }),
        },
      };
    }

    return {
      ...common,
      summary: `The protected cycle track is removed from period ${start} and cyclists share the car lanes. ${changed} of ${decisions} paired choices differ. ${CAVEAT}`,
      headline: { label: `SAMPLE BLOOR CYCLING TRIPS / ${P}`, value: `${num(last('intervention', ['bloor_bike_trips']))} / ${num(last('baseline', ['bloor_bike_trips']))}`, direction: 'policy / baseline · synthetic, assumption-driven' },
      mini: [
        { label: `Cycling shared with cars / ${P}`, value: `${num(last('intervention', ['bloor_shared_cycling_m']), ' m')} / ${num(last('baseline', ['bloor_shared_cycling_m']), ' m')}`, tone: tone(last('intervention', ['bloor_shared_cycling_m']), last('baseline', ['bloor_shared_cycling_m']), false) },
        { label: `Focal shop receipts / ${P}`, value: `${currency(last('intervention', ['shop_sales_cad']))} / ${currency(last('baseline', ['shop_sales_cad']))}`, tone: tone(last('intervention', ['shop_sales_cad']), last('baseline', ['shop_sales_cad']), true) },
        { label: `Driver in-map minutes / ${P}`, value: `${num(last('intervention', ['driver_mapped_minutes']))} / ${num(last('baseline', ['driver_mapped_minutes']))}`, tone: 'neutral' },
      ],
      sectors: {
        mobility: sector('mobility', ['bloor_bike_trips'], {
          title: 'Some cyclists leave Bloor.', description: 'Completed sample bike trips with a leg on a Bloor lane or the track. A side-street route keeps the trip but leaves Bloor.',
          delta: `${num(last('intervention', ['bloor_bike_trips']))} / ${num(last('baseline', ['bloor_bike_trips']))} BLOOR BIKE TRIPS · ${P}`, chartTitle: `SAMPLE BLOOR CYCLING TRIPS / ${ticks} PERIODS`,
          unit: 'synthetic completed bike trips using Bloor per modelled weekday', evidence: `Route changes come from an assumed discomfort per km shared with cars; no observed removal response. ${CAVEAT}` }),
        access: sector('access', ['bloor_shared_cycling_m'], {
          title: 'Riding with cars: an exposure distance.', description: 'Metres sample cyclists ride in a Bloor car lane once the track is gone. This is exposure distance, not injuries or collisions; no injury model is attached.',
          delta: `${num(last('intervention', ['bloor_shared_cycling_m']), ' M')} / ${num(last('baseline', ['bloor_shared_cycling_m']), ' M')} SHARED · ${P}`, chartTitle: `SAMPLE CYCLING DISTANCE SHARED WITH CARS / ${ticks} PERIODS`,
          unit: 'metres of sample cycling in car lanes (exposure distance, not injuries)', evidence: `Injuries are not estimable from this run. ${CAVEAT}` }),
        commerce: sector('commerce', ['shop_sales_cad'], {
          title: 'The shop ledger follows purchases.', description: 'Receipts at six OSM-listed Bloor shops sum synthetic purchase events recorded at their doors. No sales, closure or survival estimate.',
          delta: `${currency(last('intervention', ['shop_sales_cad']))} / ${currency(last('baseline', ['shop_sales_cad']))} · ${P}`, chartTitle: `SAMPLE FOCAL SHOP RECEIPTS / ${ticks} PERIODS`,
          unit: 'CAD from synthetic purchase events at focal shops', evidence: `Installation-era merchant studies do not give a removal coefficient. ${CAVEAT}` }),
        households: sector('households', ['household_transport_spend_cad'], {
          title: 'Recorded travel payments.', description: 'Fares and stated travel costs paid by sample households. Time, comfort and safety are not priced in this ledger.',
          delta: `${currency(last('intervention', ['household_transport_spend_cad']))} / ${currency(last('baseline', ['household_transport_spend_cad']))} · ${P}`, chartTitle: `SAMPLE HOUSEHOLD TRANSPORT PAYMENTS / ${ticks} PERIODS`,
          unit: 'CAD from synthetic fare and travel-cost events', evidence: `Parking and driving costs are illustrative. ${CAVEAT}` }),
        public: sector('public', ['driver_mapped_minutes'], {
          title: 'Zero driver-time gain case.', description: 'Mean in-map minutes per sample car leg. This layout adds no car lane when the track goes, so driver time inside the section does not change. Periods without a car leg have no value.',
          delta: `${num(last('intervention', ['driver_mapped_minutes']), ' MIN')} / ${num(last('baseline', ['driver_mapped_minutes']), ' MIN')} · ZERO DRIVER-TIME GAIN CASE`, chartTitle: `SAMPLE DRIVER MINUTES IN SECTION / ${ticks} PERIODS`,
          unit: 'mean in-map minutes per synthetic car leg (null when no car leg)', evidence: `The zero driver-time gain case is a modelling choice, not a forecast; gains beyond the section are not estimable. ${CAVEAT}` }),
      },
    };
  }

  const api = { toMappedScenario, SECTORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CounterfactualWorldRunAdapter = api;
})(typeof window !== 'undefined' ? window : null);
