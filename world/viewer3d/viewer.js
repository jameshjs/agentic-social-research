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
  day: { top: '#5388aa', horizon: '#deecec', bottom: '#eceddf', sun: 2.1, sunColor: '#fff2da', hemi: 1.35, hemiSky: '#e5f4ff', hemiGround: '#a9b9a6', exposure: 1.08, windows: 0, glow: 0.15, ground: '#91a99c' },
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
const chip = () => '';   // per-field status tags removed for the demo; the headline footnote states the status once

/* ---------- ground, roads, sidewalks ---------- */
const MAT = {
  ground: stdMat(SKY.day.ground, { roughness: 1 }),
  asphalt: stdMat('#58636b', { roughness: 0.95 }),
  lane: stdMat('#657179', { roughness: 0.95 }),
  sidewalk: stdMat('#d2cdbd', { roughness: 0.95 }),
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

/* Small, schematic sidewalk details give the road a human scale. They are not
 * mapped Toronto trees or observations and never enter the simulation. */
{
  const spots = [];
  for (let x = -148; x < X1 - 15; x += 27) if (!inBox(x)) for (const side of [-1, 1]) spots.push([x + (hash(`tree:${x}:${side}`) - 0.5) * 7, side * 11.8]);
  for (const road of legPaths) {
    const side = road.side === 'north' ? 1 : -1, center = road.pts[0][0];
    for (let d = 42; d < 350; d += 38) for (const edge of [-1, 1]) {
      if (hash(`${road.street}:${road.side}:${d}:${edge}`) < 0.23) continue;
      spots.push([center + edge * (road.width / 2 + 2.5), side * d]);
    }
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 3.2, 7), stdMat('#715845'), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 1), stdMat('#488568', { roughness: 1 }), spots.length);
  const pit = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.08, 2.3), stdMat('#a8a594'), spots.length);
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, y], i) => {
    trunk.setMatrixAt(i, matrix.compose(P(x, y, 1.75), quat, scale));
    crown.setMatrixAt(i, matrix.compose(P(x, y, 4.2), quat, scale.setScalar(0.8 + hash(`crown:${i}`) * 0.45)));
    pit.setMatrixAt(i, matrix.compose(P(x, y, 0.22), quat, scale.setScalar(1)));
  });
  trunk.castShadow = crown.castShadow = true;
  groups.ground.add(pit, trunk, crown);
}
// Parked cars are fixed set dressing on the side streets, distinct from the
// moving decision agents and excluded from all mobility totals.
{
  const parked = [];
  for (const road of legPaths.filter((r) => r.width >= 12)) {
    const side = road.side === 'north' ? 1 : -1, center = road.pts[0][0];
    for (let d = 58; d < 340; d += 69) {
      if (hash(`parked:${road.street}:${road.side}:${d}`) < 0.36) continue;
      const edge = hash(`curb:${road.street}:${d}`) < 0.5 ? -1 : 1;
      parked.push([center + edge * (road.width / 2 - 1.35), side * d, edge]);
    }
  }
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(3.85, 0.72, 1.72), stdMat('#ffffff', { roughness: 0.58 }), parked.length);
  const cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(2.25, 0.52, 1.48), stdMat('#344b54', { roughness: 0.3 }), parked.length);
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), scale = new THREE.Vector3(1, 1, 1);
  const colors = ['#e1ddd1', '#c06e56', '#617984', '#d8ba77', '#758c7e'];
  parked.forEach(([x, y], i) => {
    body.setMatrixAt(i, matrix.compose(P(x, y, 0.64), quat, scale));
    cabin.setMatrixAt(i, matrix.compose(P(x, y, 1.22), quat, scale));
    body.setColorAt(i, col(colors[i % colors.length]));
  });
  body.castShadow = cabin.castShadow = true;
  groups.ground.add(body, cabin);
}

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
  // A painted sharrow belongs to the *intervention* visual treatment. It is a
  // schematic street cue, while each moving bicycle still comes from the run.
  const sharrows = [];
  for (let sx = 65; sx < L - 20; sx += 48) {
    if (inBox(sx)) continue;
    for (const sy of [-4.25, 4.25]) {
      ribbon([[sx - 3.4, sy - 0.8], [sx, sy], [sx - 3.4, sy + 0.8]], 0.28, 0.105, sharrows);
      ribbon([[sx - 6.2, sy - 0.8], [sx - 2.8, sy], [sx - 6.2, sy + 0.8]], 0.28, 0.105, sharrows);
    }
  }
  TRACK.shared = flatMesh(sharrows, stdMat('#f4c358', { roughness: 0.72, polygonOffset: true, polygonOffsetFactor: -3 }));
  TRACK.shared.visible = false;
  groups.cycling.add(TRACK.shared);
  pickable(trackPaint, () => ({ title: 'Bloor St W cycle track', kind: 'Cycle track', status: 'observed',
    rows: [['Infrastructure', `Cycle Track ${chip('observed')}`], ['Installed', ct.map((s) => s.installed).filter((v, i, a) => a.indexOf(v) === i).join(', ')],
      ['Segments', ct.map((s) => `${s.from} → ${s.to}`).join('<br>')], ['Sandbox policy now', `${curArm() ? curArm().policy.bloor_cycle_track : 'protected'} (${state.arm} arm) ${chip('simulated')}`]],
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
  g.fillStyle = '#f6f0e4'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < BAYS; i++) for (let j = 0; j < BAYS; j++) {
    const x = i * cw, y = j * ch, dark = (i + 2 * j) % 5 === 0;
    g.fillStyle = 'rgba(94,65,45,.12)'; g.fillRect(x, y + ch * .9, cw, ch * .08);
    g.fillStyle = '#e5daca'; g.fillRect(x + cw * .12, y + ch * .14, cw * .76, ch * .69);
    g.fillStyle = '#435b63'; g.fillRect(x + cw * .19, y + ch * .19, cw * .62, ch * .57);
    g.fillStyle = dark ? '#66818a' : '#91aab0'; g.fillRect(x + cw * .24, y + ch * .24, cw * .51, ch * .47);
    g.fillStyle = 'rgba(230,251,244,.52)'; g.fillRect(x + cw * .28, y + ch * .26, cw * .08, ch * .41);
    g.fillStyle = '#e5daca'; g.fillRect(x + cw * .46, y + ch * .2, cw * .055, ch * .53);
    g.fillStyle = '#b7a894'; g.fillRect(x + cw * .12, y + ch * .73, cw * .76, ch * .055);
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

const USE_COL = { residential: '#d9c8af', mixed: '#dbad7b', non_residential: '#b6c5cb', unknown: '#c9c1b5' };
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
  return { title: b.address || 'Building', kind: `${b.height_m} m tall · ~${b.floors_est} floors`, obj: b,
    rows: [['Residents', b.residents_est != null ? `≈ ${Math.round(b.residents_est)} (estimate)` : 'n/a'],
      ...(biz.length ? [['Businesses', biz.slice(0, 4).map((x) => esc(x.name || x.kind)).join('<br>')]] : [])] };
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
// X-ray materials for Line 2 below ground; hidden during the impact tour, where they read as slabs across the street.
const UNDER = [];
const underMat = (c, o) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, fog: false }); UNDER.push(m); return m; };
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
  // Buses on their sourced routes: 7 Bathurst (Bathurst Station and north) and 127 Davenport (Spadina Rd to Spadina Station).
  const b7 = stopXY('14617'), b127 = stopXY('14777'), spRd = 614.6;
  const buses = [
    // Draw the bus on the Bathurst roadway. The GTFS stop's point is inside
    // the station block, so using it as a vehicle waypoint drove the 3D bus
    // through a building. Its time and stop remain sourced; curb position is schematic.
    { route: '7', dir: '1', label: '7 Bathurst bus northbound', pts: [[bathX + 4.8, YMIN], [bathX + 4.8, YMAX]] },
    { route: '7', dir: '0', label: '7 Bathurst bus southbound', pts: [[bathX - 4.8, YMAX], [bathX - 4.8, YMIN]] },
    { route: '127', dir: '1', label: '127 Davenport bus northbound', pts: [[b127[0], b127[1]], [spRd + 4.8, b127[1] + 12], [spRd + 4.8, YMAX]] },
    { route: '127', dir: '0', label: '127 Davenport bus southbound', pts: [[spRd - 4.8, YMAX], [spRd - 4.8, b127[1] + 12], [b127[0], b127[1]]] },
  ];
  for (const ln of buses) {
    ln.cum = polyLen(ln.pts); ln.len = ln.cum[ln.cum.length - 1];
    const deps = W.transit.surface_departures.filter((d) => d.route === ln.route && d.direction_id === ln.dir);
    const ref = [...new Set(deps.map((d) => d.stop_id))].map((id) => ({ id, s: project(ln.pts, ln.cum, stopXY(id)) })).sort((a, b) => a.s - b.s)[0];
    if (!ref) continue;
    ln.refStop = ref.id; ln.refS = ref.s;
    const tbh = {};
    for (const d of deps.filter((x) => x.stop_id === ref.id)) for (const [h, k] of Object.entries(d.trips_by_hour)) tbh[h] = (tbh[h] || 0) + k;
    ln.tbh = tbh;
    SCHED.push({ ...ln, kind: 'bus', speed: 7, length: 12, width: 2.6, height: 3.2 });
  }
  // Stops each surface vehicle pauses at (s along its path), from the same GTFS stops.
  for (const ln of SCHED) {
    if (ln.kind === 'subway') continue;
    const ids = [...new Set(W.transit.surface_departures.filter((d) => d.route === ln.route && d.direction_id === ln.dir).map((d) => d.stop_id))];
    ln.stops = ids.map((id) => { const xy = stopXY(id); return { id, xy, s: project(ln.pts, ln.cum, xy) }; })
      .filter((x) => { const q = along(ln.pts, ln.cum, x.s); return Math.hypot(q.x - x.xy[0], q.y - x.xy[1]) < 40; }).sort((a, b) => a.s - b.s);
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
/* Where a surface vehicle is `t` seconds after it left the start of its path: cruise at `speed`, and pause
 * DWELL seconds at each GTFS stop. The scheduled time `d` is when it reaches its reference stop. */
const DWELL = 16;
function vehicleAt(s, d, t) {
  if (!s.stops) return { pos: s.refS + (t - d) * s.speed, dwell: -1 };
  const before = s.stops.filter((x) => x.s < s.refS - 0.5).length;
  let e = t - (d - (s.refS / s.speed + before * DWELL)), pos = 0;
  for (let k = 0; k < s.stops.length; k++) {
    const run = (s.stops[k].s - pos) / s.speed;
    if (e < run) return { pos: pos + e * s.speed, dwell: -1 };
    e -= run; pos = s.stops[k].s;
    if (e < DWELL) return { pos, dwell: k, u: e / DWELL };
    e -= DWELL;
  }
  return { pos: pos + e * s.speed, dwell: -1 };
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
      if (s.kind === 'bus') {
        const stripeMat = stdMat('#f5f0e9'), tireMat = stdMat('#1d252b', { roughness: 0.95 });
        for (const side of [-1, 1]) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(s.length - 0.5, 0.27, 0.045), stripeMat);
          stripe.position.set(0, 1.13, side * (s.width / 2 + 0.055)); g.add(stripe);
          for (let wx = -s.length / 2 + 1.45; wx < s.length / 2 - 0.65; wx += 1.75) {
            const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.88, 0.07), stripeMat);
            mullion.position.set(wx, 2.25, side * (s.width / 2 + 0.09)); g.add(mullion);
          }
          for (const ax of [-s.length / 2 + 2.1, s.length / 2 - 2.0]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.19, 12), tireMat);
            wheel.rotation.x = Math.PI / 2; wheel.position.set(ax, 0.55, side * (s.width / 2 + 0.04)); g.add(wheel);
          }
        }
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.84, s.width - 0.32), stdMat('#335766', { roughness: 0.18, metalness: 0.15 }));
        windshield.position.set(s.length / 2 + 0.085, 2.2, 0); g.add(windshield);
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, s.width - 0.2), stripeMat);
        bumper.position.set(s.length / 2 + 0.085, 0.59, 0); g.add(bumper);
        const destination = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.47, s.width * 0.72), stdMat('#172b31', { emissive: '#dc9c35', emissiveIntensity: 0.55 }));
        destination.position.set(s.length / 2 + 0.13, 2.92, 0); g.add(destination);
        for (const side of [-1, 1]) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.37), stdMat('#fff2c0', { emissive: '#ffe7a1', emissiveIntensity: 1.1 }));
          lamp.position.set(s.length / 2 + 0.08, 0.98, side * (s.width * 0.32)); g.add(lamp);
        }
      }
    }
    g.visible = false; groups.transit.add(g);
    const v = { sched: s, mesh: g, dep: null };
    if (s.kind === 'bus' && s.route === '7' && s.dir === '1') {
      const tag = document.createElement('div');
      tag.textContent = 'ROUTE 7 · SCHEDULED';
      tag.style.cssText = 'padding:5px 8px;border:1px solid #ff987e;border-radius:5px;background:#10232eea;color:#fff4ed;font:700 9px Space Grotesk,sans-serif;letter-spacing:.07em;white-space:nowrap;box-shadow:0 5px 16px #0009';
      v.tourLabel = new CSS2DObject(tag);
      v.tourLabel.position.set(0, s.height + 2.8, 0);
      v.tourLabel.visible = false;
      g.add(v.tourLabel);
    }
    VEH.push(v);
    pickable(g, () => v.dep == null ? null : { title: s.label, kind: s.kind === 'subway' ? 'Subway train' : s.kind === 'bus' ? 'Bus' : 'Streetcar', status: 'observed',
      rows: [['Scheduled at reference', `${hm(v.dep)} ${chip('observed')}`], ['Trips this hour', s.tbh[String(Math.floor(state.t / 3600))] || 0], ['Animated speed', `${s.speed.toFixed(1)} m/s ${chip(s.kind === 'subway' ? 'derived' : 'assumption')}`]],
      note: s.kind === 'subway' ? 'Line 2 departure times from GTFS trips per hour; speed from the observed median platform-to-platform run time.' : 'Departure times from GTFS trips per hour at the first stop on screen; in-between positions use an assumed 6 m/s, without dwell.' });
  }
}
function updateVehicles(t) {
  const used = new Map();
  for (const v of VEH) { v.mesh.visible = false; if (v.tourLabel) v.tourLabel.visible = false; }
  for (const s of SCHED) {
    const pool = VEH.filter((v) => v.sched === s); let k = 0;
    for (const d of s.deps) {
      const at = vehicleAt(s, d, t), pos = at.pos;
      if (pos < -s.length || pos > s.len + (s.kind === 'subway' ? s.length : 0)) continue;
      if (k >= pool.length) break;
      const v = pool[k++], p = along(s.pts, s.cum, pos - s.length / 2);
      v.dep = d; v.mesh.visible = true;
      if (v.tourLabel) v.tourLabel.visible = false;
      v.mesh.position.copy(P(p.x, p.y, p.h + (s.kind === 'subway' ? 0 : 0.05)));
      v.mesh.rotation.y = p.yaw;
      if (at.dwell >= 0 && p.h > -0.5) boardAt(s, s.stops[at.dwell], p, d, at.dwell, at.u);
    }
    used.set(s, k);
  }
  flushRiders();
  if (TOUR_STOP.group.visible) for (let i = 0; i < TOUR_STOP.figures.length; i++) {
    const figure = TOUR_STOP.figures[i];
    const step = Math.max(0, Math.min(1, (t - TOUR_STOP.busAt - i * 1.9) / 7));
    figure.position.x = figure.userData.queueX - step * 3.1;
    figure.position.z = -(figure.userData.queueY + (TOUR_STOP.y - figure.userData.queueY) * step * 0.6);
  }
}
/* Riders getting on and off at a stop while the vehicle waits there. Decorative: GTFS gives the schedule,
 * not passenger counts, so 1–4 figures per stop are drawn from a fixed hash. */
