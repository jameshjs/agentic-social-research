#!/usr/bin/env node
/* City-decision evaluation of a saved run: feasible actions, fallbacks, changed decisions, group slices, each person's
 * consistency between arms, the fare elasticity and Bloor cyclist checks, choice variety, and latency and cost. The
 * same personas under the fixture rule alone are the comparison. Reads data/city/run-<scenario>.json and its
 * .meta.json, and writes eval-<scenario>.json. No model calls. The checks are face validity: never tune to them.
 * Usage: node persona-swarm/runtime/evaluate.js fare|bike|both [--smoke]   (--smoke reads smoke-<scenario>.json) */
'use strict';
const fs = require('fs');
const path = require('path');
const { runExperiment } = require('../../experiment/runner');
const fixtures = require('../../experiment/fixtures');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(REPO, 'persona-swarm', 'data', 'city');
const pct = (x) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
const share = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const round = (x, d = 2) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
const ELASTICITY_RANGE = [-0.6, -0.2];   // papers.md F03 (Bogotá BRT: -0.565 at a week, -0.408 at a month) and F06 (Mexican subways: about -0.23 to -0.32)
const count = (xs) => xs.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
// What the person faces: the trip, cash, shop hours and each option, including the lane state the Bloor cycling option carries.
const choiceSet = (r) => JSON.stringify([r.trip, r.cash_cad, r.shop_hours, r.options.map((o) => [o.action, o.cost_cad, o.minutes, o.destination, o.route_id,
  o.action === 'bike_bloor' ? r.environment.bike_lane_protected : null])]);

