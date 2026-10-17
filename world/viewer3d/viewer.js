/* Bloor St W 3D viewer: a read-only three.js view of data/world/bloor_spadina_bathurst.json.
 * The world is deep-cloned and frozen before use, so neither this file nor world/sandbox.js can
 * change it. Agents come from a seeded world/sandbox.js run (its `moved` events); streetcars and
 * Line 2 trains come from the GTFS trips-per-hour in the same JSON.
 *
 * Coordinates: the world's street-aligned frame (x metres east along Bloor from Bathurst, y metres
 * north of the Bloor centreline) maps to three.js as X = x, Y = height, Z = -y. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (id) => document.getElementById(id);
const loading = $('loading');

/* ---------- load the world, read-only ---------- */
function deepFreeze(o) {
  Object.freeze(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}
async function loadWorld() {
  if (window.__BLOOR_WORLD__) return window.__BLOOR_WORLD__;
  const res = await fetch(new URL('../../data/world/bloor_spadina_bathurst.json', import.meta.url));
  if (!res.ok) throw new Error(`HTTP ${res.status} loading the world JSON`);
  return res.json();
}

let W;
try {
  if (!window.BloorSandbox) throw new Error('world/sandbox.js did not load');
  W = deepFreeze(structuredClone(await loadWorld()));
} catch (e) {
  loading.classList.add('err');
  loading.innerHTML = `Could not load the Bloor world (${e.message}).<br>Serve the repository root, for example <code>python -m http.server 4173</code>, and open <code>/world/viewer3d/</code>.`;
  throw e;
}
const SB = window.BloorSandbox;
const L = W.frame.section_length_m;
const XS = W.bloor.intersections;

/* ---------- geometry helpers ---------- */
const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const theta = (W.frame.bloor_bearing_deg_ccw_from_east * Math.PI) / 180;
const [LAT0, LON0] = W.frame.origin_wgs84;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
function toLocal(lat, lon) {                    // same transform as world/build/section.py
  const e = (lon - LON0) * KX, n = (lat - LAT0) * KY, c = Math.cos(-theta), s = Math.sin(-theta);
  return [e * c - n * s, e * s + n * c];
}
/* The sandbox cross-section is schematic (car lanes +/-3 m, cycle track +/-7 m, sidewalks +/-12 m).
 * Bloor's curb is at +/-8.8 m (the crosswalks across Bloor are 16-18 m long), so the viewer maps
 * those schematic offsets into the drawn street. Display only; the sandbox is unchanged. */
const YK = [[0, 0], [3, 1.7], [7, 7.5], [12, 10.9], [150, 150], [1000, 1000]];
function mapY(y) {
  const a = Math.abs(y);
  for (let i = 1; i < YK.length; i++) if (a <= YK[i][0]) {
    const [x0, y0] = YK[i - 1], [x1, y1] = YK[i];
    return Math.sign(y) * (y0 + ((a - x0) / (x1 - x0)) * (y1 - y0));
  }
  return y;
}
const CURB = 8.8, SIDEWALK_OUT = 13;
const X0 = -200, X1 = 805, YMIN = -430, YMAX = 495;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const hms = (t) => { t = Math.max(0, Math.round(t)); return `${String(Math.floor(t / 3600) % 24).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const hm = (t) => hms(t).slice(0, 5);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const col = (c) => new THREE.Color(c);

/* Flat ribbon along a polyline (x, y pairs), lying at height h. */
function ribbon(pts, width, h, out) {
  const w = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const nx = (-dy / len) * w, ny = (dx / len) * w;
    // extend each piece by half a width so joints overlap instead of leaving notches
    const ex = (dx / len) * w * (i + 2 < pts.length ? 1 : 0), ey = (dy / len) * w * (i + 2 < pts.length ? 1 : 0);
    const q = [[ax + nx, ay + ny], [ax - nx, ay - ny], [bx + ex - nx, by + ey - ny], [bx + ex + nx, by + ey + ny]];
    for (const k of [0, 1, 2, 0, 2, 3]) out.push(q[k][0], h, -q[k][1]);
  }
  return out;
}
function rect(x0, y0, x1, y1, h, out) { return ribbon([[x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]], Math.abs(y1 - y0), h, out); }
function flatMesh(positions, material, receive = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Flat overlays all face up; materials are double-sided, so winding does not matter.
  const nrm = new Float32Array(positions.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(g, material); m.receiveShadow = receive; return m;
}
const GLOW = { value: 0.05 };
/* Adds an emissive term equal to the (instance) colour, so storefronts glow in their own tint at night. */
function glowing(mat, k = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.glow = GLOW;
    sh.fragmentShader = 'uniform float glow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * glow * ${k.toFixed(2)};`);
  };
  return mat;
}
const stdMat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, ...extra });

/* ---------- renderer, scene, camera ---------- */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 2, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 6; controls.maxDistance = 2600;
controls.screenSpacePanning = false;

const groups = {};
for (const k of ['ground', 'buildings', 'businesses', 'transit', 'cycling', 'signals', 'residents', 'agents', 'labels']) { groups[k] = new THREE.Group(); groups[k].name = k; scene.add(groups[k]); }
groups.residents.visible = false;

/* sky + fog */
const SKY = {
  day: { top: '#3f7fc4', horizon: '#cfe2f1', bottom: '#d9e3ea', sun: 2.6, sunColor: '#fff3e0', hemi: 0.85, hemiSky: '#cfe6ff', hemiGround: '#8a8f7a', exposure: 1.0, windows: 0, glow: 0.15, ground: '#aab59d' },
  night: { top: '#03060f', horizon: '#1b2740', bottom: '#0b1018', sun: 0.35, sunColor: '#9fb4ff', hemi: 0.22, hemiSky: '#3a4f7a', hemiGround: '#1a1a22', exposure: 1.15, windows: 1.25, glow: 1.6, ground: '#5d6657' },
};
const skyUniforms = { top: { value: col(SKY.day.top) }, horizon: { value: col(SKY.day.horizon) }, bottom: { value: col(SKY.day.bottom) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h * 1.6, 1.0), 0.7)) : mix(horizon, bottom, pow(min(-h * 3.0, 1.0), 0.5));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);
scene.fog = new THREE.Fog(col(SKY.day.horizon), 900, 3600);

const hemi = new THREE.HemisphereLight(col(SKY.day.hemiSky), col(SKY.day.hemiGround), SKY.day.hemi);
scene.add(hemi);
const sun = new THREE.DirectionalLight(col(SKY.day.sunColor), SKY.day.sun);
const CENTER = P(310, 0);
sun.position.copy(CENTER).add(new THREE.Vector3(-260, 420, 300));
sun.target.position.copy(CENTER);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 10, far: 1600 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

/* ---------- picking registry ---------- */
const pickables = [];
function pickable(obj, describe) { obj.userData.describe = describe; pickables.push(obj); return obj; }
const chip = (s) => (s ? `<span class="chip ${s}">${s === 'assumption' ? 'assumed' : s}</span>` : '');