const RIDERS = { mesh: null, n: 0, max: 80 };
const riderSpot = new THREE.Vector3(), riderQ = new THREE.Quaternion();
function boardAt(s, stop, p, d, k, u) {
  if (!RIDERS.mesh || !groups.transit.visible) return;
  const nx = -Math.sin(p.yaw), ny = Math.cos(p.yaw);                       // left of travel = the curb side here
  const side = (stop.xy[0] - p.x) * nx + (stop.xy[1] - p.y) * ny >= 0 ? 1 : -1;
  const door = [p.x + nx * side * (s.width / 2 + 0.3), p.y + ny * side * (s.width / 2 + 0.3)];
  const curb = [p.x + nx * side * (s.width / 2 + 4.5), p.y + ny * side * (s.width / 2 + 4.5)];
  const count = 1 + Math.floor(hash(`${s.label}${d}${k}`) * 4);
  for (let j = 0; j < count && RIDERS.n < RIDERS.max; j++) {
    const boarding = hash(`${s.label}${d}${k}${j}`) < 0.6, a = j * 0.14, f = (u - a) / 0.55;
    if (f < 0 || f > 1) continue;
    const [from, to] = boarding ? [curb, door] : [door, curb];
    const off = (j - count / 2) * 1.1;
    riderSpot.set(from[0] + (to[0] - from[0]) * f + Math.cos(p.yaw) * off, 0.15, -(from[1] + (to[1] - from[1]) * f + Math.sin(p.yaw) * off));
    riderQ.setFromAxisAngle(UP, Math.atan2(to[1] - from[1], to[0] - from[0]));
    RIDERS.mesh.setMatrixAt(RIDERS.n++, tmpM.compose(riderSpot, riderQ, tmpS.setScalar(Math.min(2, Math.max(1, camera.position.distanceTo(controls.target) / 200)))));
  }
}
function flushRiders() {
  if (!RIDERS.mesh) return;
  for (let i = RIDERS.n; i < RIDERS.max; i++) RIDERS.mesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
  RIDERS.mesh.instanceMatrix.needsUpdate = true; RIDERS.n = 0;
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
      const r = [];
      if (timed && state.sb) {
        const ph = state.sb.signalAt(s.px, state.t);
        r.unshift(['Phase now', `<b>${ph.phase.replace('_', ' ')}</b> (${Math.round(ph.c)} s into ${state.sb.plan.cycle} s cycle) ${chip('assumption')}`], ['Walk now', `${ph.walk ? ph.walk.replace('_', ' ') : "don't walk"} ${chip('assumption')}`]);
      } else r.unshift(['Phase now', 'not timed in the sandbox']);
      return r;
    },
    note: timed ? 'Signal timing is assumed (90 s cycle).' : '' };
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
const STREET_LABELS = [];
{
  const mk = (text, x, y, h, cls = 'lbl') => { const d = document.createElement('div'); d.className = cls; d.textContent = text; const o = new CSS2DObject(d); o.position.copy(P(x, y, h)); groups.labels.add(o); STREET_LABELS.push(o); };
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
function modelRod(a, b, radius = 0.045) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(radius, radius, dir.length(), 7);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}
const walkerGeo = mergeGeometries([
  new THREE.CylinderGeometry(0.23, 0.27, 0.76, 9).translate(0, 1.14, 0),
  new THREE.SphereGeometry(0.19, 10, 8).translate(0, 1.72, 0),
  modelRod([-0.12, 0.78, 0], [-0.18, 0.12, 0], 0.09), modelRod([0.12, 0.78, 0], [0.18, 0.12, 0], 0.09),
  modelRod([-0.23, 1.38, 0], [-0.39, 0.9, 0.1], 0.07), modelRod([0.23, 1.38, 0], [0.39, 0.9, -0.1], 0.07),
]);
const bicycleGeo = mergeGeometries([
  new THREE.TorusGeometry(0.43, 0.062, 6, 16).translate(-0.68, 0.5, 0),
  new THREE.TorusGeometry(0.43, 0.062, 6, 16).translate(0.68, 0.5, 0),
  modelRod([-0.68, 0.5, 0], [0.08, 0.63, 0], 0.055),
  modelRod([-0.68, 0.5, 0], [-0.22, 1.08, 0], 0.055),
  modelRod([-0.22, 1.08, 0], [0.08, 0.63, 0], 0.055),
  modelRod([0.08, 0.63, 0], [0.68, 0.5, 0], 0.055),
  modelRod([0.68, 0.5, 0], [0.44, 1.2, 0], 0.06),
  modelRod([-0.42, 1.12, 0], [-0.05, 1.12, 0], 0.05),
  modelRod([0.42, 1.2, -0.32], [0.42, 1.2, 0.32], 0.05),
  modelRod([-0.12, 1.12, 0], [-0.18, 1.69, 0], 0.15),
  new THREE.SphereGeometry(0.18, 10, 8).translate(-0.18, 1.89, 0),
]);
const GEO = {
  walk: walkerGeo,
  bike: bicycleGeo,
  car: mergeGeometries([new THREE.BoxGeometry(4.4, 0.85, 1.85).translate(0, 0.6, 0), new THREE.BoxGeometry(2.3, 0.6, 1.65).translate(-0.25, 1.3, 0)]),
};
GEO.transit = GEO.walk;
const agentMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
const state = { t: 8 * 3600, start: 8 * 3600, end: 8.5 * 3600, playing: true, speed: 10, arms: {}, arm: 'policy', scenario: 'bike', week: 2,
  agents: [], follow: null, night: false, nightK: 0, policyK: 1, selected: null, mapped: null, windows: null };
const SEED = 7;
const EMBED = new URLSearchParams(location.search).has('embed');   // inside /experience/

