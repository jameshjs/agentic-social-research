#!/usr/bin/env node
const { runExperiment } = require('./runner');
const fixtures = require('./fixtures');

async function main() {
  const name = process.argv[2] || 'fare';
  if (!['fare', 'bike'].includes(name)) {
    process.stderr.write('Usage: node experiment/run.js fare|bike [seed]\n');
    process.exitCode = 2;
    return;
  }
  const seed = process.argv[3] === undefined ? 42 : Number(process.argv[3]);
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer');
  const result = await runExperiment(fixtures[name], { seed });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