/* ---------- ground, roads, sidewalks ---------- */
const MAT = {
  ground: stdMat(SKY.day.ground, { roughness: 1 }),
  asphalt: stdMat('#4a4f57', { roughness: 0.95 }),
  lane: stdMat('#5b6068', { roughness: 0.95 }),
  sidewalk: stdMat('#c9c4b8', { roughness: 0.95 }),
  path: stdMat('#d6cdb6', { roughness: 1 }),
  white: stdMat('#f2f2ee', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  yellow: stdMat('#f2c230', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  track: stdMat('#2f9e6f', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  rail: stdMat('#2a2d31', { roughness: 0.5, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
};
{
  const g = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), MAT.ground);
  g.rotation.x = -Math.PI / 2; g.position.set(310, 0, 0); g.receiveShadow = true;
  groups.ground.add(g);
}

// Side streets: each intersection leg runs straight out from Bloor (the City grid is aligned with
// Bloor in this frame), bending through the nearby non-Bloor signals on that street.
const LEG_W = { primary: 26, secondary: 17, tertiary: 12, residential: 8.5 };
const legPaths = [];
XS.forEach((n, i) => {
  for (const leg of n.legs) {
    const [street, cls, side] = leg.split('|');
    const s = side === 'north' ? 1 : -1;
    const via = W.signals.items.filter((g) => !g.on_bloor && Math.sign(g.y) === s && Math.abs(g.x - n.x) < 40).sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
    const pts = [[n.x, 0], ...via.map((g) => [g.x, g.y])];
    const last = pts[pts.length - 1];
    pts.push([last[0], s > 0 ? YMAX : YMIN]);
    legPaths.push({ street, cls, side, i, pts, width: LEG_W[cls] || 9 });
  }
});
{
  const road = [], lane = [], walk = [], path = [];
  rect(X0, -CURB, X1, CURB, 0.05, road);                               // Bloor curb to curb (from crosswalk lengths)
  rect(X0, CURB, X1, SIDEWALK_OUT, 0.14, walk); rect(X0, -SIDEWALK_OUT, X1, -CURB, 0.14, walk);
  for (const lp of legPaths) ribbon(lp.pts, lp.width, 0.04, road);
  for (const s of W.walk_network.segments) {                         // City pedestrian network
    if (s.crosswalk) continue;
    if (s.road_type === 'Laneway') ribbon(s.path, 4.5, 0.03, lane);
    else if (s.road_type === 'Walkway' || s.road_type === 'Trail') ribbon(s.path, 2.4, 0.13, path);
    else if (s.sidewalk && /Sidewalk|walkway/i.test(s.sidewalk)) ribbon(s.path, 2.6, 0.13, walk);
  }
  groups.ground.add(flatMesh(road, MAT.asphalt), flatMesh(lane, MAT.lane), flatMesh(walk, MAT.sidewalk), flatMesh(path, MAT.path));
}
const legHalf = (i) => Math.max(5, ...legPaths.filter((l) => l.i === i).map((l) => l.width / 2));
const inBox = (x) => XS.some((n, i) => Math.abs(x - n.x) < legHalf(i) + 1.5);

/* lane markings and the cycle track */
const TRACK = {};
{
  const white = [], yellow = [], green = [], greenDash = [];
  const spans = [];                                                   // Bloor x-ranges between intersection boxes
  let x = X0;
  const boxes = XS.map((n, i) => [n.x - legHalf(i) - 1.5, n.x + legHalf(i) + 1.5]).sort((a, b) => a[0] - b[0]);
  for (const [a, b] of boxes) { if (a > x) spans.push([x, a]); x = Math.max(x, b); }
  spans.push([x, X1]);
  for (const [a, b] of spans) {
    rect(a, 0.08, b, 0.2, 0.08, yellow); rect(a, -0.2, b, -0.08, 0.08, yellow);
    for (const s of [1, -1]) rect(a, s * 3.25, b, s * 3.4, 0.08, white);
  }
  // Cycle track paint wherever the City cycling network has a Bloor St W "Cycle Track" segment.
  const ct = W.cycling_network.segments.filter((s) => s.street === 'Bloor St W' && s.infrastructure === 'Cycle Track');
  let cx0 = Infinity, cx1 = -Infinity;
  for (const s of ct) for (const p of s.paths.flat()) { cx0 = Math.min(cx0, p[0]); cx1 = Math.max(cx1, p[0]); }
  cx0 = Math.max(cx0, X0); cx1 = Math.min(cx1, X1);
  for (const [a, b] of spans) {
    const lo = Math.max(a, cx0), hi = Math.min(b, cx1);
    if (hi > lo) for (const s of [1, -1]) rect(lo, s * 6.4, hi, s * 8.5, 0.07, green);
  }
  for (const [a, b] of boxes) for (let k = a; k < b - 1; k += 2.4) for (const s of [1, -1]) rect(k, s * 6.6, k + 1.2, s * 8.3, 0.07, greenDash);
  // Stop bars at the four Bloor signals.
  XS.forEach((n, i) => { if (!n.signal_px) return; const h = legHalf(i) + 4; rect(n.x - h - 0.5, -CURB, n.x - h, 0, 0.09, white); rect(n.x + h, 0, n.x + h + 0.5, CURB, 0.09, white); });
  // Crosswalks (City pedestrian network): ladder bars spaced along each crossing.
  for (const c of W.crosswalks.items) {
    const [ax, ay] = c.a, [bx, by] = c.b, len = Math.hypot(bx - ax, by - ay);
    if (len < 1) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len, wid = c.type === 'signalized' ? 3.6 : 2.8;
    for (let d = 0.4; d < len - 0.3; d += 1.1) {
      const cxp = ax + ux * d, cyp = ay + uy * d;
      ribbon([[cxp - (-uy) * wid / 2, cyp - ux * wid / 2], [cxp + (-uy) * wid / 2, cyp + ux * wid / 2]], 0.55, 0.1, white);
    }
  }
  groups.ground.add(flatMesh(white, MAT.white), flatMesh(yellow, MAT.yellow));
  const trackPaint = flatMesh(green, MAT.track), trackDash = flatMesh(greenDash, MAT.track);
  groups.cycling.add(trackPaint, trackDash);
  TRACK.paint = [trackPaint, trackDash];
  pickable(trackPaint, () => ({ title: 'Bloor St W cycle track', kind: 'Cycle track', status: 'observed',
    rows: [['Infrastructure', `Cycle Track ${chip('observed')}`], ['Installed', ct.map((s) => s.installed).filter((v, i, a) => a.indexOf(v) === i).join(', ')],
      ['Segments', ct.map((s) => `${s.from} → ${s.to}`).join('<br>')], ['Sandbox policy now', `${state.policy.bloor_cycle_track} ${chip('simulated')}`]],
    note: 'Paint drawn where the City Cycling Network has a Bloor St W cycle-track segment. Lateral position is schematic.' }));
  // Flexiposts on the protected track.
  const posts = [];
  for (const [a, b] of spans) for (let k = Math.max(a, cx0) + 2; k < Math.min(b, cx1) - 2; k += 6) for (const s of [1, -1]) posts.push([k, s * 6.2]);
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), stdMat('#f4f4f0', { emissive: '#ffffff', emissiveIntensity: 0.05 }), posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([px, py], k) => pm.setMatrixAt(k, m4.makeTranslation(px, 0.5, -py)));
  groups.cycling.add(pm);
  TRACK.posts = pm;
  // Other City cycling network routes (sharrows, signed routes, contraflow lanes).
  const other = [];
  for (const s of W.cycling_network.segments) if (s.street !== 'Bloor St W') for (const p of s.paths) ribbon(p, s.infrastructure.startsWith('Bike Lane') ? 1.4 : 0.7, 0.09, other);
  const om = flatMesh(other, stdMat('#38b07a', { roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, transparent: true, opacity: 0.85 }));
  groups.cycling.add(om);
  pickable(om, (hit) => {
    const p = hit.point, x = p.x, y = -p.z;
    let best = null, bd = Infinity;
    for (const s of W.cycling_network.segments) if (s.street !== 'Bloor St W') for (const path of s.paths) for (const q of path) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = s; } }
    return best && { title: `${best.street} cycling route`, kind: 'Cycling network', status: 'observed',
      rows: [['Infrastructure', `${esc(best.infrastructure)} ${chip('observed')}`], ['From → to', `${esc(best.from)} → ${esc(best.to)}`], ['Installed', best.installed ?? 'n/a']] };
  });
}

/* ---------- buildings ---------- */
function canvasTex(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
const BAY = 4, FLOOR = W.population.floor_height_m || 3.2, BAYS = 8;
const facadeTex = canvasTex((g, s) => {
  const cw = s / BAYS, ch = s / BAYS;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < BAYS; i++) for (let j = 0; j < BAYS; j++) {
    g.fillStyle = '#b4bfc9'; g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.25, cw * 0.56, ch * 0.45);
    g.fillStyle = '#e8e6e0'; g.fillRect(i * cw + cw * 0.15, j * ch + ch * 0.72, cw * 0.7, ch * 0.05);
  }
});
const litTex = canvasTex((g, s) => {
  const cw = s / BAYS, ch = s / BAYS;
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < BAYS; i++) for (let j = 0; j < BAYS; j++) {
    const r = hash(`lit${i},${j}`);
    if (r < 0.42) { const a = 0.45 + 0.55 * hash(`b${i},${j}`); g.fillStyle = `rgba(255,${190 + Math.round(40 * r)},120,${a})`; g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.25, cw * 0.56, ch * 0.45); }
  }
});
for (const t of [facadeTex, litTex]) t.repeat.set(1 / (BAY * BAYS), 1 / (FLOOR * BAYS));
litTex.colorSpace = THREE.SRGBColorSpace;

const USE_COL = { residential: '#eadfca', mixed: '#e6c998', non_residential: '#cdcbe0', unknown: '#ddd9d1' };
const resMax = Math.max(...W.buildings.items.map((b) => (b.residents_est || 0) / Math.max(1, b.floor_area_m2_est || 1)));
function heatColor(v) { const c = new THREE.Color(); c.setHSL(0.14 - 0.14 * v, 0.85, 0.75 - 0.35 * v); return c; }
function residentsColor(b) {
  if (!b.residents_est) return col('#9aa1a8');
  return heatColor(Math.min(1, Math.sqrt(((b.residents_est || 0) / Math.max(1, b.floor_area_m2_est || 1)) / resMax)));
}