/* ---------- personas from the persona runtime (persona-swarm), read-only ---------- */
async function loadPersonas() {
  if (window.__BLOOR_PERSONAS__) return window.__BLOOR_PERSONAS__;
  try { const r = await fetch(new URL('./personas.json', import.meta.url)); return r.ok ? r.json() : null; } catch (e) { return null; }
}
const PD = await loadPersonas();
const SCEN = {
  bike: { run: 'bloor', title: 'Bloor cycle track loses its protection', short: 'Bike lane', lever: { bloor_cycle_track: 'painted' } },
  fare: { run: 'fare', title: 'Adult TTC fare +$0.50, Fair Pass unchanged', short: 'TTC fare' },
  sandbox: { run: null, title: 'Sandbox only (no personas)', short: 'Sandbox' },
};
const runOf = (sc = state.scenario) => (state.mapped ? (state.mapped.scen === sc ? state.mapped.run : null) : PD && SCEN[sc].run ? PD.runs[SCEN[sc].run] : null);
const personaById = (id) => (state.mapped ? state.mapped.personas[id] : PD ? PD.personas[id] : null) || null;
const ROLE = { driver: 'Driver', cyclist: 'Cyclist', pedestrian: 'Pedestrian', transit_rider: 'TTC rider', shop_owner: 'Shop owner', shop_worker: 'Shop worker' };
const CHOICE = { walk: 'walk', drive: 'drive', car: 'drive', bus: 'TTC', transit: 'TTC', bike: 'cycle', bike_bloor: 'cycle on Bloor', bike_detour: 'cycle via side streets', bike_side_street: 'cycle via side streets', defer: 'stay home', shop_elsewhere: 'shop elsewhere' };
const choiceMode = (c) => ({ walk: 'walk', drive: 'car', bus: 'transit', bike: 'bike', bike_bloor: 'bike', bike_detour: 'bike' }[c] || null);
// Side-street cycling routes from the City cycling network, used to draw `bike_detour` trips.
const DETOUR = {
  north: { name: 'Barton Ave / Lowther Ave', pts: [[-220, 343], [312.8, 344.4], [312.8, 244.5], [830, 266]] },
  south: { name: 'Harbord St cycle track', pts: [[-220, -410.5], [960, -390.8]] },
};
for (const d of Object.values(DETOUR)) d.cum = polyLen(d.pts);

/* Home placement is illustrative: a residential building in the persona's own neighbourhood, by hash. */
const HOMES = {};
function homeOf(p) {
  if (HOMES[p.id]) return HOMES[p.id];
  const pool = W.buildings.items.filter((b) => b.neighbourhood === p.neighbourhood && b.residents_est > 0 && b.centroid[0] > -120 && b.centroid[0] < 740 && Math.abs(b.centroid[1]) > 25 && Math.abs(b.centroid[1]) < 300);
  const b = pool.length ? pool[Math.floor(hash(`home:${p.id}`) * pool.length)] : null;
  return (HOMES[p.id] = b);
}
function shopDoor(p) {
  if (!p.shop) return null;
  const biz = W.businesses.items.find((b) => b.id === p.shop.osm_id);
  return biz && biz.building_id ? `door_${biz.building_id}` : null;
}

function makeRng(sb) {
  // sb.rand is seeded but its FNV hash gives close values for similar keys; a murmur3 finalizer spreads them.
  return (...p) => {
    let h = Math.floor(sb.rand(...p) * 4294967296) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
/* Background traffic from the observed 15-minute counts; identical in both arms (same seed, same plan). */
function spawnBackground(sb, start, minutes, density, span = 900) {
  const nodes = [...sb.graph.nodes.values()], portals = nodes.filter((n) => n.kind === 'portal'), last = XS.length - 1;
  const doors = [...sb.graph.doors.values()].map((id) => sb.graph.nodes.get(id));
  const R = makeRng(sb), pick = (arr, ...p) => arr[Math.floor(R(...p) * arr.length) % arr.length];
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
  for (let t = start; t < start + minutes * 60; t += span) {
    const f = sb.flowAt(t); if (!f) continue;
    const n = (v) => Math.round((v || 0) * density * span / 900);
    const each = (count, tag, fn) => { for (let j = 0; j < count; j++) fn(t + R(tag, t, j) * span, `${tag}${t}.${j}`); };
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
}

/* Persona trips for one week of one arm. The mode is the persona agent's own choice from the persona
 * runtime run; the route, timing and waits come from world/sandbox.js. Returns custom detour trips. */
function spawnPersonas(sb, run, arm, week, start, fares) {
  const portals = [...sb.graph.nodes.values()].filter((n) => n.kind === 'portal'), last = XS.length - 1;
  const doors = [...sb.graph.doors.values()].map((id) => sb.graph.nodes.get(id)).filter((n) => n.x > 0 && n.x < L);
  const choices = run.choices[arm === 'policy' ? 'intervention' : 'baseline'];
  const plan = [], detours = [];
  for (const key of Object.keys(choices)) {
    const [tick, pid, trip] = key.split(':');
    if (+tick !== week) continue;
    const p = personaById(pid); if (!p) continue;
    const c = choices[key], home = homeOf(p); if (!home) continue;
    const side = home.centroid[1] > 0 ? 'north' : 'south';
    const legs = portals.filter((n) => n.side === side);
    const origin = legs.reduce((a, b) => (Math.abs(b.x - home.centroid[0]) < Math.abs(a.x - home.centroid[0]) ? b : a));
    const r = (p.routine || []).find((x) => x.id === trip) || {};
    let dest = null, destLabel = '';
    if (r.destination === 'local_shop' && trip === 'work' && shopDoor(p) && sb.graph.nodes.has(shopDoor(p))) { dest = sb.graph.nodes.get(shopDoor(p)); destLabel = 'their workplace on Bloor'; }
    else if (r.destination === 'local_shop') { dest = doors[Math.floor(hash(`shop:${pid}`) * doors.length)]; destLabel = 'a shop on Bloor'; }
    else { const far = origin.intersection <= 3 ? last : 0; dest = portals.find((n) => n.intersection === far && n.side === (hash(`w:${pid}`) < 0.5 ? 'north' : 'south')) || portals[0]; destLabel = 'work, beyond the section'; }
    const t0 = start + 60 + Math.floor(hash(`${pid}:${trip}:t`) * (trip === 'work' ? 540 : 900)) + (trip === 'work' ? 0 : 300);
    const entry = { id: `${pid}:${trip}`, pid, trip, choice: c.chosen, reason: c.reason, options: c.options, dest: destLabel, origin: origin.id, t0 };
    plan.push(entry);
    const mode = choiceMode(c.chosen);
    if (!mode || dest.id === origin.id) continue;                                   // defer: stays home
    if (c.chosen === 'bike_detour') { detours.push({ ...entry, from: origin, to: dest, side }); continue; }
    // Cars and bikes cannot use sidewalks to a door: they stop at the nearest side street on that side.
    if ((mode === 'car' || mode === 'bike') && dest.kind === 'door') {
      const near = portals.filter((n) => n.side === (dest.y > 0 ? 'north' : 'south') && n.id !== origin.id);
      dest = near.reduce((u, v) => (Math.abs(v.x - dest.x) < Math.abs(u.x - dest.x) ? v : u)); entry.dest += ' (parks on the nearest side street)';
    }
    const fare = mode === 'transit' ? fares[`${arm === 'policy' ? 'intervention' : 'baseline'}:${p.fare_category}`] : undefined;
    sb.addAgent({ id: entry.id, mode, at: origin.id, t: t0, fare_cad: fare });
    entry.result = sb.travel(entry.id, dest.id);
    if (dest.kind === 'door' && entry.result.type === 'trip_completed') sb.enter(entry.id, dest.business_ids[0]);
  }
  return { plan, detours };
}
/* Persona agents of a mapped experiment.v2 run: each `travel` event already carries its validated sandbox
 * steps (edge, start, wait, travel), so the viewer only draws them. */
function stepSegs(graph, mode, steps) {
  const events = steps.filter((s) => graph.edges.has(s.edge)).map((s) => ({ type: 'moved', actor: 'x', edge: s.edge, t: s.t, wait_s: s.wait_s || 0, travel_s: s.travel_s || 0, arrive_t: s.t + (s.wait_s || 0) + (s.travel_s || 0) }));
  return events.length ? buildTimeline({ graph, events, agents: new Map([['x', { mode }]]) })[0] : null;
}
function mappedPersonaAgents(sb, run, armName, week) {
  const key = armName === 'policy' ? 'intervention' : 'baseline', out = [];
  for (const e of run.mapped.runs[key].events) {
    if (e.action !== 'travel' || e.tick !== week || !e.steps || !e.steps.length) continue;
    const a = stepSegs(sb.graph, e.mode, e.steps); if (!a) continue;
    const c = run.choices[key][`${e.tick}:${e.actor}:${e.trip_id}`] || {};
    a.id = `${e.actor}:${e.trip_id}:${e.leg}`;
    const fare = run.mapped.runs[key].events.find((x) => x.action === 'pay_fare' && x.actor === e.actor && x.tick === e.tick && x.trip_id === e.trip_id);
    a.persona = { id: a.id, pid: e.actor, trip: e.trip_id, choice: c.chosen || e.mode, reason: c.reason, options: c.options, event_id: e.id, fare: fare ? fare.amount_cad : null };
    out.push(a);
  }
  return out;
}
/* Busy stretches of the day, so playback can skip the empty hours between them. */
function travelWindows(agents, pad = 20, merge = 90) {
  const iv = agents.map((a) => [a.t0 - pad, a.t1 + pad]).sort((a, b) => a[0] - b[0]), out = [];
  for (const w of iv) { const last = out[out.length - 1]; if (last && w[0] - last[1] < merge) last[1] = Math.max(last[1], w[1]); else out.push([...w]); }
  return out;
}
/* experiment.v2 RunResult (experiment/world-runner.js) -> the same compact shape as a persona-swarm run. */
function fromMappedRun(r) {
  const choices = { baseline: {}, intervention: {} }, fares = {};
  for (const arm of ['baseline', 'intervention']) {
    fares[`${arm}:adult`] = (r.scenario.levers[arm] || {}).adult_fare_cad ?? SB.DEFAULT_POLICY.adult_fare_cad;
    for (const e of r.runs[arm].events) {
      if (e.action === 'choose_trip') choices[arm][`${e.tick}:${e.actor}:${e.trip_id}`] = { chosen: e.chosen, options: e.options, reason: e.reason, destination: e.destination };
      if (e.action === 'pay_fare') { const p = r.personas.find((x) => x.id === e.actor); if (p && p.fare_category !== 'adult') fares[`${arm}:${p.fare_category}`] = Math.max(fares[`${arm}:${p.fare_category}`] || 0, e.amount_cad); }
    }
  }
  const sum = (arm) => r.runs[arm].metrics.by_tick.reduce((acc, t) => { for (const [k, v] of Object.entries(t)) if (typeof v === 'number' && k !== 'tick') acc[k] = (acc[k] || 0) + v; return acc; }, {});
  const tot = (x) => ({ ...x, bloor_route_trips: x.bloor_bike_trips, bus_trips: x.transit_trips });
  const changed = r.changed_decisions.map((c) => ({ key: c.key, tick: c.tick, actor: c.actor, trip: c.trip_id, from: c.baseline.action, to: c.intervention.action }));
  return { mapped: r, question: r.scenario.question, ticks: r.scenario.ticks, policy_start: r.scenario.policy_start,
    label: `${r.population.count} synthetic people, seed ${r.seed}, v${r.version}`, totals: { baseline: tot(sum('baseline')), intervention: tot(sum('intervention')) },
    checks: { changed_decisions: { count: changed.length, of_pairs: Object.keys(choices.baseline).length } }, fares, choices, changed };
}
function mappedPersona(p) {
  const pref = Object.entries(p.mode_preference || {}).sort((a, b) => b[1] - a[1])[0];
  return { id: p.id, name: p.name, role: p.role, neighbourhood: p.home && p.home.street ? p.home.street : p.home && p.home.kind === 'offmap' ? 'visitor' : 'Bloor',
    fare_category: p.fare_category, has_car: p.has_car, has_bike: p.has_bike, routine: p.routine || [], budget: p.daily_budget_cad,
    traits: [pref ? `prefers ${CHOICE[pref[0]] || pref[0]}` : null, p.cost_sensitivity > 1.2 ? 'watches costs closely' : null, p.bike_safety_sensitivity > 1.2 ? 'nervous cycling in traffic' : null].filter(Boolean), mapped: true };
}
/* From the skyline down to Bloor & Spadina: start high over the city and settle on the section. */
function zoomIn() {
  camera.position.copy(P(420, -900, 2300)); controls.target.copy(P(470, 0, 0)); controls.update();
  // The final view looks *along* Bloor from within the street. An overhead camera
  // made nearby rooftops cover the people and cycle track the demo is about.
  tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: { pos: P(175, -3, 36), tgt: P(410, 0, 1.5) }, t0: performance.now() + 250, dur: 3200 };
}
function setMappedRun(result) {
  if (!result || result.schema_version !== 'experiment.v2') return false;
  const scen = Object.keys(result.scenario.levers.intervention || {}).includes('bloor_cycle_track') ? 'bike' : 'fare';
  state.mapped = { scen, run: fromMappedRun(result), personas: Object.fromEntries(result.personas.map((p) => [p.id, mappedPersona(p)])) };
  state.scenario = scen; state.week = result.scenario.policy_start; state.selected = null; inspected = null;
  rebuildArms();
  if (EMBED) zoomIn();
  return true;
}

/* A detour drawn on the side-street cycling network: off Bloor, so it is not a sandbox edge. */
function detourAgent(d) {
  const line = DETOUR[d.side], s0 = project(line.pts, line.cum, [d.from.x, d.from.y]), s1 = project(line.pts, line.cum, [d.to.x, d.to.y > 0 ? 300 : -400]);
  const pts = [[d.from.x, d.from.y]];
  const a = along(line.pts, line.cum, s0); pts.push([a.x, a.y]);
  const step = s1 > s0 ? 25 : -25;
  for (let s = s0 + step; step > 0 ? s < s1 : s > s1; s += step) { const q = along(line.pts, line.cum, s); pts.push([q.x, q.y]); }
  const b = along(line.pts, line.cum, s1); pts.push([b.x, b.y], [d.to.x, mapY(d.to.y)]);
  const segs = []; let t = d.t0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const pa = [...pts[i], 0.05], pb = [...pts[i + 1], 0.05], len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); if (len < 0.5) continue;
    const travel = len / SB.SPEED.bike;
    segs.push({ t, end: t + travel, wait: 0, travel, edge: `detour via ${line.name}`, pa, pb, len, endGate: false, back: 0, hidden: false, ux: (pb[0] - pa[0]) / len, uy: (pb[1] - pa[1]) / len });
    t += travel;
  }
  return { id: d.id, mode: 'bike', segs, t0: segs[0].t, t1: segs[segs.length - 1].end, jitter: 0, cursor: 0, idx: 0, detour: line.name };
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

/* ---------- one arm: sandbox + timeline + meshes ---------- */
const PCOL = { walk: '#ffd23f', transit: '#c3a6ff', bike: '#3dff8a', car: '#5ab0ff' };
const ringGeo = new THREE.RingGeometry(1.1, 1.6, 32).rotateX(-Math.PI / 2);
const ringMat = { changed: new THREE.MeshBasicMaterial({ color: '#ff3df0', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  same: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  picked: new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }) };
// Routes are coloured by arm, as on the tour card: Baseline cyan, With policy pink. The arm on screen is solid.
const routeMat = (color, opacity, offset) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: offset });
const trailMat = { baseline: routeMat('#4fe3ff', 0.85, -4), policy: routeMat('#ff5fe0', 0.85, -4),
  ghostBaseline: routeMat('#4fe3ff', 0.4, -3), ghostPolicy: routeMat('#ff5fe0', 0.4, -3) };

