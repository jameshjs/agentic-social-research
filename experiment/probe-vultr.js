#!/usr/bin/env node
/* Small paired mobility probe before committing to a full paid live run. */
'use strict';
const { performance } = require('node:perf_hooks');
const { runExperiment } = require('./runner');
const fixtures = require('./fixtures');
const { createVultrDecisionProvider } = require('./vultr-decision');

const PEOPLE = { fare: ['nadia', 'maria', 'ravi', 'jun'], bike: ['leila', 'priya', 'theo', 'marta'] };

async function pairedCases() {
  const cases = [];
  for (const name of ['fare', 'bike']) {
    const fixture = fixtures[name];
    const captured = [];
    await runExperiment(fixture, { decide: async (request) => { captured.push(request); return null; } });
    for (const person of PEOPLE[name]) {
      const firstTrip = fixture.personas.find((p) => p.id === person).routine[0].id;
      const rows = captured.filter((r) => r.tick === fixture.policy_start && r.person.id === person && r.trip.id === firstTrip);
      const baseline = rows.find((r) => name === 'fare'
        ? r.environment.adult_fare_cad === fixture.environment.adult_fare_cad
        : r.environment.bike_lane_protected === fixture.environment.bike_lane_protected);
      const proposal = rows.find((r) => name === 'fare'
        ? r.environment.adult_fare_cad !== fixture.environment.adult_fare_cad
        : r.environment.bike_lane_protected !== fixture.environment.bike_lane_protected);
      if (!baseline || !proposal) throw new Error(`Missing paired state for ${name}/${person}`);
      cases.push({ scenario: name, person, baseline, proposal, focal_action: name === 'fare' ? 'bus' : 'bike_bloor' });
    }
  }
  return cases;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

async function main() {
  const cases = await pairedCases();
  if (process.argv.includes('--dry-run')) {
    process.stdout.write(`${JSON.stringify(cases.map(({ scenario, person, baseline, proposal, focal_action }) => ({ scenario, person, focal_action,
      baseline: { fare: baseline.environment.adult_fare_cad, protected: baseline.environment.bike_lane_protected, options: baseline.options.map((o) => o.action) },
      proposal: { fare: proposal.environment.adult_fare_cad, protected: proposal.environment.bike_lane_protected, options: proposal.options.map((o) => o.action) } })), null, 2)}\n`);
    return;
  }
  const model = process.env.VULTR_DECISION_MODEL || 'clef';
  const decide = createVultrDecisionProvider({ model });
  const rows = [];
  for (const item of cases) {
    const answers = {};
    for (const arm of ['baseline', 'proposal']) {
      const start = performance.now();
      try {
        const answer = await decide(item[arm]);
        answers[arm] = { action: answer.action, focal_probability: answer.probabilities?.[item.focal_action] ?? null,
          model_confidence: answer.model_confidence, input_tokens: answer.usage?.input_tokens ?? null,
          latency_ms: Math.round(performance.now() - start) };
      } catch (error) {
        answers[arm] = { error: String(error.message || error), latency_ms: Math.round(performance.now() - start) };
      }
    }
    rows.push({ scenario: item.scenario, person: item.person, focal_action: item.focal_action,
      ...answers, focal_probability_delta: Number.isFinite(answers.baseline.focal_probability) && Number.isFinite(answers.proposal.focal_probability)
        ? Math.round((answers.proposal.focal_probability - answers.baseline.focal_probability) * 1000) / 1000 : null });
  }
  const attempts = rows.flatMap((r) => [r.baseline, r.proposal]);
  const summary = { model, paired_people: rows.length, calls: attempts.length,
    errors: attempts.filter((r) => r.error).length,
    median_latency_ms: median(attempts.filter((r) => !r.error).map((r) => r.latency_ms)),
    p95_latency_ms: percentile(attempts.filter((r) => !r.error).map((r) => r.latency_ms), .95),
    reported_input_tokens: attempts.reduce((sum, r) => sum + (r.input_tokens || 0), 0),
    note: 'Action probabilities and directional checks are face-validity diagnostics, not observed travel responses or policy effect estimates.' };
  process.stdout.write(`${JSON.stringify({ summary, rows }, null, 2)}\n`);
  if (summary.errors) process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error.message || error}\n`); process.exitCode = 1; });