function footprintRing(b) {
  let ring = b.footprint.map(([x, y]) => new THREE.Vector2(x, y));
  if (ring.length > 1 && ring[0].distanceTo(ring[ring.length - 1]) < 0.01) ring.pop();
  ring = ring.filter((p, i) => p.distanceTo(ring[(i + 1) % ring.length]) > 0.05);
  if (ring.length < 3) return null;
  if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
  return ring;
}
/* Walls (with per-metre UVs for the window texture) and a triangulated roof for one footprint. */
function buildingParts(b, ring, base = 0, pad = 0) {
  const h = Math.max(2.5, b.height_m || 3) + pad;
  const walls = [], wuv = [], wn = [], roof = [];
  let u = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length], len = a.distanceTo(c);
    const nx = (c.y - a.y) / len, ny = -(c.x - a.x) / len;            // outward normal for a CCW ring (y north)
    const ox = nx * pad, oy = ny * pad;
    const A0 = [a.x + ox, base, -(a.y + oy)], C0 = [c.x + ox, base, -(c.y + oy)], C1 = [c.x + ox, base + h, -(c.y + oy)], A1 = [a.x + ox, base + h, -(a.y + oy)];
    walls.push(...A0, ...C0, ...C1, ...A0, ...C1, ...A1);               // counter-clockwise seen from outside
    wuv.push(u, 0, u + len, 0, u + len, h, u, 0, u + len, h, u, h);
    for (let k = 0; k < 6; k++) wn.push(nx, 0, -ny);
    u += len;
  }
  let tris = [];
  try { tris = THREE.ShapeUtils.triangulateShape(ring, []); } catch (e) { tris = []; }
  for (let [i, j, k] of tris) {
    const a = ring[i], b = ring[j], c = ring[k];
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) [j, k] = [k, j];   // CCW in (x, y) faces up
    for (const v of [ring[i], ring[j], ring[k]]) roof.push(v.x, base + h, -v.y);
  }
  return { walls, wuv, wn, roof, h };
}
const BUILD = { items: [], wallTri: [], roofTri: [], wallUse: null, wallRes: null, roofUse: null, roofRes: null };
let wallMesh, roofMesh;
{
  const wp = [], wu = [], wn = [], wcU = [], wcR = [], rp = [], rcU = [], rcR = [];
  W.buildings.items.forEach((b, bi) => {
    const ring = footprintRing(b); if (!ring) return;
    const parts = buildingParts(b, ring);
    const cu = col(USE_COL[b.use] || USE_COL.unknown).offsetHSL(0, 0, (hash(b.id) - 0.5) * 0.08), cr = residentsColor(b);
    for (let k = 0; k < parts.walls.length / 3; k++) { wcU.push(cu.r, cu.g, cu.b); wcR.push(cr.r, cr.g, cr.b); }
    for (let k = 0; k < parts.walls.length / 9; k++) BUILD.wallTri.push(bi);
    const ru = cu.clone().multiplyScalar(0.82), rr = cr.clone().multiplyScalar(0.9);
    for (let k = 0; k < parts.roof.length / 3; k++) { rcU.push(ru.r, ru.g, ru.b); rcR.push(rr.r, rr.g, rr.b); }
    for (let k = 0; k < parts.roof.length / 9; k++) BUILD.roofTri.push(bi);
    wp.push(...parts.walls); wu.push(...parts.wuv); wn.push(...parts.wn); rp.push(...parts.roof);
  });
  BUILD.wallUse = new Float32Array(wcU); BUILD.wallRes = new Float32Array(wcR); BUILD.roofUse = new Float32Array(rcU); BUILD.roofRes = new Float32Array(rcR);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  wg.setAttribute('color', new THREE.BufferAttribute(BUILD.wallUse.slice(), 3));
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.computeVertexNormals();
  rg.setAttribute('color', new THREE.BufferAttribute(BUILD.roofUse.slice(), 3));
  MAT.wall = new THREE.MeshStandardMaterial({ vertexColors: true, map: facadeTex, emissiveMap: litTex, emissive: col('#ffd8a0'), emissiveIntensity: 0, roughness: 0.85 });
  MAT.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  wallMesh = new THREE.Mesh(wg, MAT.wall); roofMesh = new THREE.Mesh(rg, MAT.roof);
  for (const m of [wallMesh, roofMesh]) { m.castShadow = m.receiveShadow = true; groups.buildings.add(m); }
  const describe = (tri) => (hit) => describeBuilding(W.buildings.items[tri[hit.faceIndex]]);
  pickable(wallMesh, describe(BUILD.wallTri)); pickable(roofMesh, describe(BUILD.roofTri));
}
const bizById = new Map(W.businesses.items.map((b) => [b.id, b]));
const buildingById = new Map(W.buildings.items.map((b) => [b.id, b]));
function describeBuilding(b) {
  if (!b) return null;
  const biz = (b.business_ids || []).map((id) => bizById.get(id)).filter(Boolean);
  return { title: b.address || `Building ${b.id}`, kind: 'Building', status: 'observed', obj: b,
    rows: [['Height', `${b.height_m} m ${chip('observed')}<br><span class="note">${esc(b.height_source || '')}, City 3D Massing 2025</span>`],
      ['Floors', `~${b.floors_est} ${chip('derived')}`], ['Floor area', `~${(b.floor_area_m2_est || 0).toLocaleString()} m² ${chip('derived')}`],
      ['Use', `${esc(b.use)} ${chip('derived')}<br><span class="note">OSM building tag: ${esc(b.osm_building || 'untagged')}</span>`],
      ['Residents', b.residents_est != null ? `≈ ${b.residents_est} ${chip('derived')}` : 'n/a'],
      ['Neighbourhood', esc(b.neighbourhood || 'n/a')],
      ['Businesses', biz.length ? biz.map((x) => `${esc(x.name || x.kind)} <span class="note">(${esc(x.category)})</span>`).join('<br>') : 'none mapped']],
    note: 'Residents are a dasymetric estimate: 2021 neighbourhood population spread over floor area.' };
}
// Hover highlight for one building.
const hlMat = new THREE.MeshBasicMaterial({ color: '#5ab0ff', transparent: true, opacity: 0.35, depthWrite: false });
let hlMesh = null, hlFor = null;
function highlightBuilding(b) {
  if (hlFor === b) return;
  if (hlMesh) { scene.remove(hlMesh); hlMesh.geometry.dispose(); hlMesh = null; }
  hlFor = b;
  if (!b) return;
  const ring = footprintRing(b); if (!ring) return;
  const parts = buildingParts(b, ring, 0, 0.25);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...parts.walls, ...parts.roof], 3));
  hlMesh = new THREE.Mesh(g, hlMat); scene.add(hlMesh);
}

/* ---------- residents (derived estimate) ---------- */
{
  const grid = W.population.grid, cells = grid.cells, max = Math.max(...cells.map((c) => c.residents_est));
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(grid.cell_m * 0.94, 0.3, grid.cell_m * 0.94), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), cells.length);
  const m4 = new THREE.Matrix4();
  cells.forEach((c, k) => {
    const x = grid.origin[0] + (c.i + 0.5) * grid.cell_m, y = grid.origin[1] + (c.j + 0.5) * grid.cell_m;
    m.setMatrixAt(k, m4.makeTranslation(x, 0.35, -y));
    m.setColorAt(k, heatColor(Math.sqrt(c.residents_est / max)));
  });
  m.renderOrder = 2;
  groups.residents.add(m);
  pickable(m, (hit) => { const c = cells[hit.instanceId]; return { title: `${c.residents_est} residents (25 m cell)`, kind: 'Population grid', status: 'derived',
    rows: [['Residents', `≈ ${c.residents_est} ${chip('derived')}`], ['Section total', `≈ ${W.population.section_residents_est.toLocaleString()}`], ['Method', esc(W.population.method)]],
    note: W.population.limits.map(esc).join(' · ') }; });
}

/* ---------- businesses ---------- */
const CAT_COL = { food_service: '#e8553d', food_retail: '#f39c2c', retail: '#2f7fe0', service: '#8a5cf0', office: '#2fb3a5', vacant: '#80868e' };
const CAT_NAME = { food_service: 'Food service', food_retail: 'Food retail', retail: 'Retail', service: 'Service', office: 'Office', vacant: 'Vacant' };
{
  const front = W.businesses.items.filter((b) => b.on_bloor), back = W.businesses.items.filter((b) => !b.on_bloor);
  const awnGeo = mergeGeometries([new THREE.BoxGeometry(4.2, 0.18, 1.5).translate(0, 3.3, 0.75), new THREE.BoxGeometry(4.2, 0.9, 0.12).translate(0, 4.1, 0.05)]);
  MAT.awning = glowing(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const aw = new THREE.InstancedMesh(awnGeo, MAT.awning, front.length);
  const q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), m4 = new THREE.Matrix4();
  front.forEach((b, k) => {
    const s = b.side === 'north' ? 1 : -1, bld = buildingById.get(b.building_id);
    let face = 10.6;
    if (bld) { const ys = bld.footprint.map((p) => p[1] * s).filter((v) => v > 0); if (ys.length) face = Math.max(9.4, Math.min(...ys)); }
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s > 0 ? 0 : Math.PI);          // awning sticks out toward Bloor
    m4.compose(P(b.x, s * face), q, s1);
    aw.setMatrixAt(k, m4); aw.setColorAt(k, col(CAT_COL[b.category] || '#999'));
  });
  aw.castShadow = true;
  const pin = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.9), glowing(new THREE.MeshStandardMaterial({ roughness: 0.4 }), 1.5), back.length);
  back.forEach((b, k) => {
    const bld = buildingById.get(b.building_id), h = (bld ? bld.height_m : 6) + 3;
    pin.setMatrixAt(k, m4.compose(P(b.x, b.y, h), q.identity(), s1)); pin.setColorAt(k, col(CAT_COL[b.category] || '#999'));
  });
  groups.businesses.add(aw, pin);
  const describe = (list) => (hit) => { const b = list[hit.instanceId]; return { title: b.name || CAT_NAME[b.category] || b.kind, kind: 'Business', status: 'observed', obj: b,
    rows: [['Category', `${CAT_NAME[b.category] || b.category} <span class="sw" style="background:${CAT_COL[b.category]}"></span>`], ['OSM kind', esc(b.kind)], ['Address', esc(b.address || 'n/a')],
      ['Side', `${b.side}${b.on_bloor ? ', faces Bloor' : ''}`], ['Presence', `mapped ${chip('observed')}`]], note: esc(W.businesses.note) }; };
  pickable(aw, describe(front)); pickable(pin, describe(back));
}

