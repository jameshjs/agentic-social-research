/* The persona agents on the canonical mapped engine (experiment/world-runner.js, unchanged). Each of the 19
 * world-fixture people speaks through one Twin donor bundle from data/city/agents.json, matched as build_agents.py
 * matches donors: same fare category and income band, a seeded pick, no donor twice. The donor's Twin answers stay; its
 * "Your situation in Toronto" block is replaced by the fixture person's (experiment/world-fixtures.js, unchanged). Every
 * trip goes to the agent with the runner's legal options and answers {action, provider: 'persona_agent', reason}; a
 * missing or illegal answer leaves the runner's fixture rule to decide, with a warning. runMapped() drives the runner
 * with run.js's concurrent passes; server.js serves it as POST /mapped/fare and /mapped/bike. */
'use strict';
const crypto = require('crypto');
const { runWorldExperiment } = require('../../experiment/world-runner');
const fixtures = require('../../experiment/world-fixtures');
const { DEFAULT_POLICY } = require('../../world/sandbox.js');
const WORLD = require('../../data/world/bloor_spadina_bathurst.json');
const cd = require('./claude-decision');
const { runCity } = require('./run');

const PROVIDER = 'persona_agent';
const SCENARIOS = ['fare', 'bike'];
const HEAD = 'Your situation in Toronto';
const BANDS = ['Less than $30,000', '$30,000-$50,000', '$50,000-$75,000', '$75,000-$100,000', '$100,000 or more'];
const LABEL = { transit: 'the TTC (Line 2)', walk: 'walking', drive: 'driving', bike_bloor: 'cycling along Bloor St W',
  bike_side_street: 'cycling on quieter side streets', shop_elsewhere: 'shopping somewhere else', defer: 'skipping or postponing the trip' };
const HOW = { transit: 'TTC Line 2', walk: 'walk', drive: 'drive', bike_bloor: 'cycle along Bloor St W', bike_side_street: 'cycle on quieter side streets',
  shop_elsewhere: 'shop somewhere outside this stretch of Bloor instead' };
const money = (x) => `$${Number(x).toFixed(2)}`;
const u = (...parts) => parseInt(crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 13), 16) / 16 ** 13;

// shortcut: the fixture has no income, so an adult's band follows their synthetic daily budget (Fair Pass is the
// low-income band, as in build_agents.py); read a fixture income field instead if one is added.
const bandOf = (p) => (p.fare_category === 'fair_pass' ? BANDS[0] : BANDS[p.daily_budget_cad < 30 ? 1 : p.daily_budget_cad < 45 ? 2 : p.daily_budget_cad < 70 ? 3 : 4]);

function matchDonors(people, bundles, seed = 42) {
  const used = new Set();
  return new Map(people.map((p) => {
    const ok = bundles.filter((b) => b.fare_category === p.fare_category && b.match_keys.income_band === bandOf(p) && !used.has(b.id));
    if (!ok.length) throw new Error(`No Twin donor bundle left for ${p.id} (${p.fare_category}, ${bandOf(p)})`);
    const donor = ok.reduce((best, b) => (u(seed, p.id, 'donor', b.id) < u(seed, p.id, 'donor', best.id) ? b : best));
    used.add(donor.id);
    return [p.id, donor];
  }));
}