async function evaluateRun(result, meta = null) {
  const spec = Object.values(fixtures).find((f) => f.id === result.study_id);
  const baseEnv = JSON.stringify(spec ? spec.environment : null);
  const people = new Map(result.personas.map((p) => [p.id, p]));
  const all = ['baseline', 'intervention'].flatMap((arm) => result.runs[arm].decisions.map((d) => ({ ...d, arm })));
  const agent = all.filter((d) => d.provider !== 'fixture_rule');
  const warnings = ['baseline', 'intervention'].flatMap((arm) => result.runs[arm].warnings);
  const reasons = new Map(['baseline', 'intervention'].flatMap((arm) => result.runs[arm].events
    .filter((e) => e.action === 'choose_trip').map((e) => [e.id, e.reason])));

  // Each decision's request, recovered from decision_replay: a baseline request carries the unchanged environment.
  const requests = new Map();
  for (const [key] of result.decision_replay) {
    const r = JSON.parse(key);
    const id = `${r.tick}:${r.person.id}:${r.trip.id}`;
    if (JSON.stringify(r.environment) === baseEnv) { requests.set(`baseline|${id}`, r); if (r.tick < result.scenario.policy_start) requests.set(`intervention|${id}`, r); }
    else requests.set(`intervention|${id}`, r);
  }

  // Pairs: the same person, tick and trip in both arms, from the tick the policy starts.
  const base = new Map(result.runs.baseline.decisions.map((d) => [d.key, d]));
  const pairs = result.runs.intervention.decisions.filter((d) => d.tick >= result.scenario.policy_start && base.has(d.key)).map((d) => {
    const b = base.get(d.key);
    const rb = requests.get(`baseline|${d.key}`), ri = requests.get(`intervention|${d.key}`);
    return { key: d.key, actor: d.actor, tick: d.tick, trip: d.trip_id, baseline: b.action, intervention: d.action,
      changed: b.action !== d.action || b.destination !== d.destination || b.route_id !== d.route_id,
      both_agent: b.provider !== 'fixture_rule' && d.provider !== 'fixture_rule',
      options_changed: rb && ri ? choiceSet(rb) !== choiceSet(ri) : null, reason: reasons.get(d.event_id) };
  });

  const slice = (of) => {
    const groups = {};
    for (const p of pairs) (groups[of(people.get(p.actor))] ||= []).push(p);
    return Object.fromEntries(Object.entries(groups).map(([g, ps]) => [g, { pairs: ps.length, changed: share(ps.filter((p) => p.changed).length, ps.length),
      baseline: count(ps.map((p) => p.baseline)), intervention: count(ps.map((p) => p.intervention)) }]));
  };
  const steady = pairs.filter((p) => p.options_changed === false && p.both_agent);
  const affected = pairs.filter((p) => p.options_changed === true && p.both_agent);
  const live = (meta?.call_log || []).filter((c) => !c.skipped);
  const rule = await runExperiment({ ...spec, ticks: result.scenario.ticks, policy_start: result.scenario.policy_start }, { seed: result.seed, personas: result.personas });

  // Implied short-run fare response: (change in paid TTC trips / baseline) / (fare change / base fare), from the policy week on.
  const fareChange = result.scenario.intervention.find((c) => c.operator === 'change_cost' && c.target === 'adult_transit_ride');
  const elasticity = (r, who = () => true) => {
    const trips = (arm) => r.runs[arm].events.filter((e) => e.action === 'pay_fare' && e.tick >= r.scenario.policy_start && who(people.get(e.actor))).length;
    const b = trips('baseline'), i = trips('intervention');
    return { baseline_trips: b, intervention_trips: i, elasticity: b ? round(((i - b) / b) / (fareChange.delta_cad / spec.environment.adult_fare_cad)) : null };
  };
  // Bloor: what cyclists who rode Bloor in the baseline do once the lane is unprotected.
  const laneChange = result.scenario.intervention.some((c) => c.operator === 'set_lane_protection');
  const bloor = (r) => {
    const b = new Map(r.runs.baseline.decisions.map((d) => [d.key, d]));
    const rows = r.runs.intervention.decisions.filter((d) => d.tick >= r.scenario.policy_start && b.get(d.key)?.action === 'bike_bloor');
    const kind = count(rows.map((d) => (d.action === 'bike_bloor' ? 'stay' : d.action === 'bike_detour' ? 'reroute' : d.action === 'defer' ? 'defer' : 'switch_mode')));
    return { cyclist_trips: rows.length, ...Object.fromEntries(['stay', 'reroute', 'switch_mode', 'defer'].map((k) => [k, share(kind[k] || 0, rows.length)])),
      respond: share(rows.length - (kind.stay || 0), rows.length) };
  };
  // Variety: distinct actions across personas in the same situation (arm, week, trip purpose).
  const variety = (r) => {
    const groups = new Map();
    for (const arm of ['baseline', 'intervention']) for (const d of r.runs[arm].decisions) {
      const k = `${arm}|${d.tick}|${people.get(d.actor).routine.find((t) => t.id === d.trip_id)?.purpose}`;
      if (!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(d.action);
    }
    const sizes = [...groups.values()].map((g) => g.size);
    return { situations: sizes.length, mean_distinct_choices: round(sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1)) };
  };
  const inRange = (x) => (x === null ? 'not estimable' : x >= ELASTICITY_RANGE[0] && x <= ELASTICITY_RANGE[1] ? 'in range' : 'out of range');
  const latencies = live.map((c) => c.latency_ms).filter(Number.isFinite);

  return {
    schema: 'persona-swarm.city-eval.v1', study_id: result.study_id, ticks: result.scenario.ticks, policy_start: result.scenario.policy_start,
    personas: result.personas.length, persona_source: result.personas[0]?.persona_source,
    decisions: all.length,
    feasible_action_rate: share(agent.length, all.length),
    fallback_rate: share(all.length - agent.length, all.length),
    fallback_warnings: count(warnings.map((w) => w.code)),
    changed_decisions: {
      count: result.changed_decisions.length, of_pairs: pairs.length,
      transitions: count(pairs.filter((p) => p.changed).map((p) => `${p.baseline}→${p.intervention}`)),
      by_person: count(result.changed_decisions.map((c) => c.actor)),
    },
    consistency: {
      note: 'Pairs where both arms were decided by the agent. "Same choice set": the policy did not change this person\'s options, cash or trip, only the description of the city; the action should stay. "Choice set changed": the policy changed the options this person faced.',
      same_choice_set: { pairs: steady.length, same_action: share(steady.filter((p) => !p.changed).length, steady.length) },
      choice_set_changed: { pairs: affected.length, changed_action: share(affected.filter((p) => p.changed).length, affected.length) },
      by_person: Object.fromEntries([...people.keys()].map((id) => {
        const ps = pairs.filter((p) => p.actor === id);
        return [id, { role: people.get(id).role, pairs: ps.length, same: share(ps.filter((p) => !p.changed).length, ps.length),
          switches: ps.filter((p) => p.changed).map((p) => `t${p.tick} ${p.trip}: ${p.baseline}→${p.intervention}`) }];
      })),
    },
    group_slices: {
      role: slice((p) => p.role), fare_category: slice((p) => p.fare_category),
      has_car: slice((p) => (p.has_car ? 'car' : 'no car')), has_bike: slice((p) => (p.has_bike ? 'bike' : 'no bike')),
    },
    calls: meta ? {
      backend: meta.backend, model: meta.model, effort: meta.effort, calls: live.length, failed: live.filter((c) => !c.ok).length,
      latency_ms: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null },
      cost_usd: meta.cost_usd, cost_per_call_usd: live.length ? Math.round((meta.cost_usd / live.length) * 100000) / 100000 : null,
      wall_s: meta.wall_s, passes: meta.passes,
    } : null,
    fare_elasticity: fareChange ? (() => {
      const agents = elasticity(result), adults = elasticity(result, (p) => p.fare_category !== 'fair_pass'), fixture = elasticity(rule);
      return { range: ELASTICITY_RANGE, sources: 'papers.md F03 and F06', agents, adult_fare_payers: adults, fixture_rule: fixture,
        verdict: inRange(agents.elasticity), note: 'Synthetic people over a few weeks: a face-validity check, never a Toronto estimate or a tuning target.' };
    })() : null,
    bloor_cyclists: laneChange ? { agents: bloor(result), fixture_rule: bloor(rule),
      cases: 'bloor-bike-demo.md spans a zero-response case (every cyclist stays on Bloor) to substantial rerouting or mode shift. B02 is an installation finding and is not inverted.' } : null,
    variety: { agents: variety(result), fixture_rule: variety(rule) },
    sample_changes: pairs.filter((p) => p.changed).slice(0, 8).map((p) => ({ person: p.actor, tick: p.tick, trip: p.trip, from: p.baseline, to: p.intervention, reason: p.reason })),
    limits: ["Twin-anchored personas: a US survey respondent's attitudes in a synthetic Toronto role. Every check here is face validity, not a Toronto behaviour forecast.",
      'Invented-fact checks of the reasons are manual: read sample_changes and the choose_trip reasons.'],
  };
}