/* ---------- transit: stations, Line 2, stops, streetcars ---------- */
const underMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false });
const L2Y = W.transit.stations.flatMap((s) => s.platforms.filter((p) => p.route === '2').map((p) => p.y));
const TUNNEL_Y = L2Y.reduce((a, b) => a + b, 0) / L2Y.length, TUNNEL_Z = -13;
{
  const tube = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 200, 3, 6), underMat('#3fbf88', 0.09));
  tube.position.copy(P((X0 + X1) / 2, TUNNEL_Y, TUNNEL_Z)); tube.renderOrder = 3; groups.transit.add(tube);
  for (const st of W.transit.stations) for (const pl of st.platforms) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(pl.route === '2' ? 150 : 10, 1, pl.route === '2' ? 4 : 150), underMat(pl.route === '2' ? '#7ee0b5' : '#f2c230', 0.18));
    m.position.copy(P(pl.x, pl.y, TUNNEL_Z - 1)); m.renderOrder = 3; groups.transit.add(m);
  }
  const lbl = (text, x, y, h, cls = 'lbl') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; const o = new CSS2DObject(d); o.position.copy(P(x, y, h)); groups.labels.add(o); return o; };
  lbl('Line 2 Bloor–Danforth (underground)', 160, TUNNEL_Y, -6, 'lbl sub');
  for (const st of W.transit.stations) {
    const cx = st.entrances.reduce((s, e) => s + e.x, 0) / st.entrances.length, cy = st.entrances.reduce((s, e) => s + e.y, 0) / st.entrances.length;
    lbl(st.name, cx, cy, 16, 'lbl stn');
  }
  // Entrance pavilions at their OSM positions.
  const pav = mergeGeometries([new THREE.BoxGeometry(6, 3.6, 4.5).translate(0, 1.8, 0), new THREE.BoxGeometry(6.6, 0.4, 5.1).translate(0, 3.8, 0)]);
  MAT.pav = new THREE.MeshStandardMaterial({ color: '#8fd3b4', roughness: 0.25, metalness: 0.1, emissive: '#3fbf88', emissiveIntensity: 0.1 });
  const ents = W.transit.stations.flatMap((st) => st.entrances.map((e) => ({ st, e })));
  const pm = new THREE.InstancedMesh(pav, MAT.pav, ents.length);
  const m4 = new THREE.Matrix4();
  ents.forEach(({ e }, k) => pm.setMatrixAt(k, m4.makeTranslation(e.x, 0, -e.y)));
  pm.castShadow = true; groups.transit.add(pm);
  pickable(pm, (hit) => { const { st, e } = ents[hit.instanceId]; return { title: `${st.name}: ${e.name} entrance`, kind: 'Subway entrance', status: 'observed', live: true,
    rows: () => st.platforms.map((p) => [p.name.replace(`${st.name} - `, ''), `${nextDeps(p.trips_by_hour, state.t, 3).map(hm).join(' · ') || 'no service'} <span class="note">(${p.trips_by_hour[String(Math.floor(state.t / 3600))] || 0}/h)</span>`])
      .concat([['Line 2 run', `${W.transit.line2_run_seconds.eastbound_bathurst_to_spadina_median} s EB, ${W.transit.line2_run_seconds.westbound_spadina_to_bathurst_median} s WB ${chip('observed')}`]]),
    note: `Scheduled departures, TTC GTFS service day ${W.transit.service_date}. Times within each hour are evenly spaced from trips per hour, the same rule world/sandbox.js uses for boarding.` }; });
  // Surface stops (bus and streetcar), grouped by stop_id.
  const stops = new Map();
  for (const d of W.transit.surface_departures) {
    const s = stops.get(d.stop_id) || stops.set(d.stop_id, { id: d.stop_id, name: d.stop_name, lat: d.lat, lon: d.lon, deps: [] }).get(d.stop_id);
    s.deps.push(d);
  }
  const stopList = [...stops.values()].map((s) => ({ ...s, xy: toLocal(s.lat, s.lon) }));
  STOPS = stopList;
  const sg = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.07, 3, 6).translate(0, 1.5, 0), new THREE.BoxGeometry(0.7, 0.9, 0.08).translate(0, 2.8, 0)]);
  const sm = new THREE.InstancedMesh(sg, glowing(new THREE.MeshStandardMaterial({ roughness: 0.5 })), stopList.length);
  stopList.forEach((s, k) => {
    sm.setMatrixAt(k, m4.makeTranslation(s.xy[0], 0, -s.xy[1]));
    sm.setColorAt(k, col(s.deps.some((d) => d.route_type === 0) ? '#e0362b' : '#c9504a'));
  });
  groups.transit.add(sm);
  pickable(sm, (hit) => { const s = stopList[hit.instanceId]; return { title: s.name, kind: `Stop ${s.id}`, status: 'observed', live: true,
    rows: () => s.deps.map((d) => [`${d.route} ${esc(d.route_name)}${d.route_type === 0 ? ' 🚋' : ''}<br><span class="note">${esc(d.headsign)}</span>`, nextDeps(d.trips_by_hour, state.t, 3).map(hm).join(' · ') || 'no service now']),
    note: `Scheduled (TTC GTFS ${W.transit.service_date}), evenly spaced within each hour. Not real-time and not observed reliability.` }; });
}
var STOPS;
function nextDeps(tbh, t, n = 3) {
  const out = [];
  for (let h = Math.floor(t / 3600); h < 28 && out.length < n; h++) {
    const k = tbh[String(h)]; if (!k) continue;
    const hw = 3600 / k;
    for (let i = 0; i < k && out.length < n; i++) { const d = h * 3600 + i * hw; if (d >= t) out.push(d); }
  }
  return out;
}
function depTimes(tbh, t0, t1) {
  const out = [];
  for (let h = Math.floor(t0 / 3600) - 1; h <= Math.floor(t1 / 3600) + 1; h++) { const k = tbh[String(h)]; if (!k) continue; for (let i = 0; i < k; i++) out.push(h * 3600 + (i * 3600) / k); }
  return out;
}

/* Scheduled vehicles. Each route direction is a polyline (x, y, height) with a reference stop whose
 * GTFS trips per hour give the times a vehicle passes it; position = reference + (t - time) * speed. */
function polyLen(pts) { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return s; }
function along(pts, cum, d) {
  d = Math.max(0, Math.min(cum[cum.length - 1], d));
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), a = pts[i - 1], b = pts[i];
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, h: (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * f, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function project(pts, cum, [x, y]) {
  let best = 0, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), px = a[0] + dx * f, py = a[1] + dy * f, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; best = cum[i - 1] + f * Math.sqrt(l2); }
  }
  return best;
}
const SCHED = [];
{
  const stopXY = (id) => STOPS.find((s) => s.id === id).xy;
  const bathX = -1.2, bStn = stopXY('14619'), sStn = stopXY('14816');
  const spa = [[642.5, YMIN], [641.2, -237.8], [629.6, -87], [627.5, -32, 0], [628, 8, -7], [sStn[0], sStn[1], -7]];
  const off = (pts, dx) => pts.map((p, i) => (i < 3 ? [p[0] + dx, p[1], p[2]] : p));
  const lines = [
    { route: '511', dir: '1', label: '511 Bathurst northbound', pts: [[bathX + 1.6, YMIN], [bathX + 1.6, 125], [bStn[0], bStn[1]]], speed: 6 },
    { route: '511', dir: '0', label: '511 Bathurst southbound', pts: [[bStn[0], bStn[1]], [bathX - 1.6, 125], [bathX - 1.6, YMIN]], speed: 6 },
    { route: '510', dir: '1', label: '510 Spadina northbound', pts: off(spa, 1.6), speed: 6 },
    { route: '510', dir: '0', label: '510 Spadina southbound', pts: off(spa, -1.6).reverse(), speed: 6 },
  ];
  const railPos = [];
  for (const ln of lines) {
    ln.cum = polyLen(ln.pts); ln.len = ln.cum[ln.cum.length - 1];
    const deps = W.transit.surface_departures.filter((d) => d.route === ln.route && d.direction_id === ln.dir);
    const ids = [...new Set(deps.map((d) => d.stop_id))];
    const ref = ids.map((id) => ({ id, s: project(ln.pts, ln.cum, stopXY(id)) })).sort((a, b) => a.s - b.s)[0];
    ln.refStop = ref.id; ln.refS = ref.s;
    const tbh = {};
    for (const d of deps.filter((x) => x.stop_id === ref.id)) for (const [h, k] of Object.entries(d.trips_by_hour)) tbh[h] = (tbh[h] || 0) + k;
    ln.tbh = tbh;
    for (const g of [-0.72, 0.72]) ribbon(ln.pts.filter((p) => !(p[2] < 0)).map((p) => [p[0] + g, p[1]]), 0.12, 0.09, railPos);
    SCHED.push({ ...ln, kind: 'streetcar', length: 30, width: 2.6, height: 3.6 });
  }
  groups.transit.add(flatMesh(railPos, MAT.rail));
  // Line 2: eastbound passes Bathurst's EB platform at each departure, westbound passes Spadina's WB platform.
  const plat = (st, name) => W.transit.stations.find((s) => s.id === st).platforms.find((p) => p.route === '2' && p.name.includes(name));
  const bEB = plat('bathurst', 'Eastbound'), sEB = plat('spadina', 'Eastbound'), sWB = plat('spadina', 'Westbound'), bWB = plat('bathurst', 'Westbound');
  const run = W.transit.line2_run_seconds;
  const eb = [[X0 - 400, TUNNEL_Y - 1.8, TUNNEL_Z], [X1 + 400, TUNNEL_Y - 1.8, TUNNEL_Z]], wb = [[X1 + 400, TUNNEL_Y + 1.8, TUNNEL_Z], [X0 - 400, TUNNEL_Y + 1.8, TUNNEL_Z]];
  SCHED.push({ route: '2', label: 'Line 2 eastbound', kind: 'subway', pts: eb, cum: polyLen(eb), refS: bEB.x - (X0 - 400), tbh: bEB.trips_by_hour, speed: (sEB.x - bEB.x) / run.eastbound_bathurst_to_spadina_median, length: 138, width: 3, height: 3.4 });
  SCHED.push({ route: '2', label: 'Line 2 westbound', kind: 'subway', pts: wb, cum: polyLen(wb), refS: (X1 + 400) - sWB.x, tbh: sWB.trips_by_hour, speed: (sWB.x - bWB.x) / run.westbound_spadina_to_bathurst_median, length: 138, width: 3, height: 3.4 });
  for (const s of SCHED) { s.len = s.cum[s.cum.length - 1]; s.deps = depTimes(s.tbh, 4 * 3600, 27 * 3600); }
}
// Vehicle meshes (pooled).
const VEH = [];
{
  const carBody = new THREE.MeshStandardMaterial({ color: '#d8322a', roughness: 0.45, emissive: '#ff6a40', emissiveIntensity: 0 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1c2630', roughness: 0.2, metalness: 0.3, emissive: '#ffe2a8', emissiveIntensity: 0 });
  MAT.carBody = carBody; MAT.carGlass = glass;
  for (const s of SCHED) for (let k = 0; k < 4; k++) {
    let g;
    if (s.kind === 'subway') {
      g = new THREE.Mesh(new THREE.BoxGeometry(s.length, s.height, s.width), underMat('#9ff0c9', 0.55));
      g.renderOrder = 4;
    } else {
      g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(s.length, 2.5, s.width), carBody); body.position.y = 1.45;
      const win = new THREE.Mesh(new THREE.BoxGeometry(s.length - 0.6, 1.1, s.width + 0.04), glass); win.position.y = 2.25;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(s.length - 2, 0.4, s.width - 0.4), stdMat('#e9e9e4')); roof.position.y = 3.0;
      for (const m of [body, win, roof]) { m.castShadow = true; g.add(m); }
    }
    g.visible = false; groups.transit.add(g);
    const v = { sched: s, mesh: g, dep: null };
    VEH.push(v);
    pickable(g, () => v.dep == null ? null : { title: s.label, kind: s.kind === 'subway' ? 'Subway train' : 'Streetcar', status: 'observed',
      rows: [['Scheduled at reference', `${hm(v.dep)} ${chip('observed')}`], ['Trips this hour', s.tbh[String(Math.floor(state.t / 3600))] || 0], ['Animated speed', `${s.speed.toFixed(1)} m/s ${chip(s.kind === 'subway' ? 'derived' : 'assumption')}`]],
      note: s.kind === 'subway' ? 'Line 2 departure times from GTFS trips per hour; speed from the observed median platform-to-platform run time.' : 'Departure times from GTFS trips per hour at the first stop on screen; in-between positions use an assumed 6 m/s, without dwell.' });
  }
}
function updateVehicles(t) {
  const used = new Map();
  for (const v of VEH) v.mesh.visible = false;
  for (const s of SCHED) {
    const pool = VEH.filter((v) => v.sched === s); let k = 0;
    for (const d of s.deps) {
      const pos = s.refS + (t - d) * s.speed;
      if (pos < -s.length || pos > s.len + (s.kind === 'streetcar' ? 0 : s.length)) continue;
      if (k >= pool.length) break;
      const v = pool[k++], p = along(s.pts, s.cum, pos - s.length / 2);
      v.dep = d; v.mesh.visible = true;
      v.mesh.position.copy(P(p.x, p.y, p.h + (s.kind === 'subway' ? 0 : 0.05)));
      v.mesh.rotation.y = p.yaw;
    }
    used.set(s, k);
  }
}

