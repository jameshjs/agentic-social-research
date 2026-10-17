#!/usr/bin/env node
/* Live provider smoke test. Never send the API key to browser code. */
'use strict';
const { runExperiment } = require('./runner');
const fixtures = require('./fixtures');
const { createVultrDecisionProvider } = require('./vultr-decision');

async function main() {
  const name = process.argv[2] || 'fare';
  if (!['fare', 'bike'].includes(name)) throw new Error('Usage: node experiment/run-vultr.js fare|bike [seed]');
  const seed = process.argv[3] === undefined ? 42 : Number(process.argv[3]);
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer');
  let calls = 0;
  let inputTokens = 0;
  const decide = createVultrDecisionProvider({
    model: process.env.VULTR_DECISION_MODEL || 'clef',
    onResponse: ({ usage }) => { calls++; inputTokens += usage?.input_tokens || 0; },
  });
  const result = await runExperiment(fixtures[name], { seed, decide });
  const warnings = result.runs.baseline.warnings.length + result.runs.intervention.warnings.length;
  process.stderr.write(`Vultr responses: ${calls}; billed input tokens reported: ${inputTokens}; fallback warnings: ${warnings}\n`);
  if (warnings) throw new Error('Live run had decision fallbacks; use the offline fixture for a clean demo or inspect the warnings before using this result');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message || error}\n`); process.exitCode = 1; });