function buildArm(armName, scen, start, density) {
  const run = runOf(scen), fares = run ? run.fares : {};
  let policy = { ...SB.DEFAULT_POLICY };
  if (armName === 'policy') {
    if (scen === 'bike') policy = { ...policy, ...SCEN.bike.lever };
    if (scen === 'fare') policy.adult_fare_cad = fares['intervention:adult'] ?? policy.adult_fare_cad + 0.5;
    if (scen === 'sandbox') policy.bloor_cycle_track = $('track').value;
  }
  if (run && run.mapped) {                                           // the page's run decides the levers
    policy = { ...SB.DEFAULT_POLICY };
    for (const [k, v] of Object.entries(run.mapped.scenario.levers[armName === 'policy' ? 'intervention' : 'baseline'] || {})) if (k in policy) policy[k] = v;
  }
  // background: false skips the routed background fit (slow); the viewer draws its own count-driven traffic.
  const sb = SB.createSandbox(W, { seed: run && run.mapped ? run.mapped.seed : SEED, policy, background: false });
  let pp = { plan: [], detours: [] }, mappedAgents = [];
  if (run && run.mapped) {
    mappedAgents = mappedPersonaAgents(sb, run, armName, state.week);
    for (const w of travelWindows(mappedAgents)) spawnBackground(sb, w[0], (w[1] - w[0]) / 60, density * 0.6, Math.max(60, w[1] - w[0]));
  } else {
    spawnBackground(sb, start, 30, density);
    if (run) pp = spawnPersonas(sb, run, armName, state.week, start, fares);
  }
  const agents = buildTimeline(sb).concat(mappedAgents);
  for (const d of pp.detours) agents.push(detourAgent(d));
  const byId = new Map(agents.map((a) => [a.id, a]));
  for (const e of pp.plan) { e.agent = byId.get(e.id) || null; if (e.agent) { e.agent.persona = e; } }
  const group = new THREE.Group(); group.visible = false; groups.agents.add(group);
  const arm = { name: armName, sb, policy, agents, plan: pp.plan, group, meshes: {}, people: [], stats: tripStats(sb) };
  // Background agents: instanced, one mesh per mode.
  for (const mode of Object.keys(AGENT_STYLE)) {
    const list = agents.filter((a) => a.mode === mode && !a.persona);
    const m = new THREE.InstancedMesh(GEO[mode], agentMat, Math.max(1, list.length));
    m.frustumCulled = false; m.castShadow = mode === 'car';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((a, k) => { a.idx = k; m.setColorAt(k, col(AGENT_STYLE[mode].palette[Math.floor(hash(a.id + 'c') * AGENT_STYLE[mode].palette.length)])); });
    m.userData.list = list;
    group.add(m); arm.meshes[mode] = m;
    pickable(m, (hit) => describeAgent(list[hit.instanceId], arm));
  }
  // Persona agents: one bright object each, with a ring and a name tag.
  for (const a of agents.filter((x) => x.persona)) {
    const g = new THREE.Group(), body = new THREE.Mesh(GEO[a.mode], new THREE.MeshStandardMaterial({ color: PCOL[a.mode], roughness: 0.35, emissive: PCOL[a.mode], emissiveIntensity: 0.35 }));
    const ring = new THREE.Mesh(ringGeo, ringMat.same); ring.position.y = 0.12;
    const tag = document.createElement('div'); tag.className = 'ptag';
    const lab = new CSS2DObject(tag); lab.position.set(0, 3.2, 0);
    g.add(body, ring, lab); g.visible = false; group.add(g);
    a.obj = { g, body, ring, tag, lab };
    pickable(g, () => describePersona(a.persona.pid));
    arm.people.push(a);
  }
  return arm;
}
function disposeArm(arm) {
  if (!arm) return;
  arm.group.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
  groups.agents.remove(arm.group);
  const keep = new Set(); arm.group.traverse((o) => keep.add(o));
  pickables.splice(0, pickables.length, ...pickables.filter((p) => !keep.has(p)));
  for (const m of Object.values(arm.meshes)) m.dispose();
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
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
const counts = { walk: 0, transit: 0, bike: 0, car: 0, waiting: 0, people: 0 };
RIDERS.mesh = new THREE.InstancedMesh(GEO.walk, new THREE.MeshStandardMaterial({ color: '#e9eef2', roughness: 0.6 }), RIDERS.max);
RIDERS.mesh.frustumCulled = false; groups.transit.add(RIDERS.mesh); flushRiders();
for (let i = 0; i < RIDERS.max; i++) RIDERS.mesh.setColorAt(i, col(AGENT_STYLE.walk.palette[i % AGENT_STYLE.walk.palette.length]));
// A close-up stop vignette for the guided fare comparison. The queue is
// deliberately labelled illustrative: GTFS has service times, not boardings.
const TOUR_STOP = { group: new THREE.Group(), figures: [] };
{
  const stop = STOPS.find((s) => s.id === '14617');
  const y = stop.xy[1], x = 11.2;
  TOUR_STOP.y = y;
  const platform = flatMesh(ribbon([[x, y - 19], [x, y + 19]], 6.0, 0.19, []), MAT.sidewalk);
  TOUR_STOP.group.add(platform);
  const dark = stdMat('#183840', { roughness: 0.52 }), accent = stdMat('#ee5547'), glassSide = stdMat('#b7d8cf', { transparent: true, opacity: 0.55, depthWrite: false });
  const shelter = new THREE.Group(); shelter.position.copy(P(x + 1.3, y + 10));
  for (const dy of [-2.3, 2.3]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), dark);
    pole.position.set(0, 1.25, dy); shelter.add(pole);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, 6.2), accent); roof.position.y = 2.62; shelter.add(roof);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.75, 5), glassSide); pane.position.set(1.4, 1.42, 0); shelter.add(pane);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.18, 2.3), dark); bench.position.set(0.65, 0.64, 0); shelter.add(bench);
  TOUR_STOP.group.add(shelter);
  const sign = new THREE.Group(); sign.position.copy(P(x - 1.6, y - 10));
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 3.7, 8), dark); signPole.position.y = 1.85;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 20), accent); disc.rotation.x = Math.PI / 2; disc.position.y = 3.6;
  sign.add(signPole, disc); TOUR_STOP.group.add(sign);
  for (let i = 0; i < 9; i++) {
    const figure = new THREE.Mesh(GEO.walk, new THREE.MeshStandardMaterial({ color: AGENT_STYLE.walk.palette[(i + 2) % AGENT_STYLE.walk.palette.length], roughness: 0.75 }));
    figure.position.copy(P(x - 0.15 + (i % 2) * 0.85, y + 4.5 - i * 2.35, 0.2));
    figure.rotation.y = -0.25 + (i % 3) * 0.22;
    figure.castShadow = true;
    figure.userData.queueY = y + 4.5 - i * 2.35;
    figure.userData.queueX = x - 0.15 + (i % 2) * 0.85;
    TOUR_STOP.group.add(figure); TOUR_STOP.figures.push(figure);
  }
  const tag = document.createElement('div'); tag.className = 'tour-stop-label'; tag.innerHTML = '<b>ROUTE 7 · BATHURST</b><span>scheduled bus · illustrative queue</span>';
  const label = new CSS2DObject(tag); label.position.copy(P(x, y + 10, 5.3)); TOUR_STOP.group.add(label); TOUR_STOP.label = label;
  groups.transit.add(TOUR_STOP.group);
  TOUR_STOP.group.visible = false;
}
// A small moving ground highlight makes the protected track versus shared-road
// treatment readable from a follow camera. It follows the agent's logged edge;
// the larger mapped road and all numeric outcomes still come from the run.
const TOUR_PATH = { group: new THREE.Group() };
{
  const pavement = (color, width, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(21, width), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.16; TOUR_PATH.group.add(m); return m;
  };
  TOUR_PATH.protected = pavement('#2ee3a0', 2.65, 0.32);
  TOUR_PATH.shared = pavement('#ef9b34', 3.65, 0.34);
  TOUR_PATH.posts = new THREE.Group();
  const postMat = stdMat('#f5f5e7', { emissive: '#ffffff', emissiveIntensity: 0.12 });
  for (let x = -9; x <= 9; x += 3) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.95, 7), postMat);
    post.position.set(x, 0.49, 1.45); TOUR_PATH.posts.add(post);
  }
  TOUR_PATH.group.add(TOUR_PATH.posts);
  TOUR_PATH.group.visible = false;
  groups.cycling.add(TOUR_PATH.group);
}
function updateTourPath() {
  // Only on Bloor itself: side streets have no track, so they get no posts or lane paint.
  const p = state.follow?.pose, onBloor = p && Math.abs(p.y) < CURB && Math.abs(p.seg?.ux ?? 0) > 0.8;
  const bike = ['follow', 'fork'].includes(state.impactTour?.focus) && state.follow?.mode === 'bike' && p && p.h > -0.5 && onBloor;
  TOUR_PATH.group.visible = !!bike;
  if (!bike) return;
  const shared = state.scenario === 'bike' && state.arm === 'policy';
  TOUR_PATH.protected.visible = !shared;
  TOUR_PATH.shared.visible = shared;
  TOUR_PATH.posts.visible = !shared;
  TOUR_PATH.group.position.copy(P(p.x, p.y, 0));
  TOUR_PATH.group.rotation.y = p.yaw;
}
const curArm = () => state.arms[state.arm];
function updateAgents(t) {
  for (const k of Object.keys(counts)) counts[k] = 0;
  const arm = curArm(); if (!arm) return;
  // Life size up close; people and bikes are enlarged when zoomed out so they stay readable from the overview.
  const far = Math.max(1, camera.position.distanceTo(controls.target) / 160), CAP = { walk: 2.6, transit: 2.6, bike: 2, car: 1.3 };
  const queues = new Map();
  for (const a of arm.agents) {
    const p = agentPose(a, t); a.pose = p;
    if (!p || p.h < -0.5) continue;
    counts[a.mode]++; if (a.persona) counts.people++;
    if (p.waiting) { counts.waiting++; if (a.mode === 'car' || a.mode === 'bike') { const key = `${p.seg.edge}|${a.mode}`; (queues.get(key) || queues.set(key, []).get(key)).push(a); } }
  }
  // Vehicles waiting at the same stop line queue back along their lane instead of stacking.
  for (const [key, list] of queues) {
    const gap = key.endsWith('car') ? 6.5 : 2.2;
    list.sort((a, b) => a.pose.seg.t - b.pose.seg.t).forEach((a, r) => { a.pose.x -= a.pose.seg.ux * gap * r; a.pose.y -= a.pose.seg.uy * gap * r; });
  }
  for (const [mode, m] of Object.entries(arm.meshes)) {
    const zoomScale = Math.min(CAP[mode], far);
    for (const a of m.userData.list) {
      const p = a.pose;
      if (!p || p.h < -0.5) { m.setMatrixAt(a.idx, tmpM.makeScale(0, 0, 0)); continue; }
      tmpQ.setFromAxisAngle(UP, p.yaw);
      m.setMatrixAt(a.idx, tmpM.compose(tmpP.set(p.x, Math.max(p.h, 0.05), -p.y), tmpQ, tmpS.setScalar(zoomScale)));
    }
    m.instanceMatrix.needsUpdate = true;
    m.boundingSphere = null;
  }
  const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
  for (const a of arm.people) {
    const p = a.pose, o = a.obj, e = a.persona;
    o.g.visible = !!(p && p.h > -0.5) && groups.agents.visible;
    if (!o.g.visible) { o.lab.visible = false; continue; }
    const pickedNow = state.selected === e.pid, changed = isChanged(e.pid, e.trip);
    o.g.position.set(p.x, Math.max(p.h, 0.05), -p.y);
    o.body.rotation.y = p.yaw;
    const sc = Math.min(CAP[a.mode] * 1.25, far * 1.3);
    const hero = state.impactTour?.focus === 'fork' && pickedNow;   // the wide fork shot keeps the tour's person readable
    o.body.scale.setScalar(sc * (hero ? (a.mode === 'car' ? 1.15 : 1.7) : 1));
    o.ring.material = pickedNow ? ringMat.picked : changed ? ringMat.changed : ringMat.same;
    const flash = state.flashUntil && performance.now() < state.flashUntil && changed ? 2.2 : 1;
    o.ring.scale.setScalar(sc * (hero ? 1.9 : state.impactTour ? 0.64 : flash * (changed || pickedNow ? pulse : 1)));
    const paying = e.fare != null && p.seg && /^stairs_/.test(p.seg.edge) && p.seg.pb[2] < p.seg.pa[2];
    const show = state.impactTour ? pickedNow : changed || pickedNow || state.labelsAll || paying;
    o.lab.visible = show && groups.labels.visible;
    if (show) {
      const [bc, pc] = state.arm === 'policy' ? [otherChoice(e), e.choice] : [e.choice, otherChoice(e)];   // always baseline → policy
      const fareUp = paying && e.fare > ((runOf() || {}).fares || {})['baseline:adult'];
      const html = state.impactTour ? `<b>${esc(personaById(e.pid).name)}</b> <span>${esc(CHOICE[e.choice] || e.choice)}</span>`
        : paying ? `<b>${esc(personaById(e.pid).name)}</b> <span class="pay${fareUp ? ' up' : ''}">pays $${e.fare.toFixed(2)}</span>`
        : `<b>${esc(personaById(e.pid).name)}</b> ${changed ? `<span>${esc(CHOICE[bc] || bc)} → ${esc(CHOICE[pc] || pc)}</span>` : `<span>${esc(CHOICE[e.choice] || e.choice)}</span>`}`;
      if (o.tag._html !== html) { o.tag.innerHTML = html; o.tag._html = html; }
      o.tag.classList.toggle('chg', changed); o.tag.classList.toggle('pick', pickedNow);
      o.lab.position.y = 2.6 * sc;
    }
  }
}
/* Did this persona's choice for this trip differ between arms, in the selected week? */
function isChanged(pid, trip, week = state.week) {
  const run = runOf(); if (!run) return false;
  const k = `${week}:${pid}:${trip}`, b = run.choices.baseline[k], i = run.choices.intervention[k];
  return !!(b && i && b.chosen !== i.chosen);
}
function otherChoice(e) {
  const run = runOf(), k = `${state.week}:${e.pid}:${e.trip}`;
  const o = run.choices[state.arm === 'policy' ? 'baseline' : 'intervention'][k];
  return o ? o.chosen : e.choice;
}