/* ---------- signals ---------- */
const SIG = [];
{
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8).translate(0, 2.3, 0);
  const headGeo = new THREE.BoxGeometry(0.45, 1.25, 0.45);
  const lampGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const poleMat = stdMat('#3b3f45', { roughness: 0.5, metalness: 0.5 });
  const mk = (c, on) => new THREE.MeshStandardMaterial({ color: on ? c : '#222', emissive: c, emissiveIntensity: on ? 2.2 : 0.04, roughness: 0.3 });
  const LAMP = { red: [mk('#ff3b30', 1), mk('#ff3b30', 0)], amber: [mk('#ffb020', 1), mk('#ffb020', 0)], green: [mk('#30d158', 1), mk('#30d158', 0)], walk: [mk('#f4f4f4', 1), mk('#f4f4f4', 0)], hand: [mk('#ff8a3d', 1), mk('#ff8a3d', 0)] };
  const head = (facing) => {
    const g = new THREE.Group(), box = new THREE.Mesh(headGeo, stdMat('#1d1f22')); g.add(box);
    const lamps = ['red', 'amber', 'green'].map((c, i) => { const l = new THREE.Mesh(lampGeo, LAMP[c][1]); l.position.set(0, 0.38 - i * 0.38, 0.24); g.add(l); return [c, l]; });
    g.rotation.y = facing; return { g, lamps };
  };
  for (const s of W.signals.items) {
    const n = XS.find((x) => x.signal_px === s.px), i = XS.indexOf(n);
    const corners = s.on_bloor && n ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [n.x + a * (legHalf(i) + 1.2), b * (CURB + 0.7)]) : [[s.x + 3, s.y]];
    const entry = { s, heads: [], peds: [] };
    for (const [cx, cy] of corners) {
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.copy(P(cx, cy)); pole.castShadow = true; groups.signals.add(pole);
      // A Bloor-facing head (traffic moving along Bloor) and a cross-street head.
      const hb = head(cx < (n ? n.x : cx) ? -Math.PI / 2 : Math.PI / 2); hb.g.position.copy(P(cx, cy, 4.2)); groups.signals.add(hb.g);
      const hc = head(cy > 0 ? Math.PI : 0); hc.g.position.copy(P(cx, cy, 3.3)); groups.signals.add(hc.g);
      entry.heads.push({ dir: 'bloor', ...hb }, { dir: 'cross', ...hc });
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), LAMP.hand[1]); ped.position.copy(P(cx, cy, 2.4)); groups.signals.add(ped);
      entry.peds.push(ped);
      for (const o of [pole, hb.g, hc.g]) pickable(o, () => describeSignal(entry));
    }
    entry.LAMP = LAMP;
    SIG.push(entry);
  }
}
function describeSignal(entry) {
  const s = entry.s, timed = s.on_bloor && !s.private_access;
  return { title: `Signal PX ${s.px}`, kind: esc(s.name), status: 'observed', live: true,
    rows: () => {
      const r = [['Control mode', esc(s.control_mode)], ['Approaches', esc(s.approaches)], ['Pedestrian walk speed', `${esc(s.ped_walk_speed)} ${chip('observed')}`], ['Transit pre-emption', s.transit_preempt ? 'yes' : 'no'], ['Activated', esc(s.activated)]];
      if (timed && state.sb) {
        const ph = state.sb.signalAt(s.px, state.t);
        r.unshift(['Phase now', `<b>${ph.phase.replace('_', ' ')}</b> (${Math.round(ph.c)} s into ${state.sb.plan.cycle} s cycle) ${chip('assumption')}`], ['Walk now', `${ph.walk ? ph.walk.replace('_', ' ') : "don't walk"} ${chip('assumption')}`]);
      } else r.unshift(['Phase now', 'not timed in the sandbox']);
      return r;
    },
    note: timed ? esc(W.signal_timing.why) : 'Only the four Bloor signals have assumed timing in world/sandbox.js.' };
}
function updateSignals(t) {
  for (const e of SIG) {
    const timed = e.s.on_bloor && !e.s.private_access && state.sb;
    const ph = timed ? state.sb.signalAt(e.s.px, t) : null;
    const want = (dir) => {
      if (!ph) return null;
      if (dir === 'bloor') return ph.phase === 'bloor_green' ? 'green' : ph.phase === 'bloor_clearance' ? 'amber' : 'red';
      return ph.phase === 'cross_green' ? 'green' : ph.phase === 'cross_clearance' ? 'amber' : 'red';
    };
    for (const h of e.heads) { const w = want(h.dir); for (const [c, l] of h.lamps) l.material = e.LAMP[c][w === c ? 0 : 1]; }
    for (const p of e.peds) p.material = ph ? (ph.walk === 'across_bloor' ? e.LAMP.walk[0] : e.LAMP.hand[0]) : e.LAMP.hand[1];
  }
}

/* ---------- cycling extras, parking ---------- */
{
  const m4 = new THREE.Matrix4();
  const bs = W.bike_share_stations.items;
  const dock = new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(7, 0.25, 1.4).translate(0, 0.12, 0), new THREE.BoxGeometry(0.5, 2.2, 0.5).translate(-3.2, 1.1, 0), new THREE.BoxGeometry(6, 0.9, 0.12).translate(0.3, 0.7, 0)]),
    new THREE.MeshStandardMaterial({ color: '#2b6cb0', roughness: 0.4, emissive: '#3d8bff', emissiveIntensity: 0.15 }), bs.length);
  bs.forEach((b, k) => dock.setMatrixAt(k, m4.makeTranslation(b.x, 0.14, -b.y)));
  dock.castShadow = true; groups.cycling.add(dock);
  pickable(dock, (hit) => { const b = bs[hit.instanceId]; return { title: b.name, kind: 'Bike Share station', status: 'observed', rows: [['Docks', `${b.capacity ?? 'n/a'} ${chip('observed')}`], ['Operator', esc(b.operator)]], note: 'Presence and capacity from OSM; no availability data.' }; });
  const bp = W.bike_parking.items;
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.4, 0.05, 6, 12, Math.PI).translate(0, 0.2, 0), stdMat('#9aa3ad', { metalness: 0.6, roughness: 0.4 }), bp.length);
  bp.forEach((b, k) => ring.setMatrixAt(k, m4.makeTranslation(b.x, 0.14, -b.y)));
  groups.cycling.add(ring);
  pickable(ring, (hit) => { const b = bp[hit.instanceId]; return { title: 'Bike parking', kind: 'Bike parking', status: 'observed', rows: [['Capacity', `${b.capacity ?? 'n/a'} ${chip('observed')}`]] }; });
  const cp = W.car_parking.items;
  const sign = new THREE.InstancedMesh(mergeGeometries([new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).translate(0, 1.3, 0), new THREE.BoxGeometry(1, 1, 0.1).translate(0, 2.8, 0)]), new THREE.MeshStandardMaterial({ color: '#2f6fd6', roughness: 0.4, emissive: '#2f6fd6', emissiveIntensity: 0.2 }), cp.length);
  cp.forEach((b, k) => sign.setMatrixAt(k, m4.makeTranslation(b.x, 0, -b.y)));
  groups.ground.add(sign);
  pickable(sign, (hit) => { const b = cp[hit.instanceId]; return { title: 'Car parking', kind: `${b.kind || 'parking'}`, status: 'observed', rows: [['Kind', esc(b.kind)], ['Access', esc(b.access || 'n/a')], ['Capacity', b.capacity ?? 'n/a']] }; });
}

