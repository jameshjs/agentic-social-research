/* Turns the persona runtime's saved runs (persona-swarm/data/city/live/*.json, the `record` of
 * GET /replay/latest) and agent bundles (persona-swarm/data/city/agents.json) into the compact shape
 * the 3D viewer uses. Pure functions: inputs are read, never changed. Used by build-personas.mjs (Node)
 * and by viewer.js in the browser when it loads a live replay from the persona server. */

const RELATIVE = /Relative profile[^\n]*\n((?:- [^\n]*\n?)+)/;

/* One persona's display fields from an agents.json bundle entry. */
export function compactPersona(a) {
  const m = a.match_keys || {};
  const rel = typeof a.persona_sheet === 'string' ? a.persona_sheet.match(RELATIVE) : null;
  return {
    id: a.id, name: a.name, role: a.role, mode: a.mode, neighbourhood: a.neighbourhood,
    age_band: m.age_band || null, sex: m.sex || null, income_band: m.income_band || null,
    weekly_income_cad: a.weekly_income_cad, disposable_cash_weekly_cad: a.disposable_cash_weekly_cad,
    fare_category: a.fare_category, low_income: !!a.low_income, has_car: !!a.has_car, has_bike: !!a.has_bike,
    max_walk_km: a.max_walk_km, cost_sensitivity: a.cost_sensitivity, time_sensitivity: a.time_sensitivity,
    bike_safety_sensitivity: a.bike_safety_sensitivity, mode_preference: a.mode_preference || {},
    routine: a.routine || [], shop: a.shop || null, decider: !!a.decider,
    situation: a.situation || [],
    traits: rel ? rel[1].split('\n').map((s) => s.replace(/^- /, '').trim()).filter(Boolean) : [],
    source: a.persona_source || 'twin_anchored_v1',
  };
}

/* One saved run (kind "run") reduced to choices per arm, totals, checks and fares. */
export function compactRun(run) {
  const r = run.result;
  const choices = { baseline: {}, intervention: {} }, fares = {};
  for (const arm of ['baseline', 'intervention']) {
    for (const e of r.runs[arm].events) {
      if (e.action === 'choose_trip') {
        choices[arm][`${e.tick}:${e.actor}:${e.trip_id}`] = { chosen: e.chosen, options: e.options, reason: e.reason || null, provider: e.provider || null, purpose: e.purpose };
      } else if (e.action === 'pay_fare') {
        const p = r.personas.find((x) => x.id === e.actor);
        const key = `${arm}:${p ? p.fare_category : 'unknown'}`;
        fares[key] = Math.max(fares[key] || 0, e.amount_cad);
      }
    }
  }
  const changed = [];
  for (const [key, b] of Object.entries(choices.baseline)) {
    const i = choices.intervention[key];
    if (i && i.chosen !== b.chosen) {
      const [tick, actor, trip] = key.split(':');
      changed.push({ key, tick: +tick, actor, trip, from: b.chosen, to: i.chosen, reason: i.reason });
    }
  }
  return {
    policy: run.policy, policy_text: run.policy_text, label: run.label, saved_at: run.saved_at, backend: run.backend,
    file: run.file, sample: !!run.sample, request: run.request || null,
    question: r.scenario.question, ticks: r.scenario.ticks, policy_start: r.scenario.policy_start,
    model: run.meta ? `${run.meta.model} (${run.meta.effort} effort)` : null,
    calls: run.meta ? run.meta.calls : null, cost_usd: run.meta ? run.meta.cost_usd : null,
    totals: run.totals, checks: { changed_decisions: run.checks.changed_decisions, bloor_cyclists: run.checks.bloor_cyclists, fare_elasticity: run.checks.fare_elasticity },
    summary: run.summary ? run.summary.summary : null,
    assumptions: r.assumptions.map((a) => ({ id: a.id, kind: a.kind, note: a.note })),
    fares, choices, changed,
    personas: r.personas.map((p) => compactPersona(p)),
  };
}

/* One saved poll reduced to stances. */
export function compactPoll(poll) {
  const answers = {};
  for (const [id, a] of Object.entries(poll.answers || {})) answers[id] = { stance: a.stance || a.choice || null, affected: a.affected || null, reason: a.reason || null };
  return { question: poll.question, label: poll.label, saved_at: poll.saved_at, answers };
}

/* Everything the viewer needs. `agents` is the agents.json object; `runs` maps policy -> saved run. */
export function buildPersonaData({ agents, runs, poll }) {
  const people = {};
  for (const a of agents.agents) people[a.id] = compactPersona(a);
  const out = { schema: 'viewer3d-personas-v1', attribution: agents.attribution || null, note: agents.note || null, personas: people, runs: {}, poll: poll ? compactPoll(poll) : null };
  for (const [k, run] of Object.entries(runs)) if (run) { const c = compactRun(run); delete c.personas; out.runs[k] = c; }
  return out;
}