function report(e) {
  const c = e.calls;
  return [
    `${e.study_id}: ${e.personas} personas, ${e.decisions} decisions, ticks ${e.ticks} (policy from ${e.policy_start})`,
    `  feasible actions ${e.feasible_action_rate}, fallbacks ${e.fallback_rate} ${JSON.stringify(e.fallback_warnings)}`,
    `  changed between arms: ${e.changed_decisions.count} of ${e.changed_decisions.of_pairs} pairs ${JSON.stringify(e.changed_decisions.transitions)}`,
    `  consistency: ${e.consistency.same_choice_set.pairs} pairs with the same choice set kept their action in ${pct(e.consistency.same_choice_set.same_action)}; `
      + `${e.consistency.choice_set_changed.pairs} pairs whose choice set changed switched in ${pct(e.consistency.choice_set_changed.changed_action)}`,
    ...(e.fare_elasticity ? [`  fare elasticity (paid TTC trips): agents ${e.fare_elasticity.agents.elasticity} → ${e.fare_elasticity.verdict} [${e.fare_elasticity.range.join(', ')}]; `
      + `adult payers ${e.fare_elasticity.adult_fare_payers.elasticity}; fixture rule ${e.fare_elasticity.fixture_rule.elasticity}`] : []),
    ...(e.bloor_cyclists ? [`  Bloor cyclists (${e.bloor_cyclists.agents.cyclist_trips} trips): stay ${pct(e.bloor_cyclists.agents.stay)}, reroute ${pct(e.bloor_cyclists.agents.reroute)}, `
      + `switch ${pct(e.bloor_cyclists.agents.switch_mode)}, defer ${pct(e.bloor_cyclists.agents.defer)}; fixture rule responds ${pct(e.bloor_cyclists.fixture_rule.respond)}`] : []),
    `  variety: ${e.variety.agents.mean_distinct_choices} distinct choices per situation (fixture rule ${e.variety.fixture_rule.mean_distinct_choices}, ${e.variety.agents.situations} situations)`,
    ...Object.entries(e.group_slices.role).map(([g, s]) => `  ${g}: ${s.pairs} pairs, changed ${s.changed}, ${JSON.stringify(s.baseline)} → ${JSON.stringify(s.intervention)}`),
    c ? `  calls ${c.calls} (${c.failed} failed), latency p50 ${c.latency_ms.p50} ms p95 ${c.latency_ms.p95} ms, $${c.cost_usd} ($${c.cost_per_call_usd}/call), ${c.wall_s} s in ${c.passes} passes` : '  no call log',
  ].join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const which = argv[0] || 'both';
  const prefix = argv.includes('--smoke') ? 'smoke' : 'run';
  if (!['fare', 'bike', 'both'].includes(which)) { process.stderr.write('Usage: node persona-swarm/runtime/evaluate.js fare|bike|both [--smoke]\n'); process.exit(2); }
  for (const scenario of which === 'both' ? ['fare', 'bike'] : [which]) {
    const file = path.join(OUT_DIR, `${prefix}-${scenario}.json`);
    const metaFile = file.replace(/\.json$/, '.meta.json');
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null;
    const e = await evaluateRun(result, meta);
    fs.writeFileSync(path.join(OUT_DIR, `eval-${prefix === 'smoke' ? 'smoke-' : ''}${scenario}.json`), `${JSON.stringify(e, null, 2)}\n`);
    process.stdout.write(`${report(e)}\n`);
  }
}

if (require.main === module) main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });

module.exports = { evaluateRun, report };