/* Trails: for changed or selected personas, this arm's route (magenta) and the other arm's (cyan). */
let trailGroup = null;
function buildTrails() {
  if (trailGroup) { groups.agents.remove(trailGroup); trailGroup.traverse((o) => o.geometry && o.geometry.dispose()); }
  trailGroup = new THREE.Group(); groups.agents.add(trailGroup);
  if (!runOf() || !state.arms.policy) return;
  const route = (a) => { const pts = []; for (const s of a.segs) { if (s.hidden || s.pa[2] < -0.5 || s.pb[2] < -0.5) continue; if (!pts.length) pts.push([s.pa[0], s.pa[1]]); pts.push([s.pb[0], s.pb[1]]); } return pts; };
  const now = [], other = [];
  const otherArm = state.arms[state.arm === 'policy' ? 'baseline' : 'policy'];
  for (const a of curArm().people) {
    const e = a.persona; if (!(isChanged(e.pid, e.trip) || state.selected === e.pid)) continue;
    if (state.impactTour && e.pid !== state.selected) continue;
    ribbon(route(a), state.impactTour ? 1.4 : 0.32, 0.35, now);
    const b = otherArm.agents.find((x) => x.id === a.id); if (b) ribbon(route(b), state.impactTour ? 1 : 0.22, 0.3, other);
  }
  // Changed personas whose trip vanished in this arm (e.g. stayed home) still show the other arm's route.
  for (const b of otherArm.people) if (!curArm().agents.find((x) => x.id === b.id) && (isChanged(b.persona.pid, b.persona.trip) || state.selected === b.persona.pid) && (!state.impactTour || b.persona.pid === state.selected)) ribbon(route(b), state.impactTour ? 1 : 0.22, 0.3, other);
  const policy = state.arm === 'policy';
  if (now.length) trailGroup.add(flatMesh(now, policy ? trailMat.policy : trailMat.baseline, false));
  if (other.length) trailGroup.add(flatMesh(other, policy ? trailMat.ghostBaseline : trailMat.ghostPolicy, false));
  trailGroup.visible = $('trails').checked;
}

/* ---------- persona and agent cards ---------- */
const optionText = (o) => (typeof o === 'string' ? (CHOICE[o] || o) : `${CHOICE[o.action] || o.action}${o.minutes ? ` ${Math.round(o.minutes)} min` : ''}${o.cost_cad ? ` $${o.cost_cad.toFixed(2)}` : ''}`);
function describePersona(pid) {
  const p = personaById(pid); if (!p) return null;
  const run = runOf();
  const role = ROLE[p.role] || p.role.replace(/_/g, ' ');
  const who = p.mapped
    ? `${esc(role)}${p.neighbourhood && !role.includes(p.neighbourhood) ? ` · ${esc(p.neighbourhood)}` : ''}`
    : `${esc(p.age_band || '')} ${esc(p.sex || '')} · ${esc(ROLE[p.role] || p.role)} · ${esc(p.neighbourhood)}`;
  return { title: p.name, kind: who, live: true, persona: pid,
    rows: () => {
      const r = [];
      if (!EMBED) {   // inside /experience/ the card keeps only who they are and what changed
        const cash = p.mapped ? `$${p.budget}/day budget` : `$${p.disposable_cash_weekly_cad}/week spare cash`;
        r.push(['About', `${cash} · ${p.fare_category === 'fair_pass' ? 'Fair Pass' : 'adult fare'} · ${p.has_car ? 'car' : 'no car'} · ${p.has_bike ? 'bike' : 'no bike'}`]);
        if (p.traits.length) r.push(['Traits', p.traits.slice(0, 2).map(esc).join('<br>')]);
      }
      const fixed = r.length;
      if (run) {
        const wk = state.week;
        for (const trip of (p.routine || []).map((x) => x.id)) {
          const k = `${wk}:${pid}:${trip}`, b = run.choices.baseline[k], i = run.choices.intervention[k];
          if (!b || !i || b.chosen === i.chosen) continue;
          const why = EMBED ? '' : `<br><span class="note">${p.mapped ? `options: ${(i.options || []).map(optionText).join(' · ')}` : `“${esc(i.reason)}”`}</span>`;
          r.push([esc(trip), `<b class="chgtxt">${esc(CHOICE[b.chosen] || b.chosen)} → ${esc(CHOICE[i.chosen] || i.chosen)}</b>${why}`]);
        }
        if (r.length === fixed) r.push(['This period', 'same choices with and without the policy']);
      }
      return r;
    },
    action: { label: state.follow && state.follow.persona && state.follow.persona.pid === pid ? 'Stop following' : 'Follow', run: () => followPersona(pid) } };
}
function followPersona(pid, fly = false) {
  const mine = curArm() ? curArm().people.filter((x) => x.persona.pid === pid) : [];
  const a = mine.find((x) => isChanged(pid, x.persona.trip)) || mine[0];
  if (state.follow && state.follow.persona && state.follow.persona.pid === pid && !fly) state.follow = null;
  else if (a) {
    state.follow = a;
    if (state.t < a.t0 || state.t >= a.t1) { state.t = a.t0 + 2; for (const x of curArm().agents) x.cursor = 0; }
    const p = agentPose(a, state.t) || { x: a.segs[0].pa[0], y: a.segs[0].pa[1] };
    tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: { pos: P(p.x - 22, p.y - 30, 75), tgt: P(p.x, p.y, 1) }, t0: performance.now(), dur: 1400 };
  }
  refreshInspector();
}
function describeAgent(a, arm) {
  if (!a) return null;
  return { title: `Agent ${a.id}`, kind: `${AGENT_STYLE[a.mode].label} · background traffic`, status: 'simulated', live: true, agent: a,
    rows: () => {
      const p = agentPose(a, state.t), trips = arm.sb.events.filter((e) => e.actor === a.id && (e.type === 'trip_completed' || e.type === 'entered_business'));
      const r = [['Mode', `${a.mode} ${chip('simulated')}`], ['Now', p ? `${esc(p.seg.edge)}${p.waiting ? ' — <b>waiting</b>' : ''}` : (state.t < a.t0 ? `starts ${hms(a.t0)}` : 'off stage (underground or done)')]];
      for (const e of trips) {
        if (e.type === 'entered_business') { const b = bizById.get(e.business); r.push([`${hm(e.t)} visit`, esc(b ? b.name || b.kind : e.business)]); continue; }
        r.push([`${hm(e.t)} trip`, `${(e.duration_s / 60).toFixed(1)} min, ${Math.round(e.distance_m)} m, waited ${Math.round(e.wait_s)} s${e.fare_cad ? `, fare $${e.fare_cad.toFixed(2)}` : ''}${e.shared_with_cars_m ? `, ${Math.round(e.shared_with_cars_m)} m in car lanes` : ''}`]);
      }
      return r;
    },
    note: 'Background traffic from the observed counts, following world/sandbox.js\'s shortest-legal-path rule. It has no persona and is identical in both arms. The bright figures with rings are the persona agents.',
    action: { label: state.follow === a ? 'Stop following' : 'Follow', run: () => { state.follow = state.follow === a ? null : a; refreshInspector(); } } };
}

