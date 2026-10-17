// Builds world/viewer3d/personas.json from the persona runtime's committed outputs (read-only):
//   persona-swarm/data/city/agents.json                 the 100 persona bundles
//   persona-swarm/data/city/live/samples/*-run-fare.json  newest saved fare run
//   persona-swarm/data/city/live/samples/*-run-bloor.json newest saved Bloor run
//   persona-swarm/data/city/live/samples/*-poll.json      newest saved poll
// Pass --live to prefer newer saves in persona-swarm/data/city/live/ (git-ignored) over the samples.
//
//   node world/viewer3d/build-personas.mjs [--live]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPersonaData } from './personas-adapter.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const city = path.resolve(here, '..', '..', 'persona-swarm', 'data', 'city');
const dirs = [path.join(city, 'live', 'samples')];
if (process.argv.includes('--live')) dirs.unshift(path.join(city, 'live'));
const newest = (suffix) => {
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const f = fs.readdirSync(d).filter((n) => n.endsWith(suffix)).sort().pop();
    if (f) return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
  }
  return null;
};
const agents = JSON.parse(fs.readFileSync(path.join(city, 'agents.json'), 'utf8'));
const data = buildPersonaData({ agents, runs: { fare: newest('-run-fare.json'), bloor: newest('-run-bloor.json') }, poll: newest('-poll.json') });
const out = path.join(here, 'personas.json');
fs.writeFileSync(out, JSON.stringify(data));
console.log(`wrote world/viewer3d/personas.json (${(fs.statSync(out).size / 1024).toFixed(0)} KB): ${Object.keys(data.personas).length} personas, runs ${Object.entries(data.runs).map(([k, r]) => `${k} from ${r.file}`).join(', ')}`);
