(function () {
// A small, deterministic canvas city for the cinematic UI prototype.
// Visual positions are illustrative; source-backed facts live in the scenario fixtures.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => lerp(a, b, 1 - Math.pow(1 - t, 3));
const hash = (x, y, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

const palette = {
  road: '#18313c', roadEdge: '#4a6b70', ground: '#254b4b', grass: '#2c6057',
  bike: '#6bdbb5', bikeEdge: '#b7fbe0', coral: '#ff987e', mint: '#a8f4d1',
  apartment: ['#7d9cb1', '#94b4bd', '#62849a'],
  office: ['#457987', '#4b8894', '#5b95a0'],
  shop: ['#bc8c75', '#d6a17d', '#ad826f'],
  home: ['#bd968b', '#a7a7a4', '#d6aa82'],
};

function shade(hex, amount) {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => clamp(parseInt(c.slice(i, i + 2), 16) + amount, 0, 255));
  return `rgb(${v.join(',')})`;
}

class CityScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.time = 0;
    this.running = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.phase = 'intro';
    this.scenario = 'fare';
    this.mode = 'policy';
    this.selectedSector = null;
    this.progress = 0.7;
    this.reveal = 0;
    this.camera = { zoom: 0.96, panX: 0, panY: 25 };
    this.target = { zoom: 0.96, panX: 0, panY: 25 };
    this.plots = this.createPlots();
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.resize, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.lastFrame = 0; });
    this.resize();
    requestAnimationFrame(this.frame);
  }

  createPlots() {
    const plots = [];
    for (let x = 1; x < 17; x++) for (let y = 1; y < 17; y++) {
      if (x === 7 || x === 8 || y === 7 || y === 8) continue;
      if ((x + y) % 5 === 0 && hash(x, y) > 0.55) continue;
      const r = hash(x, y, 3);
      if (r < (this.scenario === 'bike' ? .12 : .19)) { plots.push({ x, y, type: 'tree' }); continue; }
      let type = r > .81 ? 'shop' : (r > .53 ? 'apartment' : (r > .31 ? 'office' : 'home'));
      if (x > 10 && y > 10 && r > .39) type = 'shop';
      if (x < 5 && y > 9) type = r > .57 ? 'apartment' : 'home';
      if (this.scenario === 'bike') {
        if (y === 6 || y === 9) type = r > .22 ? 'shop' : 'home';
        else if (r < .8) type = r > .46 ? 'apartment' : 'home';
      }
      let height = type === 'office' ? 54 + hash(x, y, 5) * 44 : type === 'apartment' ? 39 + hash(x, y, 5) * 39 : type === 'shop' ? 18 + hash(x, y, 5) * 11 : 19 + hash(x, y, 5) * 13;
      if (this.scenario === 'bike') height = Math.min(height, type === 'apartment' ? 51 : 35);
      plots.push({ x, y, type, height, tint: Math.floor(hash(x, y, 6) * 3) });
    }
    plots.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    return plots;
  }

  resize() {
    const bounds = this.canvas.dataset.fit === 'parent' ? this.canvas.parentElement.getBoundingClientRect() : null;
    this.w = bounds ? Math.max(1, Math.round(bounds.width)) : window.innerWidth;
    this.h = bounds ? Math.max(1, Math.round(bounds.height)) : window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.updateCamera();
  }

  setPhase(phase) { this.phase = phase; this.updateCamera(); }
  setScenario(scenario) { this.scenario = scenario; this.plots = this.createPlots(); this.updateCamera(); }
  setMode(mode) { this.mode = mode; }
  setSector(sector) { this.selectedSector = sector; this.updateCamera(); }
  setProgress(value, pause = false) {
    this.progress = clamp(value, 0, 1);
    this.time = this.progress * 100;
    if (pause) this.running = false;
  }
  setReveal(value) { this.reveal = clamp(value, 0, 1); this.updateCamera(); }
  setMotion(running) { this.running = running && !this.reduced; return this.running; }
  toggleMotion() { return this.setMotion(!this.running); }

  updateCamera() {
    if (this.phase === 'intro' || this.phase === 'composer') {
      this.target.zoom = this.w < 650 ? 0.72 : this.w < 1100 ? 0.86 : 0.98;
      this.target.panX = this.w < 650 ? 0 : this.w * 0.12;
      this.target.panY = this.h * (0.07 - this.reveal * 0.025);
    } else if (this.phase === 'lab') {
      this.target.zoom = this.w < 760 ? 1.12 : this.w < 1200 ? 1.22 : 1.52;
      this.target.panX = this.w < 760 ? 0 : this.w * 0.044;
      this.target.panY = this.w < 760 ? this.h * 0.02 : this.h * 0.025;
      if (this.scenario === 'bike') { this.target.panX -= this.w * .018; this.target.panY += 18; }
    } else {
      this.target.zoom = this.w < 760 ? 0.75 : 1.08;
      this.target.panX = 0;
      this.target.panY = this.h * .06;
    }
  }

  project(x, y, z = 0) {
    const unit = Math.min(this.w / 17.5, this.h / 9.8, 77) * this.camera.zoom;
    return {
      x: this.w * .5 + this.camera.panX + (x - y) * unit * .53,
      y: this.h * .45 + this.camera.panY + (x + y - 18) * unit * .295 - z * this.camera.zoom,
    };
  }

  poly(points, color, stroke = null, width = 1) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.closePath(); c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  }

  line(points, color, width = 1, dash = []) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.stroke(); c.setLineDash([]);
  }

  circle(point, radius, color) {
    const c = this.ctx; c.beginPath(); c.arc(point.x, point.y, radius, 0, Math.PI * 2); c.fillStyle = color; c.fill();
  }

  drawBase() {
    const ctx = this.ctx;
    const a = this.project(-2, -2, -4), b = this.project(20, -2, -4), d = this.project(-2, 20, -4), c = this.project(20, 20, -4);
    this.poly([a, b, c, d], '#132e37');
    this.poly([this.project(0, 0), this.project(18, 0), this.project(18, 18), this.project(0, 18)], '#25504c', '#60928267', 1);
    for (let sum = 0; sum <= 34; sum++) for (let x = 0; x < 18; x++) {
      const y = sum - x; if (y < 0 || y >= 18) continue;
      const road = x === 7 || x === 8 || y === 7 || y === 8;
      const path = [this.project(x, y), this.project(x + 1, y), this.project(x + 1, y + 1), this.project(x, y + 1)];
      if (road) {
        const isBike = this.scenario === 'bike' && (y === 7 || y === 8) && this.mode === 'baseline';
        const isFare = this.scenario === 'fare' && y === 7;
        let fill = (x + y) % 2 ? '#19343d' : '#1b3841';
        if (isBike && y === 7) fill = '#2e806e';
        if (isFare && y === 7) fill = '#234f57';
        this.poly(path, fill, '#72958a17');
        if (x === 7 || y === 7) {
          const c1 = this.project(x + .24, y + .5, 1), c2 = this.project(x + .73, y + .5, 1);
          this.line([c1, c2], isBike ? '#c1ffe5ad' : '#b6c6ad62', this.camera.zoom * 1.3);
        }
        if (isBike) {
          this.line([this.project(x, y + .09, 1), this.project(x + 1, y + .09, 1)], '#abffe1aa', this.camera.zoom * 1.4);
          this.line([this.project(x, y + .91, 1), this.project(x + 1, y + .91, 1)], '#abffe1aa', this.camera.zoom * 1.4);
        }
      } else {
        const r = hash(x, y);
        let fill = r > .72 ? '#315e52' : (r > .36 ? '#2d594f' : '#2b534d');
        if (x > 10 && y < 5) fill = '#2b6458';
        this.poly(path, fill, '#a0c7a517', .8);
        if ((x + y) % 6 === 0) {
          const p = this.project(x + .5, y + .5, 1);
          this.circle(p, 1.5 * this.camera.zoom, '#a9dcb744');
        }
      }
    }
    // Crosswalks and junction lighting make the two policy corridors readable.
    for (let i = 0; i < 5; i++) {
      this.line([this.project(6.73 + i * .12, 7.04, 2), this.project(6.73 + i * .12, 7.94, 2)], '#f0eee7a0', this.camera.zoom * 1.7);
      this.line([this.project(8.07, 6.7 + i * .12, 2), this.project(8.94, 6.7 + i * .12, 2)], '#f0eee7a0', this.camera.zoom * 1.7);
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const glow = this.project(8.2, 7.9, 4);
    const g = ctx.createRadialGradient(glow.x, glow.y, 10, glow.x, glow.y, 190 * this.camera.zoom);
    g.addColorStop(0, this.scenario === 'bike' ? '#7ce6bd32' : '#7bdfe930'); g.addColorStop(1, '#ffffff00');
    ctx.fillStyle = g; ctx.fillRect(glow.x - 200, glow.y - 200, 400, 400); ctx.restore();
  }

  drawBuilding(plot) {
    const { x, y, type, height, tint } = plot;
    if (type === 'tree') { this.drawTree(x + .5, y + .5); return; }
    const scale = type === 'shop' ? .72 : type === 'home' ? .69 : .77;
    const left = x + (1 - scale) / 2, top = y + (1 - scale) / 2, right = left + scale, bottom = top + scale;
    const z = height * this.camera.zoom;
    const p00 = this.project(left, top), p10 = this.project(right, top), p11 = this.project(right, bottom), p01 = this.project(left, bottom);
    const t00 = { x: p00.x, y: p00.y - z }, t10 = { x: p10.x, y: p10.y - z }, t11 = { x: p11.x, y: p11.y - z }, t01 = { x: p01.x, y: p01.y - z };
    const color = palette[type][tint];
    this.poly([p00, p10, p11, p01], '#03151b6d');
    this.poly([p01, p11, t11, t01], shade(color, -50), '#0a252a88');
    this.poly([p10, p11, t11, t10], shade(color, -33), '#0a252a88');
    this.poly([t00, t10, t11, t01], shade(color, 16), '#d8fbf268');
    if (type === 'office' || type === 'apartment') {
      const rows = type === 'office' ? 5 : 4;
      for (let row = 1; row <= rows; row++) {
        const v = row / (rows + .7);
        for (let col = 1; col <= 2; col++) {
          const u = col / 3;
          const front = this.project(left + scale * u, bottom, 0);
          const back = this.project(right, top + scale * u, 0);
          const wy = z * v;
          const lit = hash(x + row, y + col, 8) > .43;
          this.circle({ x: front.x, y: front.y - wy }, Math.max(1, 2.1 * this.camera.zoom), lit ? '#f8efb8bd' : '#6fa5ad7a');
          this.circle({ x: back.x, y: back.y - wy }, Math.max(1, 2.1 * this.camera.zoom), lit ? '#d8f4dad0' : '#4e95a080');
        }
      }
      // Rooftop structures.
      if (hash(x, y, 15) > .62) this.poly([
        { x: t00.x + 3, y: t00.y + 5 }, { x: t10.x - 4, y: t10.y + 5 },
        { x: t11.x - 5, y: t11.y - 4 }, { x: t01.x + 4, y: t01.y - 4 },
      ], '#183c48', '#a6d6ca76');
    }
    if (type === 'shop') {
      this.line([this.project(left + .07, bottom, height * .48), this.project(right - .08, bottom, height * .48)], '#fff0b6', 2 * this.camera.zoom);
      this.line([this.project(right, top + .06, height * .48), this.project(right, bottom - .08, height * .48)], '#fff0b6', 2 * this.camera.zoom);
      const awning = [this.project(left + .08, bottom + .02, height * .6), this.project(right - .04, bottom + .02, height * .6)];
      this.line(awning, this.scenario === 'bike' ? '#f7b491' : '#a6e3d1', 4 * this.camera.zoom);
      if (this.selectedSector === 'commerce') {
        const c = this.project(x + .5, y + .5, height + 6);
        this.circle(c, 4 * this.camera.zoom, '#ffb181');
      }
    }
    if (type === 'home') {
      this.line([t00, t10, t11, t01, t00], '#f7d7ab79', 1.4 * this.camera.zoom);
      this.circle({ x: lerp(p01.x, t01.x, .45), y: lerp(p01.y, t01.y, .45) }, 2.3 * this.camera.zoom, '#f7e9b3');
    }
  }

  drawTree(x, y) {
    const p = this.project(x, y); const z = 13 * this.camera.zoom;
    this.line([p, { x: p.x, y: p.y - z }], '#ad836a', 2.4 * this.camera.zoom);
    this.circle({ x: p.x, y: p.y - z - 5 * this.camera.zoom }, 8.5 * this.camera.zoom, '#518d67');
    this.circle({ x: p.x - 3 * this.camera.zoom, y: p.y - z - 8 * this.camera.zoom }, 5.6 * this.camera.zoom, '#77ae78');
  }

  drawVehicle(x, y, direction, kind, color, label = null) {
    const long = kind === 'bus' ? .81 : kind === 'car' ? .46 : .3;
    const wide = kind === 'bus' ? .37 : kind === 'car' ? .31 : .17;
    const h = kind === 'bus' ? 12 : kind === 'car' ? 7 : 4;
    const point = (along, across, z = 0) => direction === 2 ? this.project(x + across, y + along, z) : this.project(x + along, y + across, z);
    const a = point(-long / 2, -wide / 2, h), b = point(long / 2, -wide / 2, h);
    const c = point(long / 2, wide / 2, h), d = point(-long / 2, wide / 2, h);
    const b0 = point(long / 2, -wide / 2), c0 = point(long / 2, wide / 2), d0 = point(-long / 2, wide / 2);
    this.poly([d, c, c0, d0], shade(color, -60), '#082025');
    this.poly([b, c, c0, b0], shade(color, -40), '#082025');
    this.poly([a, b, c, d], color, '#e9fff3a4');
    if (kind === 'bus') {
      this.line([point(-.2, wide / 2, h * .47), point(.24, wide / 2, h * .47)], '#d5e6e5', 2 * this.camera.zoom);
      this.line([point(long / 2, -.06, h * .55), point(long / 2, .09, h * .55)], '#d5e6e5', 2 * this.camera.zoom);
    }
    if (label) {
      const p = this.project(x, y, h + 15);
      this.ctx.font = `700 ${Math.max(7, 8 * this.camera.zoom)}px DM Sans, sans-serif`;
      this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#f0ffe9'; this.ctx.fillText(label, p.x, p.y);
    }
  }

  drawPerson(x, y, color = '#e5dcb4', active = false) {
    const p = this.project(x, y, 0); const size = Math.max(2, 3 * this.camera.zoom);
    this.circle({ x: p.x, y: p.y - 11 * this.camera.zoom }, size, color);
    this.line([{ x: p.x, y: p.y - 8 * this.camera.zoom }, { x: p.x, y: p.y - 1 * this.camera.zoom }], color, Math.max(1.5, this.camera.zoom * 2));
    if (active) this.circle({ x: p.x, y: p.y - 13 * this.camera.zoom }, 6.5 * this.camera.zoom, '#a8f4d122');
  }

  drawBike(x, y, t) {
    const p = this.project(x, y, 0);
    const r = 3 * this.camera.zoom;
    this.ctx.strokeStyle = '#a7f8dc'; this.ctx.lineWidth = 1.35 * this.camera.zoom;
    for (const dx of [-r, r]) { this.ctx.beginPath(); this.ctx.arc(p.x + dx, p.y, r * .55, 0, Math.PI * 2); this.ctx.stroke(); }
    this.line([{ x: p.x - r, y: p.y }, { x: p.x, y: p.y - r }, { x: p.x + r, y: p.y }], '#caffea', 1.2 * this.camera.zoom);
    this.circle({ x: p.x + Math.sin(t * 2) * .3, y: p.y - 8 * this.camera.zoom }, 2.1 * this.camera.zoom, '#ffe0b2');
  }

  drawTransitNode() {
    const bike = this.scenario === 'bike';
    const custom = this.scenario === 'custom';
    const p = bike ? this.project(12.1, 8.85, 0) : this.project(5.3, 8.85, 0);
    const width = (bike ? 16 : 21) * this.camera.zoom;
    const height = (bike ? 15 : 20) * this.camera.zoom;
    this.ctx.fillStyle = bike ? '#162e38' : '#3a706c';
    this.ctx.fillRect(p.x - width / 2, p.y - height, width, height);
    this.ctx.strokeStyle = '#d6fff1aa'; this.ctx.lineWidth = this.camera.zoom;
    this.ctx.strokeRect(p.x - width / 2, p.y - height, width, height);
    this.ctx.fillStyle = '#a8f4d1';
    this.ctx.textAlign = 'center';
    this.ctx.font = `700 ${Math.max(7, 8 * this.camera.zoom)}px DM Sans, sans-serif`;
    this.ctx.fillText(bike ? 'T' : custom ? 'HUB' : 'BUS', p.x, p.y - 5 * this.camera.zoom);
    if (this.phase === 'lab') {
      this.ctx.font = `700 ${Math.max(7, 8 * this.camera.zoom)}px DM Sans, sans-serif`;
      this.ctx.fillStyle = '#e2f9ee';
      this.ctx.fillText(bike ? 'SUBWAY' : custom ? 'CITY' : 'UTSC', p.x, p.y - height - 6 * this.camera.zoom);
    }
  }

  drawActors() {
    const t = this.time;
    const speed = this.scenario === 'bike' && this.mode === 'policy' ? .11 : .14;
    const busCount = this.scenario === 'bike' ? 1 : this.scenario === 'custom' ? 2 : this.mode === 'policy' ? 2 : 3;
    for (let i = 0; i < busCount; i++) {
      const position = 1 + ((t * .16 + i * 5.8) % 16);
      if (this.scenario === 'bike') this.drawVehicle(7.65, position, 2, 'bus', '#e6ae79');
      else this.drawVehicle(position, 8.15, 1, 'bus', '#e6ae79', i === 0 && this.phase === 'lab' ? 'TTC' : null);
    }
    const carCount = this.scenario === 'bike' && this.mode === 'policy' ? 8 : 5;
    for (let i = 0; i < carCount; i++) {
      const y = 1 + ((t * (speed + i * .006) + i * 3.7) % 16);
      this.drawVehicle(8.37 + (i % 2) * .3, y, 2, 'car', ['#e3d4b6', '#f69782', '#84b4ba', '#cedde0'][i % 4]);
    }
    const bikeCount = this.scenario === 'bike' ? (this.mode === 'baseline' ? 9 : 4) : 3;
    for (let i = 0; i < bikeCount; i++) {
      const x = 1 + ((t * (.23 + .012 * i) + i * 2.7) % 16);
      const detour = this.scenario === 'bike' && this.mode === 'policy' && i % 2 === 0;
      this.drawBike(x, detour ? 6.45 : 7.17, t);
    }
    const people = this.w < 650 ? 18 : 34;
    for (let i = 0; i < people; i++) {
      const baseX = 1 + hash(i, 2) * 16, baseY = 1 + hash(i, 4) * 16;
      const drift = (t * (.05 + hash(i, 6) * .045)) % 1.4;
      const x = clamp(baseX + (i % 2 ? drift : -drift), 0, 18);
      const y = clamp(baseY + (i % 2 ? -.12 : .12), 0, 18);
      if ((Math.floor(x) === 7 || Math.floor(x) === 8) && (Math.floor(y) === 7 || Math.floor(y) === 8)) continue;
      this.drawPerson(x, y, i % 4 === 0 ? '#ffb395' : (i % 4 === 1 ? '#d7e9e3' : '#aee8d0'), i % 13 === 0);
    }
  }

  drawTrails() {
    if (this.scenario === 'custom' || (this.phase === 'intro' && this.reveal < .4)) return;
    const c = this.ctx; c.save(); c.globalCompositeOperation = 'screen';
    const paths = this.scenario === 'bike'
      ? [[this.project(4, 7.1, 8), this.project(8, 7.1, 8), this.project(12, 10, 23)], [this.project(9, 7.1, 8), this.project(11, 11, 20), this.project(14, 12, 18)]]
      : [[this.project(3, 8, 12), this.project(8, 8, 12), this.project(12, 11, 24)], [this.project(8, 7, 12), this.project(11, 9, 22), this.project(14, 13, 25)]];
    paths.forEach((points, i) => {
      c.beginPath(); c.moveTo(points[0].x, points[0].y); c.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y);
      c.lineWidth = (i === 0 ? 1.8 : 1.3) * this.camera.zoom; c.strokeStyle = i === 0 ? '#a5ffdc98' : '#ffac8a9e';
      c.setLineDash([2, 8]); c.lineDashOffset = -this.time * 8; c.stroke(); c.setLineDash([]);
      const p = points[2]; this.circle(p, 3 * this.camera.zoom, i === 0 ? '#a5ffdc' : '#ffac8a');
    }); c.restore();
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    if (document.hidden) return;
    // The landing globe covers this canvas. Drawing the isometric city under it is what made the scroll stutter.
    if (document.getElementById('globeStage')) return;
    if (this.lastFrame && now - this.lastFrame < (this.w < 650 ? 27 : 15)) return;
    const dt = this.lastFrame ? Math.min(.05, (now - this.lastFrame) / 1000) : .016;
    this.lastFrame = now;
    if (this.running && !this.reduced) this.time += dt;
    const easing = this.reduced ? 1 : clamp(dt * 2.2, .02, .12);
    this.camera.zoom = smooth(this.camera.zoom, this.target.zoom, easing);
    this.camera.panX = smooth(this.camera.panX, this.target.panX, easing);
    this.camera.panY = smooth(this.camera.panY, this.target.panY, easing);
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
    this.drawBase();
    for (const plot of this.plots) this.drawBuilding(plot);
    this.drawTransitNode();
    this.drawActors();
    this.drawTrails();
    const v = c.createLinearGradient(0, 0, 0, this.h); v.addColorStop(0, '#07131c18'); v.addColorStop(.6, '#07131c00'); v.addColorStop(1, '#07131c5d'); c.fillStyle = v; c.fillRect(0, 0, this.w, this.h);
  }
}
window.CityScene = CityScene;
})();