/* ---------- scenario cues on the street ---------- */
const CUES = { tags: [] };
{
  const mk = (cls, x, y, h) => { const d = document.createElement('div'); d.className = cls; const o = new CSS2DObject(d); o.position.copy(P(x, y, h)); scene.add(o); return o; };
  // One fare tag per station, at its main (first) entrance; fewer tags keep the street readable.
  for (const st of W.transit.stations) CUES.tags.push(mk('fare', st.entrances[0].x, st.entrances[0].y, 12));
  CUES.detour = Object.values(DETOUR).map((d) => mk('dtag', d.pts[1][0] - 60, d.pts[1][1], 6));
  DETOUR.north.lbl = CUES.detour[0]; DETOUR.south.lbl = CUES.detour[1];
}
const money = (v) => `$${Number(v).toFixed(2)}`;
const pct = (a, b) => (a ? `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(0)}%` : '');
function headlineItems(run, sc) {
  const B = run.totals.baseline, I = run.totals.intervention, c = run.checks.changed_decisions;
  const item = (label, a, b, fmt = (v) => v) => ({ label, a: fmt(a), b: fmt(b), d: pct(a, b), up: b > a, same: a === b });
  const items = sc === 'bike'
    ? [item('Bloor bike trips', B.bloor_route_trips, I.bloor_route_trips), item('Walk trips', B.walk_trips, I.walk_trips), item('Shop sales', B.shop_sales_cad, I.shop_sales_cad, (v) => `$${Math.round(v).toLocaleString()}`)]
    : [item('TTC fare revenue', B.fare_revenue_cad, I.fare_revenue_cad, money), item('Car trips', B.car_trips, I.car_trips), item('TTC trips', B.bus_trips, I.bus_trips)];
  return { items, changed: `${c.count} of ${c.of_pairs}` };
}
function updateCues() {
  const sc = state.scenario, run = runOf(), pol = state.arm === 'policy';
  const fares = run ? run.fares : {};
  for (const o of CUES.tags) {
    o.visible = sc === 'fare' && groups.transit.visible;
    if (!o.visible) continue;
    const a0 = fares['baseline:adult'], a1 = fares['intervention:adult'], fp = fares['baseline:fair_pass'];
    o.element.innerHTML = pol ? `Adult <s>${money(a0)}</s> <b>${money(a1)}</b>${o.element.classList.contains('small') ? '' : `<br>Fair Pass ${money(fp)} (same)`}` : `Adult ${money(a0)}${o.element.classList.contains('small') ? '' : `<br>Fair Pass ${money(fp)}`}`;
    o.element.classList.toggle('up', pol);
  }
  for (const d of CUES.detour) d.visible = sc === 'bike' && groups.cycling.visible;
  DETOUR.north.lbl.element.textContent = `detour route: ${DETOUR.north.name}`; DETOUR.south.lbl.element.textContent = `detour route: ${DETOUR.south.name}`;
  // Bike policy: posts gone, paint turns amber and pulses. Fare policy: entrances glow red.
  const unprot = sc === 'bike' ? pol : sc === 'sandbox' ? $('track').value !== 'protected' : false;
  TRACK.posts.visible = !(sc === 'sandbox' ? $('track').value !== 'protected' : unprot);
  for (const m of TRACK.paint) m.visible = !unprot && !(sc === 'sandbox' && $('track').value === 'none');
  TRACK.shared.visible = unprot;
  MAT.track.color.set(unprot ? '#f0a030' : '#2f9e6f');
  state.trackPulse = unprot;
  MAT.pav.color.set(sc === 'fare' && pol ? '#ff8a7a' : '#8fd3b4'); MAT.pav.emissive.set(sc === 'fare' && pol ? '#ff3b30' : '#3fbf88');
  document.body.dataset.arm = run ? state.arm : 'none';
}

/* ---------- headline and people panels ---------- */
function renderHeadline() {
  const run = runOf(), sc = state.scenario;
  $('scen').value = sc; $('trackWrap').style.display = sc === 'sandbox' ? '' : 'none';
  for (const b of document.querySelectorAll('[data-arm]')) b.classList.toggle('on', b.dataset.arm === state.arm);
  $('armWrap').style.display = run || sc === 'sandbox' ? '' : 'none';
  if (!run) {
    $('hlBody').innerHTML = sc === 'sandbox' ? '<div class="note">Sandbox only: background traffic from the observed counts. Policy arm uses the cycle-track setting below.</div>'
      : '<div class="note">No persona run found. Build personas.json with <code>node world/viewer3d/build-personas.mjs</code>.</div>';
    $('people').style.display = 'none'; return;
  }
  const h = headlineItems(run, sc);
  const weeks = Array.from({ length: run.ticks }, (_, i) => i + 1);
  $('week').innerHTML = weeks.map((w) => `<option value="${w}" ${w === state.week ? 'selected' : ''}>Week ${w}${w < run.policy_start ? ' (before policy)' : ''}</option>`).join('');
  $('hlBody').innerHTML = `
    <div class="tiles">${h.items.map((x) => `<div class="tile"><span>${esc(x.label)}</span><b>${x.a} <em>→</em> ${x.b}</b><i class="${x.same ? '' : x.up ? 'up' : 'down'}">${x.same ? 'no change' : x.d}</i></div>`).join('')}</div>
    <div class="note">${h.changed} choices changed · ${run.mapped ? esc(run.label) : '40 AI persona agents, 4 weeks'} · synthetic, not a forecast</div>`;
  renderPeople();
}
function renderPeople() {
  const run = runOf(); if (!run) return;
  const by = new Map();
  for (const c of run.changed) (by.get(c.actor) || by.set(c.actor, []).get(c.actor)).push(c);
  const list = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  $('people').style.display = '';
  $('peopleBody').innerHTML = `<h2>People affected (${list.length})</h2>` + list.slice(0, 8).map(([pid, cs]) => {
    const p = personaById(pid);
    const t = [...new Set(cs.map((c) => `${CHOICE[c.from] || c.from} → ${CHOICE[c.to] || c.to}`))];
    return `<button class="person${state.selected === pid ? ' on' : ''}" data-pid="${pid}"><b>${esc(p ? p.name : pid)}</b> <span>${esc(p ? ROLE[p.role] || p.role.replace(/_/g, ' ') : '')}</span><br><em>${t.slice(0, 2).map(esc).join(' · ')}</em></button>`;
  }).join('') + (list.length > 8 ? `<div class="note">+${list.length - 8} more · click anyone on the street</div>` : '');
  for (const b of document.querySelectorAll('#peopleBody .person')) b.onclick = () => selectPerson(b.dataset.pid);
}
function selectPerson(pid) {
  const run = runOf(), cs = run ? run.changed.filter((c) => c.actor === pid) : [];
  state.selected = pid;
  if (cs.length && !cs.some((c) => c.tick === state.week)) { state.week = cs[0].tick; rebuildArms(); }
  if (state.arm !== 'policy' && cs.length) { state.arm = 'policy'; afterArmSwitch(); }
  inspected = describePersona(pid); buildTrails(); renderPeople();
  followPersona(pid, true);
}

/* ---------- running both arms ---------- */
function rebuildArms() {
  const start = +$('start').value, density = +$('density').value, t0 = performance.now();
  state.impactTour = null; TOUR_STOP.group.visible = false;
  disposeArm(state.arms.baseline); disposeArm(state.arms.policy);
  state.arms = { baseline: buildArm('baseline', state.scenario, start, density), policy: buildArm('policy', state.scenario, start, density) };
  if (state.mapped) {
    state.windows = travelWindows(Object.values(state.arms).flatMap((a) => a.people));
    state.start = state.windows.length ? state.windows[0][0] : start; state.end = state.windows.length ? state.windows[state.windows.length - 1][1] : start + 1800;
  } else {
    state.windows = null;
    state.start = start; state.end = Math.max(start + 1800, ...Object.values(state.arms).flatMap((a) => a.agents.map((x) => x.t1)));
  }
  if (state.t < state.start || state.t > state.end) state.t = state.start;
  const sc = $('scrub'); sc.min = Math.floor(state.start); sc.max = Math.ceil(state.end);
  for (const arm of Object.values(state.arms)) {
    arm.rejected = arm.sb.events.filter((e) => e.type === 'action_rejected' || e.type === 'trip_infeasible').length;
    arm.finished = arm.sb.events.filter((e) => e.type === 'trip_completed').map((e) => e.t + e.duration_s).sort((a, b) => a - b);
  }
  state.follow = null;
  afterArmSwitch();
  console.info(`[viewer3d] ${state.scenario} week ${state.week}, seed ${SEED}: ${state.arms.policy.agents.length} agents (${state.arms.policy.people.length} persona trips) per arm in ${Math.round(performance.now() - t0)} ms`);
}
function afterArmSwitch() {
  for (const [k, a] of Object.entries(state.arms)) {
    a.group.visible = k === state.arm;
    if (k !== state.arm) for (const person of a.people) person.obj.lab.visible = false;
  }
  state.agents = curArm().agents;
  for (const a of state.agents) a.cursor = 0;
  if (state.follow && state.follow.persona) { const pid = state.follow.persona.pid; state.follow = curArm().people.find((x) => x.persona.pid === pid) || null; }
  buildTrails(); updateCues(); renderHeadline();
  if (inspected && inspected.agent) inspected = null;
  refreshInspector();
}
function setArm(a) {
  if (state.arm === a) return;
  state.impactTour = null; TOUR_STOP.group.visible = false;
  state.arm = a; state.flashUntil = performance.now() + 2600; afterArmSwitch();
  if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'viewer3d:arm', arm: a }, location.origin);
}

