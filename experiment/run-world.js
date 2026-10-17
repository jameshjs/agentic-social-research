#!/usr/bin/env node
/* Print a paired RunResult for the mapped Bathurst–Spadina section.
 * Usage: node experiment/run-world.js fare|bike [seed] */
const { runWorldExperiment } = require('./world-runner');
const fixtures = require('./world-fixtures');
const world = require('../data/world/bloor_spadina_bathurst.json');

async function main() {
  const name = process.argv[2] || 'fare';
  if (!['fare', 'bike'].includes(name)) {
    process.stderr.write('Usage: node experiment/run-world.js fare|bike [seed]\n');
    process.exitCode = 2;
    return;
  }
  const seed = process.argv[3] === undefined ? 42 : Number(process.argv[3]);
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer');
  const started = Date.now();
  const result = await runWorldExperiment(fixtures[name], { world, seed });
  process.stderr.write(`${name}: ${result.changed_decisions.length} changed decisions, ${result.runs.baseline.events.length + result.runs.intervention.events.length} events, ${Date.now() - started} ms\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