/* The donor's Twin answers, then the fixture person's situation in place of the donor bundle's. No fixture-rule numbers. */
function mappedSheet(person, bundle, shops) {
  const at = bundle.persona_sheet.lastIndexOf(`\n${HEAD}`);
  if (at < 0) throw new Error(`Bundle ${bundle.id} has no "${HEAD}" block`);
  const trips = person.routine.map((t) => (t.purpose === 'commute' ? `a commute, leaving about ${t.depart}`
    : `shopping at ${shops[t.shop] || t.shop} about ${t.depart}, about ${money(t.basket_cad)} a visit`));
  const lines = [
    person.home.kind === 'mapped' ? `You live on ${person.home.street}, just off Bloor St W between Bathurst St and Spadina Ave.`
      : `You live outside this stretch of Bloor St W: ${person.home.label}.`,
    `In this study you are described as: ${person.role.replace(/_/g, ' ')}.`,
    `You have about ${money(person.daily_budget_cad)} a day for travel and shopping.`,
    `You ${person.has_car ? 'have' : 'do not have'} a car. You ${person.has_bike ? 'own' : 'do not own'} a bike.`,
    `You pay the ${person.fare_category === 'fair_pass' ? 'Fair Pass discount' : 'full adult'} TTC fare.`,
    `Your regular trips: ${trips.join('; ')}.`,
  ];
  return `${bundle.persona_sheet.slice(0, at)}\n${HEAD} (where you live now; it replaces the location and money details above):\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

function optionLine(o, shops) {
  if (o.action === 'defer') return '- defer: skip or postpone this trip today';
  const traffic = o.mode === 'bike' && o.shared_with_cars_m > 0 ? `, sharing the road with cars for ${Math.round(o.shared_with_cars_m)} m`
    : o.action === 'bike_bloor' ? ' in the protected cycle track' : '';
  const to = o.destination && o.destination !== 'offmap' ? `, to ${shops[o.destination] || o.destination.replace(' (off-map)', '')}` : '';
  return `- ${o.action}: ${HOW[o.action] || o.action.replace(/_/g, ' ')}${traffic}, ${o.minutes} min, ${o.cost_cad ? money(o.cost_cad) : 'no cost'}${to}`;
}

/* The user message for one world-runner request: the trip, cash, the policy levers this person faces on this trip (their
 * own fare if they could ride Line 2; the cycle track if they could cycle or drive) against the baseline, a planned shop
 * the options no longer reach, the person's previous choice, then each legal option. A lever they don't face is left
 * out, so it alone never makes the prompt differ from the baseline's. */
function worldSituation(request, { baseline, lastChoice, shops }) {
  const { tick, trip, world, options, cash_cad, person } = request;
  const shop = shops[trip.planned_shop] || trip.planned_shop;
  const lane = (track) => (track === 'none' ? 'removed: cyclists share the road with cars' : track);
  const around = trip.purpose === 'errand' && !options.some((o) => o.destination === trip.planned_shop)
    ? `${shop} is not among today's options: it closes before you could get there, or you can't afford the trip there.` : 'nothing new.';
  const faced = [];
  if (options.some((o) => o.mode === 'transit')) {
    faced.push(person.fare_category === 'fair_pass' ? cd.change('Fair Pass fare', world.fair_pass_fare_cad, baseline.fair_pass_fare_cad)
      : cd.change('Adult TTC fare', world.adult_fare_cad, baseline.adult_fare_cad));
  }
  if (options.some((o) => o.mode === 'bike' || o.mode === 'car')) {
    faced.push(`Bloor St W cycle track between Bathurst and Spadina: ${lane(world.bloor_cycle_track)}${world.bloor_cycle_track === baseline.bloor_cycle_track ? ' (no change)' : ` (it was ${lane(baseline.bloor_cycle_track)})`}`);
  }
  return [
    `It is day ${tick} (a modelled weekday). This trip: ${trip.purpose === 'commute' ? 'your commute' : `shopping at ${shop}`}, leaving at ${trip.depart}.`,
    `Cash you have today: ${money(cash_cad)}.`,
    ...(faced.length ? ['Compared with usual:', ...faced.map((l) => `- ${l}.`)] : ['Compared with usual: nothing that affects this trip.']),
    `What changed around you today: ${around}`,
    `On the previous modelled weekday, for this trip, you chose: ${lastChoice}.`,
    '',
    'Your options for this trip:',
    ...options.map((o) => optionLine(o, shops)),
    '',
    'Which option do you take for this trip?',
  ].join('\n');
}

/* What this person chose for this trip the previous day, in this arm. The world runner asks baseline days 1..T, then
 * the intervention from policy_start (its earlier days repeat the baseline's requests and are answered from the
 * runner's cache), so a step back in day starts the next arm, and a day the intervention never asked is the baseline's.
 * Same interface as cd.createRunMemory, for runCity. */
function createWorldMemory({ resolve } = {}) {
  const seen = new Map();
  let arm = 0, lastTick = 0;
  const key = (a, tick, r) => `${a}|${tick}|${r.person.id}|${r.trip.id}`;
  return {
    get arm() { return arm; },
    lastChoice(request) {
      if (request.tick < lastTick) arm++;
      lastTick = request.tick;
      if (request.tick === 1) return 'none yet (this is the first day)';
      const from = seen.has(key(arm, request.tick - 1, request)) ? arm : 0;
      const action = seen.get(key(from, request.tick - 1, request)) ?? resolve?.(from, request.tick - 1, request.person.id, request.trip.id);
      return action ? LABEL[action] || action : 'not recorded';
    },
    record(request, answer) { seen.set(key(arm, request.tick, request), answer ? answer.action : null); },
  };
}

function mappedSpec(scenario) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`Unknown mapped scenario ${scenario}: use fare or bike`);
  const fixture = fixtures[scenario];
  return { ...fixture, assumptions: [...fixture.assumptions,
    { id: 'external_agent_choice', kind: 'synthetic', note: `A persona agent (${cd.PROVIDER}, low effort) chose one legal option for each trip. Tuned on US survey answers; not validated on mobility choices.` },
    { id: 'twin_anchored_personas', kind: 'synthetic', note: "Each fixture person speaks through one US survey respondent's given answers (Twin-2K-500), matched on fare category and an income band read from the synthetic daily budget." }] };
}

/* One mapped run of the 19 people as persona agents: the paired experiment.v2 RunResult, the call log, a summary, and
 * every known answer. answers maps a hash of the agent model and exact prompt to its answer: a prompt already answered (in the other arm,
 * or in another policy's run sharing the map) is never sampled again, so an unchanged request keeps its baseline answer
 * and fare and bike share one baseline. A failed answer is not kept. */
async function runMapped(scenario, { call, backend, token, seed = 42, concurrency = 16, onCall = () => {}, onPass = () => {}, agents = cd.loadAgents(),
  answers = new Map() } = {}) {
  const spec = mappedSpec(scenario);
  const people = spec.population.personas;
  const donors = matchDonors(people, agents.bundles, seed);
  const shops = Object.fromEntries(spec.shops.map((s) => [s.business_id, s.label]));
  // The request's world fields, as the baseline arm sends them.
  const baseline = { adult_fare_cad: spec.environment.adult_fare_cad, fair_pass_fare_cad: spec.environment.fair_pass_fare_cad,
    bloor_cycle_track: DEFAULT_POLICY.bloor_cycle_track, line2_headway_multiplier: DEFAULT_POLICY.line2_headway_multiplier };
  const calls = [];
  const sheets = new Map(people.map((p) => [p.id, mappedSheet(p, donors.get(p.id), shops)]));
  const render = (request, opts) => worldSituation(request, { ...opts, shops });
  const provider = cd.createClaudeDecisionProvider({ sheets, baseline, backend, token, call, concurrency, warn: () => {}, render, onCall: (c) => {
      const row = { person: c.request?.person.id, tick: c.request?.tick, trip: c.request?.trip.id, last_choice: c.lastChoice, ok: c.ok,
        action: c.answer?.action, reason: c.answer?.reason, arm: !c.request ? undefined : c.request.tick < spec.policy_start ? 'both'
          : JSON.stringify(c.request.world) === JSON.stringify(baseline) ? 'baseline' : 'policy',
        skipped: c.skipped || undefined, limited: c.limited || undefined, attempts: c.attempts, latency_ms: c.latency_ms, cost_usd: c.cost_usd ?? undefined, error: c.error };
      calls.push(row);
      onCall(row);
    } });
  let reused = 0;
  const ask = (request, lastChoice) => {
    // The model and effort are in the key too: a stored answer is only reused for the same agent and the same prompt.
    const key = cd.sha256(JSON.stringify([cd.AGENT, cd.buildPrompt(request, sheets.get(request.person.id), { baseline, lastChoice, render })]));
    if (answers.has(key)) { reused++; return answers.get(key); }          // an answer, or the same prompt still in flight
    const pending = provider.ask(request, lastChoice).then((a) => { if (!a) answers.delete(key); return a && { ...a, provider: PROVIDER }; });
    answers.set(key, pending);
    return pending;
  };
  const started = Date.now();
  const { result, passes } = await runCity(spec, { personas: people, seed, ask, onPass, createMemory: createWorldMemory,
    run: (s, opts) => runWorldExperiment(s, { ...opts, world: WORLD }) });
  const live = calls.filter((c) => !c.skipped);
  const decisions = ['baseline', 'intervention'].flatMap((arm) => result.runs[arm].decisions);
  const warnings = ['baseline', 'intervention'].flatMap((arm) => result.runs[arm].warnings);
  const known = (await Promise.all([...answers].map(async ([k, a]) => [k, await a]))).filter(([, a]) => a);
  return { result, spec, calls, answers: known, meta: {
    scenario, study_id: result.study_id, ticks: spec.ticks, people: people.length, backend, model: cd.AGENT.model, effort: cd.AGENT.effort,
    provider: PROVIDER, agent: cd.PROVIDER, instructions_sha256: cd.sha256(cd.INSTRUCTIONS), addendum_sha256: cd.sha256(cd.ADDENDUM),
    donors: Object.fromEntries([...donors].map(([id, b]) => [id, { bundle: b.id, donor_pid: b.match_keys.donor_pid, income_band: b.match_keys.income_band, fare_category: b.fare_category }])),
    wall_s: Math.round((Date.now() - started) / 100) / 10, passes, calls: live.length, reused_answers: reused, failed_calls: live.filter((c) => !c.ok).length,
    limited: calls.some((c) => c.limited), cost_usd: Math.round(live.reduce((s, c) => s + (c.cost_usd || 0), 0) * 10000) / 10000,
    decisions: decisions.length, agent_decisions: decisions.filter((d) => d.provider === PROVIDER).length,
    fallback_warnings: warnings.filter((w) => w.code === 'invalid_agent_action' || w.code === 'agent_error').length, changed_decisions: result.changed_decisions.length,
  } };
}

/* Re-runs a saved mapped RunResult from its decision_replay with no model calls. */
const replayMapped = (saved) => runWorldExperiment(mappedSpec(saved.scenario_id), { world: WORLD, seed: saved.seed, replay_decisions: saved.decision_replay });

module.exports = { PROVIDER, SCENARIOS, LABEL, WORLD, bandOf, matchDonors, mappedSheet, worldSituation, createWorldMemory, mappedSpec, runMapped, replayMapped };