function tourFollowShot(p) {
  const dx = p.seg?.ux ?? 1, dy = p.seg?.uy ?? 0;
  // Stay above the road behind the actor, not behind a Bloor storefront.
  const inward = Math.abs(p.y) < 16 ? Math.sign(p.y) * 5.0 : 0;
  return {
    pos: P(p.x - dx * 14 + (Math.abs(dy) > 0.5 ? 1.5 : 0), p.y - dy * 14 - inward, 5.7),
    tgt: P(p.x + dx * 4.8, p.y + dy * 4.8, 1.45),
  };
}
function tourQueueSize(run, arm) {
  const tripTotal = (which) => run.mapped.runs[which].metrics.by_tick
    .filter((point) => point.tick >= run.mapped.scenario.policy_start)
    .reduce((n, point) => n + (point.transit_trips || 0), 0);
  const before = tripTotal('baseline');
  return arm === 'baseline' || !before ? 9 : Math.max(2, Math.min(9, Math.round(9 * tripTotal('intervention') / before)));
}
function tourSegment(person, kind, arm) {
  if (!person) return null;
  const visible = person.segs.filter((s) => !s.hidden && s.len > 6 && s.travel > 3);
  if (kind === 'bike') return visible.find((s) => arm === 'baseline' ? /trk_/.test(s.edge) : /car_|detour/.test(s.edge)) || visible[0];
  return visible.find((s) => /trk_|car_|walk_/.test(s.edge)) || visible[0];
}

/* The fork shot: one changed trip, filmed where its Baseline and With-policy routes part, from one
 * fixed camera, so the two arms are the same picture and only the person's route differs. */
function visibleTrack(person) {
  const out = [];
  if (!person) return out;
  person.cursor = 0;
  for (let t = person.t0; t < person.t1; t += 0.5) { const p = agentPose(person, t); if (p && p.h > -0.5) out.push({ t, x: p.x, y: p.y }); }
  person.cursor = 0;
  return out;
}
function forkPlan(base, pol) {
  const B = visibleTrack(base), Q = visibleTrack(pol);
  if (!B.length || !Q.length) return null;
  const gap = (s, S) => S.reduce((m, o) => Math.min(m, Math.hypot(o.x - s.x, o.y - s.y)), Infinity);
  const split = (S, O) => { const i = S.findIndex((s) => gap(s, O) > 10); return i > 0 ? S[i - 1] : null; };
  const a = split(Q, B), c = split(B, Q);
  if (!a && !c) return null;
  const fork = a && c ? { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 } : a || c;
  // Each arm: up to 12 s / 25 m before it leaves the fork, then up to 24 s / 60 m after (or until it goes underground).
  const clip = (S) => {
    const d = (s) => Math.hypot(s.x - fork.x, s.y - fork.y), near = Math.min(...S.map(d)) + 1.5;
    let k = S.findIndex((s) => d(s) <= near);
    while (k + 1 < S.length && d(S[k + 1]) <= near && S[k + 1].t - S[k].t < 1) k++;
    const far = (s, m) => Math.hypot(s.x - S[k].x, s.y - S[k].y) > m;
    let i = k, j = k;
    while (i > 0 && S[i].t - S[i - 1].t < 1 && S[k].t - S[i - 1].t <= 12 && !far(S[i - 1], 25)) i--;
    while (j + 1 < S.length && S[j + 1].t - S[j].t < 1 && S[j + 1].t - S[k].t <= 24 && !far(S[j + 1], 60)) j++;
    return { from: S[i].t, to: S[j].t, pts: S.slice(i, j + 1) };
  };
  const baseline = clip(B), policy = clip(Q), pts = [...baseline.pts, ...policy.pts, fork];
  const xs = pts.map((s) => s.x), ys = pts.map((s) => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(20, Math.hypot(x1 - x0, y1 - y0) / 2);
  // Stand behind the fork, looking along Bloor toward where the routes go, high enough to clear the shopfronts.
  // Aim near the fork so it sits mid-frame, clear of the tour card at the bottom.
  const tx = fork.x + (cx - fork.x) * 0.4, ty = fork.y + (cy - fork.y) * 0.4;
  const side = cx >= fork.x ? -1 : 1, dist = r * 2.2, horiz = dist * Math.cos(0.72), up = dist * Math.sin(0.72);
  return { fork, baseline, policy, shot: { pos: P(tx + side * horiz, ty - 6, Math.max(26, up)), tgt: P(tx, ty, 1.5) } };
}

/* A guided, event-backed comparison. The bus and stop are scheduled GTFS context; the
 * highlighted person's mode and the policy-specific street treatment come from the run. */
function showImpactPhase({ arm, actor, trip, tick, kind, focus }) {
  const run = runOf();
  if (!EMBED || !run || !run.mapped || !['baseline', 'policy'].includes(arm)) return;
  const choice = run.changed.find((c) => c.actor === actor && c.trip === trip && c.tick === tick);
  if (!choice) return;
  if (state.week !== tick) { state.week = tick; rebuildArms(); }
  setArm(arm);
  const mine = (a) => a.persona.pid === actor && a.persona.trip === trip;
  const person = curArm().people.find(mine);
  const atStop = kind === 'fare' && focus === 'stop';
  const plan = !atStop && forkPlan(state.arms.baseline.people.find(mine), state.arms.policy.people.find(mine));
  if (plan) {
    const w = plan[arm];
    state.t = w.from;
    for (const a of state.agents) a.cursor = 0;
    state.playing = true; $('play').textContent = '❚❚';
    state.speed = Math.max(1, Math.min(4, (w.to - w.from) / 7));
    state.impactKind = kind;
    state.selected = actor;
    state.follow = person || null;
    state.impactTour = { kind, arm, focus: 'fork', person, loopFrom: w.from, loopTo: w.to + 1.5 };
    TOUR_STOP.group.visible = false;
    buildTrails();
    updateAgents(state.t); updateVehicles(state.t);
    if (camera.position.distanceTo(plan.shot.pos) > 2) tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: plan.shot, t0: performance.now(), dur: 1500 };
    return;
  }
  const seg = tourSegment(person, kind, arm);
  const route7 = SCHED.find((s) => s.kind === 'bus' && s.route === '7' && s.dir === '1');
  // The scheduled bus time is the same in both arms. A stop queue is a visual
  // illustration of the sample transit-trip ratio, never a stop-level estimate.
  const busAt = atStop && route7?.deps.find((d) => d >= (person?.t0 || state.start) + 30 && d < state.end - 25);
  const from = atStop && busAt ? busAt - 3 : seg ? seg.t + seg.wait + Math.min(1.2, seg.travel * 0.1) : person?.t0 || state.start;
  const until = atStop && busAt ? busAt + DWELL + 3 : person ? Math.min(person.t1 - 0.2, from + 120) : from + 60;
  state.t = Math.max(state.start, Math.min(state.end, from));
  for (const a of state.agents) a.cursor = 0;
  state.playing = true; $('play').textContent = '❚❚';
  state.speed = 4; $('speed').value = '4';
  state.impactKind = kind;
  state.selected = actor;
  state.follow = atStop ? null : person || null;
  state.impactTour = { kind, arm, focus: atStop ? 'stop' : 'follow', person, loopFrom: state.t, loopTo: Math.max(state.t + 4, until) };
  buildTrails();
  state.flashUntil = performance.now() + 9000;
  updateAgents(state.t); updateVehicles(state.t);
  TOUR_STOP.group.visible = atStop;
  TOUR_STOP.busAt = busAt || Infinity;
  TOUR_STOP.figures.forEach((figure, i) => { figure.visible = atStop && i < tourQueueSize(run, arm); });
  const target = atStop
    ? { pos: P(-4.3, TOUR_STOP.y + 25, 7.4), tgt: P(7.3, TOUR_STOP.y - 1, 1.5) }
    : person?.pose ? tourFollowShot(person.pose) : { pos: P(170, -2, 14), tgt: P(230, 0, 1.5) };
  tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to: target, t0: performance.now(), dur: 1500 };
}

/* ---------- dashboard ---------- */
function renderStats() {
  const arm = curArm(); if (!arm) return;
  $('stats').innerHTML = `<span>${state.arm === 'policy' ? 'With policy' : 'Baseline'} · <b>${counts.people}</b> of the people we follow are on the street now${state.mapped ? ` · period ${state.week}` : ''}</span>`;
}