/* ---------- labels ---------- */
{
  const mk = (text, x, y, h, cls = 'lbl') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; const o = new CSS2DObject(d); o.position.copy(P(x, y, h)); groups.labels.add(o); };
  for (const lp of legPaths) mk(lp.street, lp.pts[0][0], (lp.side === 'north' ? 1 : -1) * 55, 1.5);
  mk('Bloor St W', -120, 0, 1.2, 'lbl big'); mk('Bloor St W', 720, 0, 1.2, 'lbl big');
}

/* ---------- agents from a seeded sandbox run ---------- */
const AGENT_STYLE = {
  walk: { label: 'walking', palette: ['#f2c14e', '#f78154', '#4d9de0', '#e15554', '#3bb273', '#e1bc29', '#ffffff', '#ff9fb2'] },
  transit: { label: 'to/from transit', palette: ['#b79cff'] },
  bike: { label: 'cycling', palette: ['#30d158', '#7ee081'] },
  car: { label: 'driving', palette: ['#e8e8e8', '#2a2f36', '#9aa3ad', '#b33a3a', '#2e5aa8', '#c9a227', '#f4f4f4', '#556070'] },
};
const GEO = {
  walk: mergeGeometries([new THREE.CylinderGeometry(0.22, 0.26, 1.35, 8).translate(0, 0.68, 0), new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.55, 0)]),
  bike: mergeGeometries([new THREE.BoxGeometry(1.75, 0.6, 0.12).translate(0, 0.45, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.85, 8).translate(0, 1.15, 0), new THREE.SphereGeometry(0.17, 10, 8).translate(0.05, 1.7, 0)]),
  car: mergeGeometries([new THREE.BoxGeometry(4.4, 0.85, 1.85).translate(0, 0.6, 0), new THREE.BoxGeometry(2.3, 0.6, 1.65).translate(-0.25, 1.3, 0)]),
};
GEO.transit = GEO.walk;
const agentMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
const state = { t: 8 * 3600, start: 8 * 3600, end: 8.5 * 3600, playing: true, speed: 10, sb: null, base: null, agents: [], meshes: {}, policy: { ...SB.DEFAULT_POLICY }, follow: null, night: false, nightK: 0 };
const SEED = 7;

