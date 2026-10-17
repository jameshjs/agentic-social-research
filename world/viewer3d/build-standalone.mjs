// Builds world/viewer3d/standalone.html: index.html with the world JSON, world/sandbox.js and
// viewer.js inlined, so the page opens from a file or an attachment. three.js still loads from
// the pinned CDN version in the import map. Reads its inputs; writes only standalone.html.
//
//   node world/viewer3d/build-standalone.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const read = (p) => fs.readFileSync(p, 'utf8');

let html = read(path.join(here, 'index.html'));
const json = read(path.join(repo, 'data', 'world', 'bloor_spadina_bathurst.json')).trim();
JSON.parse(json);                                           // fail early on a bad file
const sandbox = read(path.join(repo, 'world', 'sandbox.js'));
const viewer = read(path.join(here, 'viewer.js'));

// Keep inlined text from closing the <script> element early.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const swaps = [
  ['<script src="../sandbox.js"></script>', () => `<script>/* world/sandbox.js, inlined unchanged */\n${safe(sandbox)}\n</script>`],
  ['<script type="module" src="./viewer.js"></script>', () => `<script>window.__BLOOR_WORLD__ = ${safe(json)};</script>\n<script type="module">\n${safe(viewer)}\n</script>`],
];
for (const [from, to] of swaps) {
  if (!html.includes(from)) throw new Error(`index.html no longer contains ${from}`);
  html = html.replace(from, to);
}
const out = path.join(here, 'standalone.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(repo, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