/* ---------- inspector + tooltip ---------- */
let inspected = null;
function refreshInspector() {
  if (!inspected) { $('insp').classList.remove('open'); return; }
  if (inspected.persona) inspected = describePersona(inspected.persona) || inspected;
  const d = inspected, rows = typeof d.rows === 'function' ? d.rows() : d.rows;
  $('inspBody').innerHTML = `<h3>${esc(d.title)}</h3><div class="note">${d.kind} ${chip(d.status)}</div>
    <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    ${d.action ? `<div class="btns"><button id="inspAction">${d.action.label}</button></div>` : ''}
    ${d.note ? `<div class="note">${d.note}</div>` : ''}`;
  if (d.action) $('inspAction').onclick = d.action.run;
  $('insp').classList.add('open');
}
$('inspClose').onclick = () => { inspected = null; state.follow = null; state.selected = null; buildTrails(); renderPeople(); refreshInspector(); };

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let pointer = null, hoverDirty = false, downAt = null;
function effectiveVisible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function pickAt(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const objs = pickables.filter(effectiveVisible);
  const hits = ray.intersectObjects(objs, true);
  // Persona agents win over anything behind them within a few metres, since they are small.
  hits.sort((a, b) => (a.distance - (isPersonaHit(a) ? 6 : 0)) - (b.distance - (isPersonaHit(b) ? 6 : 0)));
  for (const h of hits) {
    let o = h.object; while (o && !o.userData.describe) o = o.parent;
    if (!o) continue;
    const d = o.userData.describe(h);
    if (d) return d;
  }
  return null;
}
function isPersonaHit(h) { for (let o = h.object; o; o = o.parent) if (o.userData.describe) return o.isGroup && o.parent && o.parent.parent === groups.agents; return false; }
renderer.domElement.addEventListener('pointermove', (e) => { pointer = [e.clientX, e.clientY]; hoverDirty = true; });
renderer.domElement.addEventListener('pointerleave', () => { pointer = null; $('tip').style.display = 'none'; highlightBuilding(null); });
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  let d = pickAt(e.clientX, e.clientY);
  if (EMBED && d && !d.persona && !d.agent) d = null;              // inside /experience/: no overlay cards for buildings or street furniture
  if (d && d.persona) { state.selected = d.persona; buildTrails(); renderPeople(); } else if (!d) { state.follow = null; if (state.selected) { state.selected = null; buildTrails(); renderPeople(); } }
  inspected = d; refreshInspector();
});
function updateHover() {
  if (!hoverDirty || !pointer) return;
  hoverDirty = false;
  let d = pickAt(pointer[0], pointer[1]);
  const tip = $('tip');
  if (EMBED && d && !d.persona) d = null;
  highlightBuilding(d && d.kind === 'Building' ? d.obj : null);
  if (!d) { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; return; }
  const rows = typeof d.rows === 'function' ? d.rows() : d.rows;
  tip.innerHTML = `<b>${esc(d.title)}</b><span>${d.kind}${rows[0] ? ` · ${String(rows[0][1]).replace(/<[^>]+>/g, ' ').slice(0, 70)}` : ''}</span>`;
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
    updateCues(); hoverDirty = true;
  };
}
$('trails').onchange = () => { if (trailGroup) trailGroup.visible = $('trails').checked; };
$('allNames').onchange = () => { state.labelsAll = $('allNames').checked; };
function legend() {
  const res = groups.residents.visible;
  const items = res ? [[heatColor(0.15).getStyle(), 'few residents'], [heatColor(1).getStyle(), 'many residents (est.)']] : Object.entries(USE_COL).map(([k, v]) => [v, k.replace('_', '-')]);
  items.push(...Object.entries(CAT_COL).map(([k, v]) => [v, CAT_NAME[k]]), ['#2f9e6f', 'cycle track'], ['#8fd3b4', 'subway entrance'], ['#e0362b', 'surface stop / streetcar'], ['#ff3df0', 'persona: choice changed'], ['#ffffff', 'persona: same choice']);
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
  state.follow = null; state.impactTour = null; TOUR_STOP.group.visible = false;
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.tgt); controls.update(); return; }
  tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone() }, to, t0: performance.now(), dur: 1800 };
  for (const b of document.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === name);
}
for (const b of document.querySelectorAll('[data-preset]')) b.onclick = () => goPreset(b.dataset.preset);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
$('layersBtn').onclick = () => { $('layers').hidden = !$('layers').hidden; $('layersBtn').classList.toggle('on', !$('layers').hidden); };
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
  for (const [m, v] of [[MAT.asphalt, 0.05], [MAT.sidewalk, 0.13], [MAT.white, 0.12], [MAT.path, 0.08]]) { m.emissive.set('#ffd29a'); m.emissiveIntensity = v * k; }
  state.trackGlow = 0.1 * k;
  document.body.style.background = skyUniforms.horizon.value.getStyle();
}

/* ---------- controls ---------- */
$('play').onclick = () => { state.playing = !state.playing; $('play').textContent = state.playing ? '❚❚' : '▶'; };
$('speed').onchange = () => { state.speed = +$('speed').value; };
$('scrub').oninput = () => { state.t = +$('scrub').value; for (const a of state.agents) a.cursor = 0; };
const busy = (fn) => { $('stats').textContent = 'Running the seeded sandbox (baseline and policy, same seed)…'; setTimeout(fn, 30); };
for (const id of ['start', 'track', 'density']) $(id).onchange = () => busy(rebuildArms);
$('scen').onchange = () => { state.scenario = $('scen').value; state.selected = null; inspected = null; const r = runOf(); if (r) state.week = Math.max(r.policy_start, state.week); busy(rebuildArms); };
$('week').onchange = () => { state.week = +$('week').value; busy(rebuildArms); };
for (const b of document.querySelectorAll('[data-arm]')) b.onclick = () => setArm(b.dataset.arm);
window.addEventListener('keydown', (e) => {
  if (e.target !== document.body) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.key === 'b' || e.key === 'B') setArm(state.arm === 'policy' ? 'baseline' : 'policy');
});

/* Live replay: when the page is served by the persona server (persona-swarm/runtime/server.js), load
 * its newest saved run instead of the bundled one. Read-only GETs; no model calls. */
(async () => {
  if (!/^https?:$/.test(location.protocol) || EMBED || $('live').hidden) return;   // the live-run button is off for the demo
  try {
    const h = await fetch('/health'); if (!h.ok) return;
    const info = await h.json(); if (!info || !('backend' in info)) return;
    $('live').style.display = '';
    $('live').onclick = async () => {
      $('live').textContent = 'Loading…';
      try {
        const { compactRun } = await import('./personas-adapter.js');
        for (const [k, pol] of [['fare', 'fare'], ['bloor', 'bloor']]) {
          const r = await fetch(`/replay/latest?kind=run&policy=${pol}`); if (!r.ok) continue;
          const rec = (await r.json()).record; if (!rec || !rec.result) continue;
          const c = compactRun(rec);
          for (const p of c.personas) if (!PD.personas[p.id]) PD.personas[p.id] = p;
          delete c.personas; PD.runs[k] = c;
        }
        $('live').textContent = 'Latest live run loaded'; busy(rebuildArms);
      } catch (e) { $('live').textContent = 'Live load failed'; console.warn(e); }
    };
  } catch (e) { /* not served by the persona server */ }
})();

// CSS2D labels ignore a hidden parent group, so each one is set directly. The tour keeps only its person,
// the station and the fare tags on screen.
function syncTourOverlays() {
  const tour = !!state.impactTour;
  for (const m of UNDER) m.visible = !tour;
  for (const o of STREET_LABELS) o.visible = !tour && groups.labels.visible;
  if (TOUR_STOP.label) TOUR_STOP.label.visible = TOUR_STOP.group.visible;
  const detours = state.scenario === 'bike' && groups.cycling.visible && !tour && (!state.mapped || !!curArm()?.agents.some((a) => a.detour));
  for (const d of CUES.detour) d.visible = detours;
}
function endTour() {
  state.impactTour = null; state.follow = null; TOUR_STOP.group.visible = false;
  state.speed = 10; $('speed').value = '10';
  buildTrails();
}

/* ---------- main loop ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); labelRenderer.setSize(window.innerWidth, window.innerHeight);
});
let lastFrame = performance.now(), lastUi = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if (state.playing) {
    state.t += dt * state.speed;
    if (state.impactTour && state.t > state.impactTour.loopTo) {
      state.t = state.impactTour.loopFrom;
      for (const a of state.agents) a.cursor = 0;
    }
    if (state.t > state.end) { state.t = state.start; for (const a of state.agents) a.cursor = 0; }
    if (!state.impactTour && state.windows && !state.windows.some((w) => state.t >= w[0] && state.t <= w[1])) { const nx = state.windows.find((w) => w[0] > state.t); state.t = nx ? nx[0] : state.start; }
  }
  const target = state.night ? 1 : 0;
  if (state.nightK !== target) { state.nightK += Math.sign(target - state.nightK) * Math.min(Math.abs(target - state.nightK), dt / 1.4); applyLighting(state.nightK); }
  MAT.track.emissive.set(state.trackPulse ? '#ff7a00' : '#ffd29a');
  MAT.track.emissiveIntensity = state.trackPulse ? 0.35 + 0.3 * Math.sin(now / 260) : state.trackGlow || 0;
  updateAgents(state.t); updateVehicles(state.t); updateSignals(state.t); updateTourPath();
  if (tween) {
    const k = Math.max(0, Math.min(1, (now - tween.t0) / tween.dur)), e = ease(k);
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, e); controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, e);
    if (k >= 1) tween = null;
  }
  syncTourOverlays();
  if (!tween && state.follow && state.follow.pose && state.follow.pose.h > -0.5 && state.impactTour?.focus !== 'fork') {
    if (state.impactTour?.focus === 'follow') {
      const shot = tourFollowShot(state.follow.pose);
      controls.target.lerp(shot.tgt, 0.13);
      camera.position.lerp(shot.pos, 0.105);
    } else {
      const p = state.follow.pose, goal = P(p.x, p.y, 1), d = goal.sub(controls.target).multiplyScalar(0.12);
      controls.target.add(d); camera.position.add(d);
    }
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

// Optional URL hash, e.g. #scenario=fare&arm=baseline&week=3&person=a025&preset=flyover&t=08:12&night=1&pause=1.
const HASH = new URLSearchParams(location.hash.slice(1));
if (HASH.get('track')) $('track').value = HASH.get('track');
if (SCEN[HASH.get('scenario')]) state.scenario = HASH.get('scenario');
if (!PD && state.scenario !== 'sandbox') state.scenario = 'sandbox';
if (['baseline', 'policy'].includes(HASH.get('arm'))) state.arm = HASH.get('arm');
if (HASH.get('week')) state.week = +HASH.get('week');
$('scen').value = state.scenario;
// Embedded in /experience/ (?embed=1): show the page's own mapped run and follow its Baseline/Policy toggle.
if (EMBED) document.body.classList.add('embed');
// Embedded, the wheel scrolls the page instead of zooming (OrbitControls skips preventDefault when zoom is off).
if (EMBED) controls.enableZoom = false;
let parentRun = null;
if (EMBED) { try { parentRun = window.parent !== window ? window.parent.CounterfactualCurrentRun : null; } catch (e) { parentRun = null; } }
if (!(parentRun && setMappedRun(parentRun))) rebuildArms();
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || !ev.data || typeof ev.data !== 'object') return;
  const d = ev.data;
  if (d.type === 'viewer3d:run') setMappedRun(d.result);
  if (d.type === 'viewer3d:arm') setArm(d.arm === 'baseline' ? 'baseline' : 'policy');
  if (d.type === 'viewer3d:person' && personaById(d.id)) selectPerson(d.id);
  if (d.type === 'viewer3d:impact-phase') showImpactPhase(d);
  if (d.type === 'viewer3d:tour-hold') { state.playing = false; $('play').textContent = '▶'; }
  if (d.type === 'viewer3d:tour-end') { endTour(); state.playing = true; $('play').textContent = '❚❚'; }
});
if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'viewer3d:ready' }, location.origin);
const startPreset = PRESETS[HASH.get('preset')] ? HASH.get('preset') : 'overview';
goPreset(startPreset, true);
document.querySelector(`[data-preset="${startPreset}"]`).classList.add('on');
if (HASH.get('t')) { const [h, m = 0, s = 0] = HASH.get('t').split(':').map(Number); state.t = HASH.get('t').includes(':') ? h * 3600 + m * 60 + s : h; }
if (HASH.get('night') === '1') { state.night = true; state.nightK = 1; $('night').classList.add('on'); $('night').textContent = '☀ Day'; }
if (HASH.get('cam')) { const c = HASH.get('cam').split(',').map(Number); camera.position.copy(P(c[0], c[1], c[2])); controls.target.copy(P(c[3], c[4], c[5])); controls.update(); }
if (HASH.get('pause') === '1') { state.playing = false; $('play').textContent = '▶'; }
if (HASH.get('person') && personaById(HASH.get('person'))) { if (HASH.get('cam')) { state.selected = HASH.get('person'); inspected = describePersona(state.selected); buildTrails(); renderPeople(); refreshInspector(); } else selectPerson(HASH.get('person')); }
applyLighting(state.nightK);
loading.remove();
window.__viewer3d = { state, scene, camera, controls, goPreset, pickAt, selectPerson, setArm, world: W, personas: PD, ready: true,
  tick: (t = state.t) => { state.t = t; updateAgents(t); updateVehicles(t); updateSignals(t); renderer.render(scene, camera); } };   // for debugging and tests
requestAnimationFrame(frame);