function runScenario(policy, start, minutes, density) {
  const sb = SB.createSandbox(W, { seed: SEED, policy });
  const nodes = [...sb.graph.nodes.values()], portals = nodes.filter((n) => n.kind === 'portal'), last = XS.length - 1;
  const doors = [...sb.graph.doors.values()].map((id) => sb.graph.nodes.get(id));
  // sb.rand is seeded but its FNV hash gives close values for similar keys; a murmur3 finalizer spreads them.
  const R = (...p) => {
    let h = Math.floor(sb.rand(...p) * 4294967296) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const pick = (arr, ...p) => arr[Math.floor(R(...p) * arr.length) % arr.length];
  const at = (i) => portals.filter((p) => p.intersection === i);
  let k = 0;
  const spawn = (mode, from, to, t, shop) => {
    if (!from || !to || from.id === to.id) return;
    const id = `${mode}-${++k}`;
    sb.addAgent({ id, mode, at: from.id, t });
    const r = sb.travel(id, to.id);
    if (shop && r.type === 'trip_completed') {
      sb.enter(id, pick(to.business_ids, id, 'biz'));
      sb.travel(id, pick(portals.filter((p) => p.id !== from.id), id, 'home').id);
    }
  };
  for (let t = start; t < start + minutes * 60; t += 900) {
    const f = sb.flowAt(t); if (!f) continue;
    const n = (v) => Math.round((v || 0) * density);
    const each = (count, tag, fn) => { for (let j = 0; j < count; j++) fn(t + R(tag, t, j) * 900, `${tag}${t}.${j}`); };
    const farOr = (key, end, alt) => (R(key, 'far') < 0.7 ? pick(at(end), key, 'd') : pick(alt, key, 'd'));
    each(n(f.eb_vehicles_in), 'ceb', (tt, key) => spawn('car', pick(at(0), key, 'o'), farOr(key, last, portals.filter((p) => p.intersection > 0)), tt));
    each(n(f.wb_vehicles_in), 'cwb', (tt, key) => spawn('car', pick(at(last), key, 'o'), farOr(key, 0, portals.filter((p) => p.intersection < last)), tt));
    each(n(f.eb_bikes_approach_bathurst), 'beb', (tt, key) => spawn('bike', pick(at(0), key, 'o'), farOr(key, last, portals.filter((p) => p.intersection > 0)), tt));
    each(n(f.wb_bikes_approach_spadina), 'bwb', (tt, key) => spawn('bike', pick(at(last), key, 'o'), farOr(key, 0, portals.filter((p) => p.intersection < last)), tt));
    each(n((f.peds_along_bloor_bathurst || 0) + (f.peds_along_bloor_spadina || 0)), 'w', (tt, key) => {
      const o = pick(portals, key, 'o');
      if (R(key, 'shop') < 0.6) spawn('walk', o, pick(doors, key, 'door'), tt, true); else spawn('walk', o, pick(portals, key, 'd'), tt);
    });
    for (const [i, v] of [[0, f.peds_crossing_bloor_bathurst], [last, f.peds_crossing_bloor_spadina]]) each(n((v || 0) * 0.5), `x${i}`, (tt, key) => {
      const [a, b] = R(key, 'dir') < 0.5 ? ['north', 'south'] : ['south', 'north'];
      spawn('walk', at(i).find((p) => p.side === a), at(i).find((p) => p.side === b), tt);
    });
    each(n(((f.peds_along_bloor_bathurst || 0) + (f.peds_along_bloor_spadina || 0)) * 0.2), 'tr', (tt, key) => {
      const west = portals.filter((p) => p.intersection <= 2), east = portals.filter((p) => p.intersection >= 5);
      const [o, d] = R(key, 'dir') < 0.5 ? [pick(west, key, 'o'), pick(east, key, 'd')] : [pick(east, key, 'o'), pick(west, key, 'd')];
      spawn('transit', o, d, tt);
    });
  }
  return sb;
}
function tripStats(sb) {
  const by = {};
  for (const e of sb.events) if (e.type === 'trip_completed') { const m = (by[e.mode] ||= { n: 0, dur: 0, wait: 0, shared: 0 }); m.n++; m.dur += e.duration_s; m.wait += e.wait_s; m.shared += e.shared_with_cars_m || 0; }
  return by;
}

/* Turn `moved` events into renderable segments in the viewer's display coordinates. */
function buildTimeline(sb) {
  const g = sb.graph, byActor = new Map();
  for (const e of sb.events) if (e.type === 'moved') (byActor.get(e.actor) || byActor.set(e.actor, []).get(e.actor)).push(e);
  const disp = (node, edge, mode, other) => {
    let x = node.x, y = mapY(node.y), h = 0.15;
    if (node.kind === 'station') h = -9;
    if (node.kind === 'portal') {
      if (mode === 'walk' || mode === 'transit') x = other.x;
      else { const south = edge.from === node.id ? other.y < node.y : node.y < other.y; x = node.x + (south ? -1 : 1) * (mode === 'bike' ? 3.6 : 2.0); }
    }
    if (node.kind === 'portal' || node.kind === 'lane' || node.kind === 'track') h = 0.05;
    return [x, y, h];
  };
  const agents = [];
  for (const [id, evs] of byActor) {
    const a = sb.agents.get(id), mode = a.mode, jitter = (hash(id) - 0.5) * (mode === 'walk' || mode === 'transit' ? 2.2 : mode === 'bike' ? 0.6 : 0.2);
    const segs = evs.map((e) => {
      const edge = g.edges.get(e.edge), A = g.nodes.get(edge.from), B = g.nodes.get(edge.to);
      const pa = disp(A, edge, mode, B), pb = disp(B, edge, mode, A);
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const endGate = !!(edge.gate && edge.gate.at === 'end');
      const back = endGate ? Math.min(mode === 'car' ? 13 : 9, len * 0.45) : 0;
      return { t: e.t, end: e.arrive_t, wait: e.wait_s, travel: e.travel_s, edge: e.edge, ev: e, pa, pb, len, endGate, back, hidden: !!edge.transit,
        ux: len ? (pb[0] - pa[0]) / len : 1, uy: len ? (pb[1] - pa[1]) / len : 0 };
    });
    agents.push({ id, mode, segs, t0: segs[0].t, t1: segs[segs.length - 1].end, jitter, cursor: 0, idx: 0 });
  }
  return agents;
}

function makeAgentMeshes(agents) {
  for (const m of Object.values(state.meshes)) { groups.agents.remove(m); m.dispose(); }
  state.meshes = {};
  for (const mode of Object.keys(AGENT_STYLE)) {
    const list = agents.filter((a) => a.mode === mode);
    const m = new THREE.InstancedMesh(GEO[mode], agentMat, Math.max(1, list.length));
    m.frustumCulled = false; m.castShadow = mode === 'car';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((a, k) => { a.idx = k; m.setColorAt(k, col(AGENT_STYLE[mode].palette[Math.floor(hash(a.id + 'c') * AGENT_STYLE[mode].palette.length)])); });
    m.userData.list = list;
    groups.agents.add(m); state.meshes[mode] = m;
    pickable(m, (hit) => describeAgent(list[hit.instanceId]));
  }
  pickables.splice(0, pickables.length, ...pickables.filter((p) => !p.isInstancedMesh || !p.userData.list || Object.values(state.meshes).includes(p)));
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3(0, 0, 0);
function agentPose(a, t) {
  if (t < a.t0 || t >= a.t1) return null;
  const segs = a.segs;
  let i = a.cursor;
  if (segs[i].t > t) i = 0;
  while (i < segs.length - 1 && segs[i].end <= t) i++;
  a.cursor = i;
  const s = segs[i];
  if (s.hidden || t < s.t) return null;
  const local = t - s.t;
  let d, waiting = false;
  if (s.endGate) {
    const main = s.len > 0 ? s.travel * (s.len - s.back) / s.len : s.travel;
    if (local < main) d = (local / Math.max(1e-6, main)) * (s.len - s.back);
    else if (local < main + s.wait) { d = s.len - s.back; waiting = true; }
    else d = s.len - s.back + ((local - main - s.wait) / Math.max(1e-6, s.travel - main)) * s.back;
  } else if (local < s.wait) { d = 0; waiting = true; }
  else d = ((local - s.wait) / Math.max(1e-6, s.travel)) * s.len;
  const f = s.len ? Math.min(1, d / s.len) : 1;
  return { x: s.pa[0] + (s.pb[0] - s.pa[0]) * f - s.uy * a.jitter, y: s.pa[1] + (s.pb[1] - s.pa[1]) * f + s.ux * a.jitter, h: s.pa[2] + (s.pb[2] - s.pa[2]) * f, yaw: Math.atan2(s.uy, s.ux), waiting, seg: s };
}
const counts = { walk: 0, transit: 0, bike: 0, car: 0, waiting: 0 };
function updateAgents(t) {
  for (const k of Object.keys(counts)) counts[k] = 0;
  // Life size up close; people and bikes are enlarged when zoomed out so they stay readable from the overview.
  const far = Math.max(1, camera.position.distanceTo(controls.target) / 160), CAP = { walk: 2.6, transit: 2.6, bike: 2, car: 1.3 };
  const queues = new Map();
  for (const [mode, m] of Object.entries(state.meshes)) {
    const list = m.userData.list;
    for (const a of list) {
      const p = agentPose(a, t); a.pose = p;
      if (!p || p.h < -0.5) { m.setMatrixAt(a.idx, tmpM.makeScale(0, 0, 0)); continue; }
      counts[mode]++;
      if (p.waiting) { counts.waiting++; if (mode === 'car' || mode === 'bike') { const key = `${p.seg.edge}|${mode}`; (queues.get(key) || queues.set(key, []).get(key)).push(a); } }
    }
  }
  // Vehicles waiting at the same stop line queue back along their lane instead of stacking.
  for (const [key, list] of queues) {
    const gap = key.endsWith('car') ? 6.5 : 2.2;
    list.sort((a, b) => a.pose.seg.t - b.pose.seg.t).forEach((a, r) => { a.pose.x -= a.pose.seg.ux * gap * r; a.pose.y -= a.pose.seg.uy * gap * r; });
  }
  for (const [mode, m] of Object.entries(state.meshes)) {
    const zoomScale = Math.min(CAP[mode], far);
    for (const a of m.userData.list) {
      const p = a.pose; if (!p || p.h < -0.5) continue;
      tmpQ.setFromAxisAngle(UP, p.yaw);
      m.setMatrixAt(a.idx, tmpM.compose(tmpP.set(p.x, Math.max(p.h, 0.05), -p.y), tmpQ, tmpS.setScalar(zoomScale)));
    }
    m.instanceMatrix.needsUpdate = true;
    m.boundingSphere = null;
  }
}
function describeAgent(a) {
  if (!a) return null;
  return { title: `Agent ${a.id}`, kind: `${AGENT_STYLE[a.mode].label} · simulated`, status: 'simulated', live: true, agent: a,
    rows: () => {
      const p = agentPose(a, state.t), trips = state.sb.events.filter((e) => e.actor === a.id && (e.type === 'trip_completed' || e.type === 'entered_business'));
      const r = [['Mode', `${a.mode} ${chip('simulated')}`], ['Now', p ? `${esc(p.seg.edge)}${p.waiting ? ' — <b>waiting</b>' : ''}` : (state.t < a.t0 ? `starts ${hms(a.t0)}` : 'off stage (underground or done)')]];
      for (const e of trips) {
        if (e.type === 'entered_business') { const b = bizById.get(e.business); r.push([`${hm(e.t)} visit`, esc(b ? b.name || b.kind : e.business)]); continue; }
        r.push([`${hm(e.t)} trip`, `${(e.duration_s / 60).toFixed(1)} min, ${Math.round(e.distance_m)} m, waited ${Math.round(e.wait_s)} s${e.fare_cad ? `, fare $${e.fare_cad.toFixed(2)}` : ''}${e.shared_with_cars_m ? `, ${Math.round(e.shared_with_cars_m)} m in car lanes` : ''}`]);
      }
      return r;
    },
    note: 'Default shortest-legal-path rule from world/sandbox.js, not a persona. Positions follow the sandbox graph with its schematic cross-section mapped into the drawn street.',
    action: { label: state.follow === a ? 'Stop following' : 'Follow', run: () => { state.follow = state.follow === a ? null : a; refreshInspector(); } } };
}

function rerun() {
  const start = +$('start').value, density = +$('density').value;
  state.policy = { ...SB.DEFAULT_POLICY, bloor_cycle_track: $('track').value };
  const t = performance.now();
  state.sb = runScenario(state.policy, start, 30, density);
  state.base = state.policy.bloor_cycle_track === 'protected' ? state.sb : runScenario({ ...SB.DEFAULT_POLICY }, start, 30, density);
  // Show the policy on the street: no paint when the track is removed, no posts when it is only painted.
  for (const m of TRACK.paint) m.visible = state.policy.bloor_cycle_track !== 'none';
  TRACK.posts.visible = state.policy.bloor_cycle_track === 'protected';
  state.agents = buildTimeline(state.sb);
  makeAgentMeshes(state.agents);
  state.start = start; state.end = Math.max(start + 1800, ...state.agents.map((a) => a.t1));
  state.t = start; state.follow = null;
  const sc = $('scrub'); sc.min = start; sc.max = Math.ceil(state.end); sc.value = start;
  state.statsRun = tripStats(state.sb); state.statsBase = tripStats(state.base);
  state.rejected = state.sb.events.filter((e) => e.type === 'action_rejected' || e.type === 'trip_infeasible').length;
  state.buildMs = Math.round(performance.now() - t);
  state.finished = state.sb.events.filter((e) => e.type === 'trip_completed').map((e) => e.t + e.duration_s).sort((a, b) => a - b);
  console.info(`[viewer3d] seed ${SEED}: ${state.agents.length} agents, ${state.sb.events.length} events in ${state.buildMs} ms`);
}

/* ---------- dashboard ---------- */
function renderStats() {
  let done = 0; { let lo = 0, hi = state.finished.length; while (lo < hi) { const m = (lo + hi) >> 1; if (state.finished[m] <= state.t) lo = m + 1; else hi = m; } done = lo; }
  const modes = ['walk', 'transit', 'bike', 'car'];
  const cmp = state.sb !== state.base;
  const cell = (s, m) => (s[m] ? (s[m].dur / s[m].n / 60).toFixed(1) : '–');
  const rows = modes.map((m) => {
    const a = state.statsRun[m], b = state.statsBase[m];
    const delta = cmp && a && b ? ((a.dur / a.n - b.dur / b.n) / 60) : null;
    return `<tr><th style="text-align:left">${AGENT_STYLE[m].label}</th>${cmp ? `<td>${cell(state.statsBase, m)}</td>` : ''}<td>${cell(state.statsRun, m)}</td>${cmp ? `<td>${delta == null ? '–' : (delta >= 0 ? '+' : '') + delta.toFixed(2)}</td>` : ''}<td>${a ? Math.round(a.wait / a.n) : '–'}</td>${m === 'bike' ? `<td>${a ? Math.round(a.shared / a.n) : 0} m shared</td>` : '<td></td>'}</tr>`;
  }).join('');
  $('stats').innerHTML = `<span>On stage: <b>${counts.walk}</b> walking · <b>${counts.transit}</b> to transit · <b>${counts.bike}</b> cycling · <b>${counts.car}</b> driving · <b>${counts.waiting}</b> waiting at signals</span>
    <span>Trips finished: <b>${done}</b> / ${state.finished.length} · rejected actions: <b>${state.rejected}</b> · seed ${SEED} ${chip('simulated')}</span>
    <table><tr><th style="text-align:left">mean trip</th>${cmp ? '<th>baseline min</th>' : ''}<th>${cmp ? 'policy' : 'baseline'} min</th>${cmp ? '<th>Δ min</th>' : ''}<th>wait s</th><th></th></tr>${rows}</table>`;
}

/* ---------- inspector + tooltip ---------- */
let inspected = null;
function refreshInspector() {
  if (!inspected) { $('insp').classList.remove('open'); return; }
  const d = inspected, rows = typeof d.rows === 'function' ? d.rows() : d.rows;
  $('inspBody').innerHTML = `<h3>${esc(d.title)}</h3><div class="note">${d.kind} ${chip(d.status)}</div>
    <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    ${d.action ? `<div class="btns"><button id="inspAction">${d.action.label}</button></div>` : ''}
    ${d.note ? `<div class="note">${d.note}</div>` : ''}`;
  if (d.action) $('inspAction').onclick = d.action.run;
  $('insp').classList.add('open');
}
$('inspClose').onclick = () => { inspected = null; state.follow = null; refreshInspector(); };

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let pointer = null, hoverDirty = false, downAt = null;
function effectiveVisible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const objs = pickables.filter(effectiveVisible);
  const hits = ray.intersectObjects(objs, true);
  for (const h of hits) {
    let o = h.object; while (o && !o.userData.describe) o = o.parent;
    if (!o) continue;
    const d = o.userData.describe(h);
    if (d) return d;
  }
  return null;
}
renderer.domElement.addEventListener('pointermove', (e) => { pointer = [e.clientX, e.clientY]; hoverDirty = true; });
renderer.domElement.addEventListener('pointerleave', () => { pointer = null; $('tip').style.display = 'none'; highlightBuilding(null); });
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const d = pickAt(e.clientX, e.clientY);
  inspected = d; if (!d) state.follow = null; refreshInspector();
});
function updateHover() {
  if (!hoverDirty || !pointer) return;
  hoverDirty = false;
  const d = pickAt(pointer[0], pointer[1]), tip = $('tip');
  highlightBuilding(d && d.kind === 'Building' ? d.obj : null);
  if (!d) { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; return; }
  const rows = typeof d.rows === 'function' ? d.rows() : d.rows;
  tip.innerHTML = `<b>${esc(d.title)}</b><span>${d.kind}${rows[0] ? ` · ${String(rows[0][1]).replace(/<[^>]+>/g, ' ').slice(0, 60)}` : ''}</span>`;
  tip.style.display = 'block';
  tip.style.left = `${Math.min(window.innerWidth - 270, pointer[0] + 14)}px`; tip.style.top = `${pointer[1] + 14}px`;
  renderer.domElement.style.cursor = 'pointer';
}

/* ---------- layers, legend ---------- */
for (const cb of document.querySelectorAll('[data-layer]')) {
  cb.onchange = () => {
    const k = cb.dataset.layer; groups[k].visible = cb.checked;
    if (k === 'labels') labelRenderer.domElement.style.display = cb.checked ? '' : 'none';
    if (k === 'residents') {
      wallMesh.geometry.attributes.color.array.set(cb.checked ? BUILD.wallRes : BUILD.wallUse); wallMesh.geometry.attributes.color.needsUpdate = true;
      roofMesh.geometry.attributes.color.array.set(cb.checked ? BUILD.roofRes : BUILD.roofUse); roofMesh.geometry.attributes.color.needsUpdate = true;
      legend();
    }
    hoverDirty = true;
  };
}
function legend() {
  const res = groups.residents.visible;
  const items = res ? [[heatColor(0.15).getStyle(), 'few residents'], [heatColor(1).getStyle(), 'many residents (est.)']] : Object.entries(USE_COL).map(([k, v]) => [v, k.replace('_', '-')]);
  items.push(...Object.entries(CAT_COL).map(([k, v]) => [v, CAT_NAME[k]]), ['#2f9e6f', 'cycle track'], ['#8fd3b4', 'subway entrance'], ['#e0362b', 'surface stop / streetcar']);
  $('key').innerHTML = items.map(([c, l]) => `<span><i class="sw" style="background:${c}"></i>${l}</span>`).join('');
}
legend();

/* ---------- camera presets, day/night ---------- */
const PRESETS = {                                    // [x, y, height] in the world frame
  overview: { pos: [-260, -430, 360], tgt: [320, 0, 0] },
  flyover: { pos: [-70, -14, 42], tgt: [230, 0, 0] },
  bird: { pos: [310, -40, 1050], tgt: [310, 0, 0] },
  along: { pos: [-35, -2, 7], tgt: [420, -1, 3] },
};
let tween = null;
function goPreset(name, instant = false) {
  const p = PRESETS[name]; if (!p) return;
  const to = { pos: P(...p.pos), tgt: P(...p.tgt) };
  state.follow = null;
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.tgt); controls.update(); return; }
  tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to, t0: performance.now(), dur: 1800 };
  for (const b of document.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === name);
}
for (const b of document.querySelectorAll('[data-preset]')) b.onclick = () => goPreset(b.dataset.preset);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
$('night').onclick = () => { state.night = !state.night; $('night').classList.toggle('on', state.night); $('night').textContent = state.night ? '☀ Day' : '☾ Night'; };
const lerpC = (a, b, k) => col(a).lerp(col(b), k);
function applyLighting(k) {
  const D = SKY.day, N = SKY.night, mix = (a, b) => a + (b - a) * k;
  skyUniforms.top.value.copy(lerpC(D.top, N.top, k)); skyUniforms.horizon.value.copy(lerpC(D.horizon, N.horizon, k)); skyUniforms.bottom.value.copy(lerpC(D.bottom, N.bottom, k));
  scene.fog.color.copy(lerpC(D.horizon, N.horizon, k));
  sun.intensity = mix(D.sun, N.sun); sun.color.copy(lerpC(D.sunColor, N.sunColor, k));
  hemi.intensity = mix(D.hemi, N.hemi); hemi.color.copy(lerpC(D.hemiSky, N.hemiSky, k)); hemi.groundColor.copy(lerpC(D.hemiGround, N.hemiGround, k));
  renderer.toneMappingExposure = mix(D.exposure, N.exposure);
  MAT.wall.emissiveIntensity = mix(D.windows, N.windows);
  GLOW.value = mix(D.glow, N.glow) * 0.35;
  MAT.pav.emissiveIntensity = mix(0.1, 0.9);
  MAT.carGlass.emissiveIntensity = mix(0, 0.9);
  MAT.ground.color.copy(lerpC(D.ground, N.ground, k));
  // Street-lamp spill at night: a faint warm glow on pavement (decorative, not data).
  for (const [m, v] of [[MAT.asphalt, 0.05], [MAT.sidewalk, 0.13], [MAT.track, 0.1], [MAT.white, 0.12], [MAT.path, 0.08]]) { m.emissive.set('#ffd29a'); m.emissiveIntensity = v * k; }
  document.body.style.background = skyUniforms.horizon.value.getStyle();
}

/* ---------- timeline controls ---------- */
$('play').onclick = () => { state.playing = !state.playing; $('play').textContent = state.playing ? '❚❚' : '▶'; };
$('speed').onchange = () => { state.speed = +$('speed').value; };
$('scrub').oninput = () => { state.t = +$('scrub').value; for (const a of state.agents) a.cursor = 0; };
for (const id of ['start', 'track', 'density']) $(id).onchange = () => {
  $('stats').textContent = 'Running the seeded sandbox (baseline and policy, same seed)…';
  setTimeout(() => { rerun(); if (inspected && inspected.agent) { inspected = null; refreshInspector(); } }, 30);
};
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); } });

/* ---------- main loop ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); labelRenderer.setSize(window.innerWidth, window.innerHeight);
});
let lastFrame = performance.now(), lastUi = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if (state.playing) { state.t += dt * state.speed; if (state.t > state.end) { state.t = state.start; for (const a of state.agents) a.cursor = 0; } }
  const target = state.night ? 1 : 0;
  if (state.nightK !== target) { state.nightK += Math.sign(target - state.nightK) * Math.min(Math.abs(target - state.nightK), dt / 1.4); applyLighting(state.nightK); }
  updateAgents(state.t); updateVehicles(state.t); updateSignals(state.t);
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, e); controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, e);
    if (k >= 1) tween = null;
  }
  if (state.follow && state.follow.pose && state.follow.pose.h > -0.5) {
    const p = state.follow.pose, goal = P(p.x, p.y, 1), d = goal.sub(controls.target).multiplyScalar(0.12);
    controls.target.add(d); camera.position.add(d);
  }
  controls.update();
  sky.position.copy(camera.position);
  updateHover();
  if (now - lastUi > 200) {
    lastUi = now;
    $('clock').textContent = hms(state.t); $('scrub').value = Math.round(state.t);
    renderStats();
    if (inspected && inspected.live) refreshInspector();
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Optional URL hash, e.g. #preset=flyover&t=08:12&night=1&pause=1 (handy for links and screenshots).
const HASH = new URLSearchParams(location.hash.slice(1));
if (HASH.get('track')) $('track').value = HASH.get('track');
rerun();
const startPreset = PRESETS[HASH.get('preset')] ? HASH.get('preset') : 'overview';
goPreset(startPreset, true);
document.querySelector(`[data-preset="${startPreset}"]`).classList.add('on');
if (HASH.get('t')) { const [h, m = 0, s = 0] = HASH.get('t').split(':').map(Number); state.t = HASH.get('t').includes(':') ? h * 3600 + m * 60 + s : h; }
if (HASH.get('night') === '1') { state.night = true; state.nightK = 1; $('night').classList.add('on'); $('night').textContent = '☀ Day'; }
if (HASH.get('cam')) { const c = HASH.get('cam').split(',').map(Number); camera.position.copy(P(c[0], c[1], c[2])); controls.target.copy(P(c[3], c[4], c[5])); controls.update(); }
if (HASH.get('pause') === '1') { state.playing = false; $('play').textContent = '▶'; }
applyLighting(state.nightK);
loading.remove();
window.__viewer3d = { state, scene, camera, controls, goPreset, pickAt, world: W, ready: true,
  tick: (t = state.t) => { state.t = t; updateAgents(t); updateVehicles(t); updateSignals(t); renderer.render(scene, camera); } };   // for debugging and tests
requestAnimationFrame(frame);
