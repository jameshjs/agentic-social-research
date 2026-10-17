(function (root) {
  'use strict';

  // One observed street layer for both prepared policies. The static scene is
  // mapped context only. Every moving person, train, car, purchase cue and shop
  // badge drawn on top of it comes from a committed RunResult event; nothing is
  // animated that the run did not record.
  const COLORS = {
    residential: '#456f78', mixed: '#77948e', commercial: '#ba8b72',
    institutional: '#7490a2', other: '#526e78',
  };
  const SECTION = { x0: -35, x1: 655, y0: -185, y1: 185 };
  const PALETTE = Object.freeze({
    walk: '#e5d7ae', bike: '#a8f4d1', bike_shared: '#ff987e', car: '#cdcaff', transit: '#9cc7ff',
    shop: '#f3d9a4', home: '#f3f6ed', ink: '#07131c', cream: '#f3f6ed', mint: '#a8f4d1', coral: '#ff987e',
  });
  const FONT = "'DM Sans', ui-sans-serif, system-ui, sans-serif";
  const REPLAY_SECONDS = 68;          // a full four-period replay at the default speed
  const WINDOW_PAD_S = 15;            // padding around each travel window
  const WINDOW_MERGE_S = 60;          // windows closer than this become one stretch
  const MIN_CUE_S = 20;               // shortest visibility of a point cue, in simulated seconds
  const MAX_ACTORS = 25;
  const HIT_RADIUS_PX = 12;
  const POINT_ACTIONS = new Set(['enter_business', 'purchase', 'pay_fare', 'defer_trip', 'spend_elsewhere', 'choose_trip']);
  const VISUAL_KIND = { walk: 'walk', ride_bike: 'bike', drive: 'car', ride_subway: 'subway' };
  const MODE_KIND = { walk: 'walk', bike: 'bike', car: 'car', transit: 'subway' };
  const KIND_LABEL = { walk: 'WALKING', bike: 'CYCLING', car: 'DRIVING', subway: 'LINE 2' };
  const DRAW_ORDER = { subway: 0, car: 1, bike: 2, walk: 3 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  function projection(width, height) {
    const raw = (x, y) => [x - y * .52, x * .27 - y * .66];
    const corners = [
      raw(SECTION.x0, SECTION.y0), raw(SECTION.x0, SECTION.y1),
      raw(SECTION.x1, SECTION.y0), raw(SECTION.x1, SECTION.y1),
    ];
    const minX = Math.min(...corners.map((p) => p[0]));
    const maxX = Math.max(...corners.map((p) => p[0]));
    const minY = Math.min(...corners.map((p) => p[1]));
    const maxY = Math.max(...corners.map((p) => p[1]));
    const scale = Math.min((width - 38) / (maxX - minX), (height - 110) / (maxY - minY));
    const left = (width - (maxX - minX) * scale) / 2;
    // The lab viewport stretches to the story rail's height. Keep the mapped
    // section in its first screenful rather than leaving a large empty top.
    const top = Math.min((height - (maxY - minY) * scale) / 2 + 12, 92);
    return (x, y, z = 0) => {
      const [u, v] = raw(x, y);
      return [left + (u - minX) * scale, top + (v - minY) * scale - z * scale * 2.1];
    };
  }

  // The sandbox uses a schematic cross-section (car lanes ±3 m, cycle track
  // ±7 m, sidewalks ±12 m, side-street portals ±150 m). The drawn street is
  // wider (road ±10, track ±11.5, sidewalk to ±17), so actor y is remapped
  // piecewise: a cyclist at ±7 rides in the drawn track, at ±3 in a car lane.
  function mapY(y) {
    if (!finite(y)) return 0;
    const a = Math.abs(y), s = y < 0 ? -1 : 1;
    let m;
    if (a <= 3) m = a * 5 / 3;                          // car lanes  → ±5
    else if (a <= 7) m = 5 + (a - 3) * 6.5 / 4;         // track ±7   → ±11.5
    else if (a <= 12) m = 11.5 + (a - 7) * 4 / 5;       // sidewalk   → ±15.5
    else if (a < 20) m = 15.5 + (a - 12) * 4.5 / 8;     // blend into side streets
    else m = a;                                         // side streets keep their y
    return s * m;
  }

  function toSeconds(v) {
    if (finite(v)) return v;
    if (typeof v === 'string') {
      const m = /^(\d{1,2}):(\d{2})/.exec(v.trim());
      if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
    }
    return null;
  }

  function clockLabel(t) {
    if (!finite(t)) return '--:--';
    const s = Math.max(0, Math.floor(t));
    return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  }

  function money(v, cents = true) {
    if (!finite(v)) return '$—';
    return cents || Math.abs(v - Math.round(v)) > .004 ? `$${v.toFixed(2)}` : `$${Math.round(v)}`;
  }

  function pathTimes(ev) {
    const ts = [];
    for (const p of Array.isArray(ev?.path) ? ev.path : []) if (Array.isArray(p) && finite(p[2])) ts.push(p[2]);
    return ts;
  }

  /* Compressed replay domain. For each tick, the travel windows (and point
   * events) of BOTH arms are padded, merged when close, then concatenated in
   * tick order. Both arms share this domain so an arm toggle keeps the
   * playhead on the same (tick, time of day). */
  function buildTimeline(result, options = {}) {
    const pad = options.pad ?? WINDOW_PAD_S;
    const merge = options.merge ?? WINDOW_MERGE_S;
    const byTick = new Map();
    const add = (tick, a, b) => { if (!byTick.has(tick)) byTick.set(tick, []); byTick.get(tick).push([a, b]); };
    for (const arm of ['baseline', 'intervention']) {
      for (const ev of result?.runs?.[arm]?.events || []) {
        const tick = Number(ev?.tick);
        if (!Number.isFinite(tick)) continue;
        if (ev.action === 'travel') {
          const ts = pathTimes(ev);
          if (ts.length) add(tick, Math.min(...ts) - pad, Math.max(...ts) + pad);
        } else if (POINT_ACTIONS.has(ev.action) && finite(ev.t)) add(tick, ev.t - pad, ev.t + pad);
      }
    }
    const segments = [];
    let total = 0;
    for (const tick of [...byTick.keys()].sort((a, b) => a - b)) {
      const merged = [];
      let cur = null;
      for (const w of byTick.get(tick).sort((a, b) => a[0] - b[0])) {
        if (cur && w[0] - cur[1] < merge) cur[1] = Math.max(cur[1], w[1]);
        else { cur = [w[0], w[1]]; merged.push(cur); }
      }
      for (const [t0, t1] of merged) {
        segments.push({ tick, t0, t1, d0: total, d1: total + (t1 - t0) });
        total += t1 - t0;
      }
    }
    return { segments, total, ticks: [...new Set(segments.map((s) => s.tick))] };
  }

  function domainToTime(timeline, d) {
    const segs = timeline?.segments || [];
    if (!segs.length) return null;
    const x = clamp(d, 0, timeline.total);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (x < s.d1 || i === segs.length - 1) return { tick: s.tick, t: s.t0 + clamp(x - s.d0, 0, s.t1 - s.t0), segment: i };
    }
    return null;
  }

  function timeToDomain(timeline, tick, t) {
    const segs = (timeline?.segments || []).filter((s) => s.tick === tick);
    if (!segs.length) {
      const later = (timeline?.segments || []).find((s) => s.tick > tick);
      return later ? later.d0 : (timeline?.total || 0);
    }
    for (const s of segs) {
      if (t < s.t0) return s.d0;          // inside a compressed gap: snap forward
      if (t <= s.t1) return s.d0 + (t - s.t0);
    }
    return segs[segs.length - 1].d1;
  }

  // Path points are stored as [x, drawnY, t, worldY]; interpolation happens in
  // drawn space so a straight sandbox edge stays straight on screen.
  function samplePath(pts, t) {
    const n = pts.length;
    if (t <= pts[0][2]) return { x: pts[0][0], y: pts[0][1], wy: pts[0][3], i: 0 };
    if (t >= pts[n - 1][2]) return { x: pts[n - 1][0], y: pts[n - 1][1], wy: pts[n - 1][3], i: Math.max(0, n - 2) };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][2] <= t) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi], span = b[2] - a[2], f = span > 0 ? (t - a[2]) / span : 1;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, wy: a[3] + (b[3] - a[3]) * f, i: lo };
  }

  function groupByTick(list) {
    const map = new Map();
    for (const item of list) { if (!map.has(item.tick)) map.set(item.tick, []); map.get(item.tick).push(item); }
    for (const items of map.values()) items.sort((a, b) => (a.t0 ?? a.t) - (b.t0 ?? b.t));
    return map;
  }

  function compileArm(run) {
    const items = [], cues = [], byId = new Map(), hours = new Map();
    for (const ev of Array.isArray(run?.events) ? run.events : []) {
      if (!ev || typeof ev !== 'object') continue;
      if (ev.id != null) byId.set(String(ev.id), ev);
      const tick = Number(ev.tick);
      if (!Number.isFinite(tick)) continue;
      const actor = ev.actor == null ? null : String(ev.actor);
      switch (ev.action) {
        case 'travel': {
          const pts = (Array.isArray(ev.path) ? ev.path : [])
            .filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && finite(p[2]))
            .map((p) => [p[0], mapY(p[1]), p[2], p[1]])
            .sort((a, b) => a[2] - b[2]);
          if (!pts.length || !actor) break;
          if (pts.length === 1) pts.push(pts[0].slice());
          items.push({
            id: ev.id == null ? null : String(ev.id), actor, tick,
            kind: VISUAL_KIND[ev.visual_cue] || MODE_KIND[ev.mode] || 'walk',
            t0: pts[0][2], t1: pts[pts.length - 1][2], pts,
            shared: (Number(ev.shared_with_cars_m) || 0) > 0,
            usesBloor: !!ev.uses_bloor, exitsTo: ev.exits_to || null, tripId: ev.trip_id ?? null,
          });
          break;
        }
        case 'enter_business':
          if (finite(ev.t)) cues.push({ kind: 'enter', id: String(ev.id), tick, t: ev.t, actor, businessId: ev.business_id, x: ev.x, y: ev.y });
          break;
        case 'purchase':
          if (finite(ev.t)) cues.push({ kind: 'purchase', id: String(ev.id), tick, t: ev.t, actor, businessId: ev.recipient, amount: Number(ev.amount_cad) });
          break;
        case 'pay_fare':
          if (finite(ev.t)) cues.push({ kind: 'fare', id: String(ev.id), tick, t: ev.t, actor, amount: Number(ev.amount_cad), product: ev.fare_product || null });
          break;
        case 'defer_trip':
          if (finite(ev.t)) cues.push({ kind: 'defer', id: String(ev.id), tick, t: ev.t, actor, tripId: ev.trip_id ?? null });
          break;
        case 'spend_elsewhere':
          if (finite(ev.t)) cues.push({ kind: 'elsewhere', id: String(ev.id), tick, t: ev.t, actor, amount: Number(ev.amount_cad) });
          break;
        case 'set_shop_hours': {
          const closesAt = toSeconds(ev.closes_at);
          if (!ev.business_id) break;
          if (!hours.has(ev.business_id)) hours.set(ev.business_id, []);
          hours.get(ev.business_id).push({ tick, t: finite(ev.t) ? ev.t : 0, closesAt, reduced: !!ev.reduced });
          break;
        }
        default: break;
      }
    }
    for (const list of hours.values()) list.sort((a, b) => a.tick - b.tick || a.t - b.t);
    return { items, cues, byId, hours, itemsByTick: groupByTick(items), cuesByTick: groupByTick(cues) };
  }

  function actorPosition(arm, actor, tick, t) {
    const items = (arm.itemsByTick.get(tick) || []).filter((it) => it.actor === actor);
    if (!items.length) return null;
    let best = null, gap = Infinity;
    for (const it of items) {
      const g = t < it.t0 ? it.t0 - t : t > it.t1 ? t - it.t1 : 0;
      if (g < gap) { gap = g; best = it; }
    }
    const p = samplePath(best.pts, clamp(t, best.t0, best.t1));
    return { x: p.x, y: p.y };
  }

  // Point cues carry no coordinates for fares, deferrals or off-map spending.
  // Place them where the run puts that person: on their committed path, at a
  // mapped home, or at the start of the same trip in the other arm.
  function placeCues(arms, shops, homes) {
    const other = { baseline: 'intervention', intervention: 'baseline' };
    for (const armId of ['baseline', 'intervention']) {
      const arm = arms[armId];
      for (const cue of arm.cues) {
        let pos = null;
        if (cue.kind === 'enter' || cue.kind === 'purchase') {
          const shop = shops.get(cue.businessId);
          if (shop) pos = { x: shop.x, y: shop.y };
          else if (finite(cue.x) && finite(cue.y)) pos = { x: cue.x, y: mapY(cue.y) };
          else pos = actorPosition(arm, cue.actor, cue.tick, cue.t);
        } else if (cue.kind === 'fare') {
          pos = actorPosition(arm, cue.actor, cue.tick, cue.t);
        } else {
          const home = homes.get(cue.actor);
          if (home) pos = { x: home.x, y: home.y };
          else {
            const alt = arms[other[armId]];
            const trip = (alt.itemsByTick.get(cue.tick) || []).find((it) => it.actor === cue.actor && (cue.tripId == null || it.tripId === cue.tripId))
              || (alt.itemsByTick.get(cue.tick) || []).find((it) => it.actor === cue.actor);
            if (trip) pos = { x: trip.pts[0][0], y: trip.pts[0][1] };
          }
        }
        cue.pos = pos;
      }
    }
  }

  function polygon(ctx, points, fill, stroke) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .7; ctx.stroke(); }
  }

  function segment(ctx, a, b, color, width, dash = []) {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.stroke(); ctx.setLineDash([]);
  }

  function circle(ctx, x, y, r, fill, stroke, lineWidth = 1) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function haloText(ctx, text, x, y, color, font, align = 'left') {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#07131cd9'; ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function capsule(ctx, cx, cy, angle, len, th) {
    const r = th / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-len / 2 + r, -r); ctx.lineTo(len / 2 - r, -r);
    ctx.arc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-len / 2 + r, r);
    ctx.arc(-len / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.restore();
  }

  function stationX(world, station) {
    const entrances = Array.isArray(station?.entrances) ? station.entrances.filter((e) => finite(e.x)) : [];
    if (entrances.length) return entrances.reduce((s, e) => s + e.x, 0) / entrances.length;
    return station?.id === 'bathurst' ? 0 : world.frame.section_length_m;
  }

  function nowMs() { return root.performance?.now ? root.performance.now() : Date.now(); }

  class BloorMapView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scenario = 'fare';
      this.mode = 'policy';
      this.world = null;
      this.run = null;
      this.focusId = null;
      this.progress = 0;
      this.duration = REPLAY_SECONDS;
      this._running = false;
      this._raf = 0;
      this._lastTs = null;
      this._frameCallbacks = new Set();
      this._hits = [];
      this._homeHits = [];
      this._static = null;
      this._staticKey = '';
      this._size = null;
      this._buildingIndex = new Map();
      this.reducedMotion = !!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      this.observer = new ResizeObserver(() => { this._size = null; this.draw(); });
      this.observer.observe(canvas.parentElement);
      canvas.addEventListener('click', (event) => {
        if (!this.run) return;
        const personaId = this.actorAt(event.clientX, event.clientY);
        this.focusActor(personaId);
        canvas.dispatchEvent(new CustomEvent('bloormap:select', { detail: { personaId }, bubbles: true }));
      });
      canvas.addEventListener('pointermove', (event) => {
        if (!this.run) return;
        canvas.classList.toggle('bloor-map-canvas--hover', !!this.actorAt(event.clientX, event.clientY));
      });
      canvas.addEventListener('pointerleave', () => canvas.classList.remove('bloor-map-canvas--hover'));
    }

    /* ---------- inputs ---------- */

    setWorld(world) {
      if (world?.id !== 'bloor-spadina-bathurst' || !Array.isArray(world?.buildings?.items)) return false;
      this.world = world;
      this._buildingIndex = new Map(world.buildings.items.map((b) => [b.id, b]));
      this._homes = null;
      this._invalidate();
      this.canvas.hidden = false;
      this.draw();
      return true;
    }

    // Always schedules a draw: the app may have just un-hidden the canvas.
    setScenario(scenario) {
      if (scenario !== this.scenario) { this.scenario = scenario; this._invalidate(); }
      this.requestDraw();
    }

    // 'baseline' shows the baseline arm; 'policy' (or 'intervention') the intervention arm.
    setMode(mode) {
      const next = mode === 'baseline' ? 'baseline' : 'policy';
      if (next !== this.mode) { this.mode = next; this._invalidate(); }
      this.requestDraw();
    }

    get arm() { return this.mode === 'baseline' ? 'baseline' : 'intervention'; }

    /* Store a RunResult (experiment.v2) and precompute both arms. Returns true
     * when it has a replayable event log; setRun(null) returns to static context. */
    setRun(result, options = {}) {
      const previous = this.run;
      if (!result || !result.runs || !Array.isArray(result.runs.baseline?.events) || !Array.isArray(result.runs.intervention?.events)) {
        this.pause();
        this.run = null; this.focusId = null; this.progress = 0; this._homes = null; this._homeHits = [];
        this.canvas.classList.remove('bloor-map-canvas--interactive', 'bloor-map-canvas--hover');
        this._invalidate(); this.requestDraw();
        return false;
      }
      const personas = new Map();
      for (const p of Array.isArray(result.personas) ? result.personas : []) if (p?.id != null) personas.set(String(p.id), p);
      const shops = new Map();
      for (const s of result.places?.shops || []) {
        if (!s?.business_id || !finite(s.x) || !finite(s.y)) continue;
        shops.set(s.business_id, {
          id: s.business_id, name: s.name || s.label || s.business_id, x: s.x, y: mapY(s.y),
          side: s.side || (s.y >= 0 ? 'north' : 'south'), closesAt: toSeconds(s.closes_at),
        });
      }
      const homes = new Map();
      for (const [id, p] of personas) {
        const h = p.home;
        if (h?.kind === 'mapped' && finite(h.x) && finite(h.y)) homes.set(id, { x: h.x, y: mapY(h.y), wy: h.y, home: h });
      }
      const arms = { baseline: compileArm(result.runs.baseline), intervention: compileArm(result.runs.intervention) };
      placeCues(arms, shops, homes);
      const timeline = buildTimeline(result);
      const scenarioId = result.scenario_id === 'fare' || result.scenario_id === 'bike' ? result.scenario_id : null;
      this.run = { result, personas, shops, homes, arms, timeline, scenarioId, rate: timeline.total / this.duration };
      if (scenarioId) this.scenario = scenarioId;
      const sameScenario = previous && previous.scenarioId === scenarioId;
      this.progress = sameScenario && options.keepProgress !== false ? clamp(this.progress, 0, 1) : 0;
      if (this.focusId && !personas.has(this.focusId)) this.focusId = null;
      this._homes = null;
      this.canvas.classList.add('bloor-map-canvas--interactive');
      this._invalidate();
      this.requestDraw();
      if (options.autoplay && !this.reducedMotion) this.play();
      return timeline.total > 0;
    }

    /* ---------- replay clock ---------- */

    get running() { return this._running; }

    // Simulated seconds advanced per real second at the current duration.
    get rate() { return this.run ? this.run.timeline.total / this.duration : 0; }

    setDuration(seconds) {
      if (!finite(seconds) || seconds <= 0) return;
      this.duration = seconds;
      if (this.run) this.run.rate = this.run.timeline.total / seconds;
    }

    getProgress() { return this.progress; }

    setProgress(p) {
      if (!finite(p)) return;
      this.progress = clamp(p, 0, 1);
      this.requestDraw();
    }

    // Seek to a (tick, seconds-of-day) on the shared compressed domain.
    seekTo(tick, t) {
      if (!this.run?.timeline.total) return false;
      this.setProgress(timeToDomain(this.run.timeline, Number(tick), Number(t)) / this.run.timeline.total);
      return true;
    }

    play() {
      if (!this.run?.timeline.total || !this._visible()) return false;
      if (this.progress >= 1) this.progress = 0;
      this._running = true;
      this._lastTs = null;
      this.requestDraw();
      return true;
    }

    pause() {
      if (!this._running) return;
      this._running = false;
      this._lastTs = null;
      this.requestDraw();
    }

    toggle() {
      if (this._running) this.pause(); else this.play();
      return this._running;
    }

    // cb({ tick, t, clock, progress, arm, running }) after every drawn frame. Returns an unsubscribe.
    onFrame(callback) {
      if (typeof callback !== 'function') return () => {};
      this._frameCallbacks.add(callback);
      return () => this._frameCallbacks.delete(callback);
    }

    getState() {
      const at = this.run ? domainToTime(this.run.timeline, this.progress * this.run.timeline.total) : null;
      return {
        tick: at?.tick ?? null, t: at?.t ?? null, clock: at ? clockLabel(at.t) : '--:--',
        progress: this.progress, arm: this.arm, running: this._running,
      };
    }

    /* ---------- focus and hit testing ---------- */

    focusActor(personaId) {
      const id = personaId == null ? null : String(personaId);
      this.focusId = id && this.run?.personas.has(id) ? id : null;
      this.requestDraw();
      return this.focusId;
    }

    // Move the shared playhead to an event's (tick, t) and focus its actor.
    // The arm is not switched; call setMode() if the event belongs to the other arm.
    seekToEvent(arm, eventId) {
      if (!this.run) return null;
      const armId = arm === 'baseline' ? 'baseline' : 'intervention';
      const ev = this.run.arms[armId].byId.get(String(eventId));
      if (!ev || !finite(Number(ev.tick))) return null;
      const ts = pathTimes(ev);
      const t = ev.action === 'travel'
        ? (ts.length ? Math.min(...ts) + Math.min(2, (Math.max(...ts) - Math.min(...ts)) / 2) : ev.depart_t)
        : ev.t;
      if (!finite(t)) return null;
      this.seekTo(Number(ev.tick), t);
      if (ev.actor != null) this.focusActor(ev.actor);
      return { arm: armId, tick: Number(ev.tick), t, clock: clockLabel(t), armMatches: armId === this.arm };
    }

    // Persona id under a client point (actors first, then mapped homes), or null.
    actorAt(clientX, clientY) {
      if (!this.run) return null;
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left, y = clientY - rect.top;
      let best = null, bestD = HIT_RADIUS_PX;
      for (const h of this._hits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= bestD) { bestD = d; best = h.id; } }
      if (best) return best;
      bestD = HIT_RADIUS_PX * .85;
      for (const h of this._homeHits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= bestD) { bestD = d; best = h.id; } }
      return best;
    }

    destroy() {
      this.pause();
      if (this._raf) (root.cancelAnimationFrame || clearTimeout)(this._raf);
      this._raf = 0;
      this.observer.disconnect();
      this._frameCallbacks.clear();
    }

    /* ---------- frame scheduling ---------- */

    requestDraw() {
      if (this._raf) return;
      const raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : (cb) => setTimeout(() => cb(nowMs()), 16);
      this._raf = raf((ts) => this._step(ts));
    }

    _step(ts) {
      this._raf = 0;
      if (this._running) {
        if (!this._visible()) { this._running = false; this._lastTs = null; }
        else {
          const dt = this._lastTs == null ? 0 : clamp((ts - this._lastTs) / 1000, 0, .1);
          this._lastTs = ts;
          this.progress = clamp(this.progress + dt / this.duration, 0, 1);
          if (this.progress >= 1) { this._running = false; this._lastTs = null; }
        }
      }
      this.draw();
      if (this._running) this.requestDraw();
    }

    _visible() {
      if (!this.world || this.canvas.hidden || this.canvas.isConnected === false) return false;
      const rect = this.canvas.parentElement?.getBoundingClientRect();
      return !!rect && rect.width >= 2 && rect.height >= 2;
    }

    _invalidate() { this._staticKey = ''; }

    _ensureSize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return null;
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
      if (this.canvas.width !== pw) this.canvas.width = pw;
      if (this.canvas.height !== ph) this.canvas.height = ph;
      if (!this._size || this._size.width !== width || this._size.height !== height || this._size.dpr !== dpr) {
        this._size = { width, height, dpr };
        this._P = projection(width, height);
        this._invalidate();
      }
      return this._size;
    }

    get protectedTrack() { return this.scenario !== 'bike' || this.mode === 'baseline'; }

    /* ---------- drawing ---------- */

    draw() {
      if (!this.world || this.canvas.hidden) return;
      const size = this._ensureSize();
      if (!size) return;
      const { width, height, dpr } = size;
      const key = [width, height, dpr, this.scenario, this.protectedTrack, this.run ? 'run' : 'static', this.run?.timeline.total ?? 0].join('|');
      if (key !== this._staticKey || !this._static) { this._renderStatic(width, height, dpr); this._staticKey = key; }
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this._static, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._hits = [];
      const state = this.getState();
      if (this.run && state.tick != null) this._drawDynamic(ctx, width, height, state);
      for (const cb of this._frameCallbacks) {
        try { cb(state); } catch (error) { root.console?.error?.(error); }
      }
    }

    _renderStatic(width, height, dpr) {
      const doc = this.canvas.ownerDocument || root.document;
      if (!this._static) this._static = doc.createElement('canvas');
      this._static.width = Math.round(width * dpr);
      this._static.height = Math.round(height * dpr);
      const ctx = this._static.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = this._P;
      const world = this.world;
      ctx.fillStyle = '#0c2430'; ctx.fillRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * .5, height * .48, 20, width * .5, height * .48, width * .65);
      glow.addColorStop(0, '#285459'); glow.addColorStop(1, '#0c2430');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);

      // Side streets are limited to the mapped intersecting legs.
      for (const crossing of world.bloor.intersections) {
        const x = crossing.x;
        for (const side of ['north', 'south']) {
          if (!crossing.legs.some((leg) => leg.endsWith(`|${side}`))) continue;
          const end = side === 'north' ? SECTION.y1 : SECTION.y0;
          polygon(ctx, [P(x - 7, 0), P(x + 7, 0), P(x + 7, end), P(x - 7, end)], '#1c3942', '#64938932');
          segment(ctx, P(x, side === 'north' ? 19 : -19), P(x, end), '#b2c8aa35', 1, [4, 8]);
        }
      }
      polygon(ctx, [P(0, -17), P(619, -17), P(619, 17), P(0, 17)], '#3a605d', '#a9d2c25c');
      polygon(ctx, [P(0, -10), P(619, -10), P(619, 10), P(0, 10)], '#17343e');
      segment(ctx, P(0, 0), P(619, 0), '#e5d7ae66', 1.5, [9, 9]);

      if (this.protectedTrack) {
        for (const y of [-11.5, 11.5]) {
          segment(ctx, P(0, y), P(619, y), '#78ddbb', 5);
          segment(ctx, P(0, y), P(619, y), '#d8fff0', 1, [6, 12]);
        }
      } else {
        for (const y of [-11.5, 11.5]) segment(ctx, P(0, y), P(619, y), '#eaa18a88', 2, [4, 7]);
      }

      for (const crossing of world.crosswalks.items.filter((item) => item.crosses_bloor)) {
        const x = (crossing.a[0] + crossing.b[0]) / 2;
        for (let i = -2; i <= 2; i++) segment(ctx, P(x + i * 2, -14), P(x + i * 2, 14), '#d4e8ddaf', 1.5);
      }

      // Line 2 runs beneath Bloor between the two mapped stations (GTFS).
      const stations = (world.transit?.stations || []).map((s) => ({ ...s, x: stationX(world, s) }));
      if (stations.length >= 2) {
        const xs = stations.map((s) => s.x);
        const a = P(Math.min(...xs), 0, -1.4), b = P(Math.max(...xs), 0, -1.4);
        segment(ctx, a, b, '#9cc7ff2e', 5);
        segment(ctx, a, b, '#9cc7ff8c', 1.2, [5, 6]);
      }

      // Footprints/heights come from City 3D Massing. Use/color assignments are
      // OSM-derived or assumed in the world fixture; no shop outcome is drawn here.
      const buildings = world.buildings.items.filter((b) =>
        b.centroid[0] >= SECTION.x0 && b.centroid[0] <= SECTION.x1 &&
        b.centroid[1] >= SECTION.y0 && b.centroid[1] <= SECTION.y1
      ).sort((a, b) => P(...a.centroid)[1] - P(...b.centroid)[1]);
      const drawBuilding = (c, building) => {
        const footprint = building.footprint.slice(0, -1).map(([x, y]) => P(x, y));
        if (footprint.length < 3) return;
        const z = Math.min(32, Math.max(4, building.height_m || 7));
        const roof = building.footprint.slice(0, -1).map(([x, y]) => P(x, y, z));
        const base = COLORS[building.use] || COLORS.other;
        for (let i = 0; i < footprint.length; i++) {
          const j = (i + 1) % footprint.length;
          polygon(c, [footprint[i], footprint[j], roof[j], roof[i]], i % 2 ? '#203e48' : '#294b54');
        }
        polygon(c, roof, base, '#c3e5d544');
      };
      // South-side frontage stands between the camera and Bloor. Composite it
      // once at uniform translucency so the street, track and actors stay readable.
      const frontage = (b) => b.centroid[1] < 0 && b.centroid[1] > -80;
      for (const building of buildings) if (!frontage(building)) drawBuilding(ctx, building);
      if (!this._ghost) this._ghost = doc.createElement('canvas');
      this._ghost.width = this._static.width;
      this._ghost.height = this._static.height;
      const gctx = this._ghost.getContext('2d');
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, this._ghost.width, this._ghost.height);
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const building of buildings) if (frontage(building)) drawBuilding(gctx, building);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = .36;
      ctx.drawImage(this._ghost, 0, 0);
      ctx.restore();

      for (const station of stations) {
        const [px, py] = P(station.x, 0, 8);
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#a9f4d6'; ctx.fill();
        ctx.fillStyle = '#082832'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('T', px - 3, py + 3);
        ctx.fillStyle = '#e3f6ee'; ctx.font = 'bold 10px sans-serif';
        ctx.fillText(station.name.toUpperCase(), px + (station.id === 'bathurst' ? 13 : -100), py - 12);
      }

      if (this.run) {
        this._drawHomes(ctx, P);
        this._drawShopBases(ctx, P);
      }
    }

    // Display-only home assignments: a glyph on the persona's building roof,
    // linked to the side street their trips use. No address is shown.
    _homeLayout() {
      if (this._homes) return this._homes;
      const out = [];
      const crossings = this.world?.bloor?.intersections || [];
      for (const [id, home] of this.run?.homes || []) {
        const building = this._buildingIndex.get(home.home.building_id);
        const z = building ? Math.min(32, Math.max(4, building.height_m || 7)) : 6;
        const side = home.wy >= 0 ? 'north' : 'south';
        const m = /portal_(north|south)_(\d+)/.exec(home.home.node || '');
        let streetX = m && crossings[Number(m[2])] ? crossings[Number(m[2])].x : null;
        if (streetX == null) {
          const legs = crossings.filter((c) => c.legs.some((leg) => leg.endsWith(`|${side}`)));
          streetX = legs.reduce((best, c) => (best == null || Math.abs(c.x - home.x) < Math.abs(best - home.x) ? c.x : best), null) ?? home.x;
        }
        out.push({ id, x: home.x, y: home.y, z, streetX });
      }
      this._homes = out;
      return out;
    }

    _drawHomes(ctx, P) {
      this._homeHits = [];
      for (const h of this._homeLayout()) {
        const roof = P(h.x, h.y, h.z);
        segment(ctx, P(h.x, h.y, h.z * .15), P(h.streetX, h.y), '#a8f4d170', 1, [1.5, 3]);
        // Small house glyph: a square with a pitched roof.
        ctx.beginPath();
        ctx.moveTo(roof[0] - 4, roof[1] - 1); ctx.lineTo(roof[0], roof[1] - 5.5); ctx.lineTo(roof[0] + 4, roof[1] - 1);
        ctx.lineTo(roof[0] + 4, roof[1] + 3.5); ctx.lineTo(roof[0] - 4, roof[1] + 3.5); ctx.closePath();
        ctx.fillStyle = '#f3f6edd9'; ctx.fill();
        ctx.strokeStyle = '#07131c'; ctx.lineWidth = .8; ctx.stroke();
        this._homeHits.push({ id: h.id, x: roof[0], y: roof[1] });
      }
    }

    _drawShopBases(ctx, P) {
      for (const shop of this.run.shops.values()) {
        const [x, y] = P(shop.x, shop.y);
        const [lx, ly] = P(shop.x, shop.y, 7);
        segment(ctx, [x, y], [lx, ly + 2], '#f3d9a4aa', 1);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = PALETTE.shop; ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
        ctx.strokeStyle = '#07131c'; ctx.lineWidth = .8; ctx.strokeRect(-2.6, -2.6, 5.2, 5.2);
        ctx.restore();
        const name = shop.name.length > 15 ? `${shop.name.slice(0, 14)}…` : shop.name;
        haloText(ctx, name, lx, ly, '#f6ead0', `700 8.5px ${FONT}`, 'center');
      }
    }

    _drawDynamic(ctx, width, height, state) {
      const P = this._P;
      const run = this.run;
      const arm = run.arms[this.arm];
      const { tick, t } = state;
      const rate = Math.max(1, run.timeline.total / this.duration);
      const cueSpan = Math.max(MIN_CUE_S, rate * 1.2);
      const trailSpan = clamp(rate * .25, 6, 60);
      const fadeSpan = clamp(rate * .12, 2, 30);
      const focus = this.focusId;
      const dim = (id) => (focus && id !== focus ? .38 : 1);

      // Shops: hours set by the run, then entry/purchase flashes near the playhead.
      const flashes = new Map();
      for (const cue of arm.cuesByTick.get(tick) || []) {
        if ((cue.kind !== 'enter' && cue.kind !== 'purchase') || !cue.businessId) continue;
        const k = (t - cue.t) / cueSpan;
        if (k < -.1 || k > 1) continue;
        flashes.set(cue.businessId, Math.max(flashes.get(cue.businessId) || 0, 1 - Math.abs(k)));
      }
      for (const shop of run.shops.values()) {
        const hours = this._hoursAt(arm, shop.id, tick, t);
        const [x, y] = P(shop.x, shop.y);
        const [lx, ly] = P(shop.x, shop.y, 7);
        if (hours?.reduced) {
          const closed = finite(hours.closesAt) && t >= hours.closesAt;
          if (closed) circle(ctx, x, y, 4.5, '#07131cb3', PALETTE.coral, 1);
          const label = closed ? 'closed' : `closes ${clockLabel(hours.closesAt)}`;
          ctx.font = `700 7.5px ${FONT}`;
          const w = ctx.measureText(label).width + 8;
          roundedRect(ctx, lx - w / 2, ly + 3, w, 11, 3);
          ctx.fillStyle = '#2b1712e6'; ctx.fill();
          ctx.strokeStyle = '#ff987eb3'; ctx.lineWidth = .8; ctx.stroke();
          ctx.fillStyle = PALETTE.coral; ctx.textAlign = 'center'; ctx.fillText(label, lx, ly + 11.2); ctx.textAlign = 'left';
        }
        const flash = flashes.get(shop.id);
        if (flash) {
          ctx.globalAlpha = clamp(flash, 0, 1);
          circle(ctx, x, y, 5 + (1 - flash) * 11, null, PALETTE.mint, 1.6);
          circle(ctx, x, y, 3, PALETTE.mint);
          ctx.globalAlpha = 1;
        }
      }

      // Actors on committed travel legs at this (tick, t); one leg per person.
      const active = new Map();
      for (const item of arm.itemsByTick.get(tick) || []) {
        if (item.t0 > t) break;
        if (t <= item.t1) active.set(item.actor, item);
      }
      let actors = [...active.values()];
      if (actors.length > MAX_ACTORS) {
        const keep = actors.filter((a) => a.actor === focus);
        actors = keep.concat(actors.filter((a) => a.actor !== focus).slice(0, MAX_ACTORS - keep.length));
      }
      actors.sort((a, b) => DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind]);
      const placed = [];
      for (const item of actors) {
        const p = samplePath(item.pts, t);
        const s = P(p.x, p.y, item.kind === 'subway' ? -1.4 : 0);
        const edge = Math.min(t - item.t0, item.t1 - t);
        const alpha = (.35 + .65 * clamp(edge / fadeSpan, 0, 1)) * this._stairFade(item, p, t);
        placed.push({ item, p, s, alpha });
      }

      // Trails first, so markers stay crisp.
      for (const { item, p, alpha } of placed) {
        if (item.kind === 'subway') continue;
        const color = this._actorColor(item, p);
        const steps = 6;
        let prev = null;
        for (let k = steps; k >= 0; k--) {
          const tt = Math.max(item.t0, t - (trailSpan * k) / steps);
          const q = samplePath(item.pts, tt);
          const sp = P(q.x, q.y);
          if (prev && k < steps) {
            ctx.globalAlpha = alpha * dim(item.actor) * (1 - k / steps) * .55;
            segment(ctx, prev, sp, color, item.kind === 'car' ? 2.4 : 1.6);
          }
          prev = sp;
        }
      }
      ctx.globalAlpha = 1;

      // Line 2: riders on the same train at the same spot share one capsule.
      const trains = [];
      for (const a of placed) {
        if (a.item.kind !== 'subway') continue;
        const hit = trains.find((tr) => Math.hypot(tr.s[0] - a.s[0], tr.s[1] - a.s[1]) < 6);
        if (hit) hit.riders.push(a); else trains.push({ s: a.s, riders: [a] });
      }
      const lineAngle = Math.atan2(P(1, 0)[1] - P(0, 0)[1], P(1, 0)[0] - P(0, 0)[0]);
      for (const tr of trains) {
        const alpha = Math.max(...tr.riders.map((r) => r.alpha)) * Math.max(...tr.riders.map((r) => dim(r.item.actor)));
        ctx.globalAlpha = alpha;
        capsule(ctx, tr.s[0], tr.s[1], lineAngle, 40, 15);
        ctx.fillStyle = '#9cc7ff24'; ctx.fill();
        capsule(ctx, tr.s[0], tr.s[1], lineAngle, 32, 9);
        ctx.fillStyle = '#9cc7ffe0'; ctx.fill();
        ctx.setLineDash([2, 2]); ctx.strokeStyle = '#e6f1ff'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(tr.s[0], tr.s[1]); ctx.rotate(lineAngle);
        ctx.fillStyle = '#0b2a3fcc';
        for (let w = -10.5; w <= 10.5; w += 5.25) ctx.fillRect(w - 1.6, -2, 3.2, 3);
        ctx.restore();
        if (tr.riders.length > 1) {
          circle(ctx, tr.s[0] + 16, tr.s[1] - 8, 5.6, '#07131c', '#9cc7ff', 1);
          ctx.fillStyle = '#e6f1ff'; ctx.font = `700 7.5px ${FONT}`; ctx.textAlign = 'center';
          ctx.fillText(String(tr.riders.length), tr.s[0] + 16, tr.s[1] - 5.4); ctx.textAlign = 'left';
        }
        ctx.globalAlpha = 1;
        for (const r of tr.riders) this._hits.push({ id: r.item.actor, x: tr.s[0], y: tr.s[1] });
      }

      for (const { item, p, s, alpha } of placed) {
        if (item.kind === 'subway') continue;
        ctx.globalAlpha = alpha * dim(item.actor);
        const color = this._actorColor(item, p);
        if (item.kind === 'car') {
          const angle = this._heading(item, p.i, P);
          ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(angle);
          roundedRect(ctx, -6.5, -3.2, 13, 6.4, 2);
          ctx.fillStyle = color; ctx.fill();
          ctx.strokeStyle = '#07131c'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#07131cb3'; ctx.fillRect(1.8, -2.3, 2.6, 4.6);
          ctx.restore();
        } else if (item.kind === 'bike') {
          circle(ctx, s[0], s[1], 9, `${color}2e`);
          circle(ctx, s[0], s[1], 5.8, '#07131c99', color, 1.7);
          circle(ctx, s[0], s[1], 2.7, color);
        } else {
          ctx.beginPath(); ctx.ellipse(s[0], s[1] + .6, 3.2, 1.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#07131c8c'; ctx.fill();
          circle(ctx, s[0], s[1] - 3, 3.2, color, '#07131c', 1);
        }
        ctx.globalAlpha = 1;
        this._hits.push({ id: item.actor, x: s[0], y: item.kind === 'walk' ? s[1] - 3 : s[1] });
      }

      // Point cues: receipts, deferrals and off-map spending near the playhead.
      for (const cue of arm.cuesByTick.get(tick) || []) {
        if (!cue.pos || cue.kind === 'enter') continue;
        const k = (t - cue.t) / cueSpan;
        if (k < -.1 || k > 1) continue;
        const fade = k < 0 ? 1 + k * 10 : 1 - k * k;
        const [x, y] = P(cue.pos.x, cue.pos.y, 6);
        const rise = Math.max(0, k) * 16;
        ctx.globalAlpha = clamp(fade, 0, 1) * dim(cue.actor);
        if (cue.kind === 'fare') haloText(ctx, `+${money(cue.amount)} TTC`, x + 6, y - rise, PALETTE.transit, `700 9px ${FONT}`);
        else if (cue.kind === 'purchase') haloText(ctx, `+${money(cue.amount, false)}`, x + 7, y - 6 - rise, PALETTE.mint, `700 9.5px ${FONT}`);
        else if (cue.kind === 'elsewhere') haloText(ctx, finite(cue.amount) ? `→ ${money(cue.amount, false)} elsewhere` : '→ elsewhere', x + 6, y - rise, PALETTE.walk, `700 8.5px ${FONT}`);
        else if (cue.kind === 'defer') {
          const [hx, hy] = P(cue.pos.x, cue.pos.y, 2);
          haloText(ctx, '×', hx, hy - 5 - rise * .4, PALETTE.coral, `700 15px ${FONT}`, 'center');
          haloText(ctx, 'trip deferred', hx + 8, hy - 8 - rise * .4, '#ffc2b2', `600 8px ${FONT}`);
        }
        ctx.globalAlpha = 1;
      }

      this._drawFocus(ctx, P, placed, trains, state);
      this._drawHud(ctx, width, state);
    }

    _hoursAt(arm, businessId, tick, t) {
      const list = arm.hours.get(businessId);
      if (!list) return null;
      let latest = null;
      for (const h of list) {
        if (h.tick < tick || (h.tick === tick && h.t <= t)) latest = h; else break;
      }
      return latest;
    }

    // Riders fade as they take station stairs (a walk leg ending at Line 2's y=0).
    _stairFade(item, p, t) {
      if (item.kind !== 'walk') return 1;
      const a = item.pts[p.i], b = item.pts[Math.min(item.pts.length - 1, p.i + 1)];
      if (!a || !b || (Math.abs(a[3]) >= 1 && Math.abs(b[3]) >= 1)) return 1;
      return clamp(Math.abs(p.wy) / 12, .2, 1);
    }

    _actorColor(item, p) {
      if (item.kind === 'walk') return PALETTE.walk;
      if (item.kind === 'car') return PALETTE.car;
      if (item.kind === 'subway') return PALETTE.transit;
      // Coral when this ride shares the Bloor lane with cars (sandbox shared_with_cars_m > 0).
      if (item.shared && (!p || Math.abs(p.wy) <= 4.5)) return PALETTE.bike_shared;
      return PALETTE.bike;
    }

    _heading(item, i, P) {
      const n = item.pts.length;
      for (const j of [i, ...Array.from({ length: n - 1 }, (_, k) => k)]) {
        const a = item.pts[j], b = item.pts[j + 1];
        if (!a || !b) continue;
        const sa = P(a[0], a[1]), sb = P(b[0], b[1]);
        if (Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) > .5) return Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
      }
      return Math.atan2(P(1, 0)[1] - P(0, 0)[1], P(1, 0)[0] - P(0, 0)[0]);
    }

    _drawFocus(ctx, P, placed, trains, state) {
      const id = this.focusId;
      if (!id) return;
      const persona = this.run.personas.get(id);
      const name = persona?.name || id;
      const mine = placed.find((a) => a.item.actor === id);
      let at = null, tag = '';
      if (mine) {
        const train = mine.item.kind === 'subway' ? trains.find((tr) => tr.riders.includes(mine)) : null;
        at = train ? train.s : [mine.s[0], mine.item.kind === 'walk' ? mine.s[1] - 3 : mine.s[1]];
        tag = mine.item.kind === 'bike' && this._actorColor(mine.item, mine.p) === PALETTE.bike_shared ? 'CYCLING · SHARED LANE' : KIND_LABEL[mine.item.kind];
        if (mine.item.exitsTo && state.t > mine.item.t1 - (mine.item.t1 - mine.item.t0) * .3) tag = `→ ${String(mine.item.exitsTo).toUpperCase()}`;
      } else {
        const home = this._homeLayout().find((h) => h.id === id);
        if (home) { at = P(home.x, home.y, home.z); tag = 'AT HOME'; }
      }
      if (!at) return;
      circle(ctx, at[0], at[1], 10.5, null, '#ffffffe0', 1.5);
      circle(ctx, at[0], at[1], 15, null, '#a8f4d166', 1);
      const label = `${String(name).toUpperCase()}${tag ? ` · ${tag}` : ''}`;
      ctx.font = `700 8.5px ${FONT}`;
      const w = Math.min(220, ctx.measureText(label).width + 14);
      const bx = clamp(at[0] + 14, 6, this._size.width - w - 6), by = at[1] - 25;
      roundedRect(ctx, bx, by, w, 15, 4);
      ctx.fillStyle = '#0f2a33ee'; ctx.fill();
      ctx.strokeStyle = '#a8f4d1aa'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = PALETTE.mint; ctx.fillText(label, bx + 7, by + 10.5, w - 12);
    }

    _drawHud(ctx, width, state) {
      const text = `P${state.tick} · ${state.clock} · ${state.arm === 'baseline' ? 'BASELINE' : 'WITH POLICY'}`;
      ctx.globalAlpha = .82;
      haloText(ctx, text, width - 28, 54, '#dcefe8', `700 9.5px ${FONT}`, 'right');
      const items = [['walk', PALETTE.walk], ['bike', PALETTE.bike], ['shared lane', PALETTE.bike_shared], ['car', PALETTE.car], ['Line 2', PALETTE.transit]];
      ctx.font = `600 8px ${FONT}`;
      let x = width - 28;
      for (let i = items.length - 1; i >= 0; i--) {
        const [label, color] = items[i];
        const w = ctx.measureText(label).width;
        haloText(ctx, label, x, 68, '#b9d0cc', `600 8px ${FONT}`, 'right');
        circle(ctx, x - w - 6, 65.2, 2.4, color);
        x -= w + 16;
      }
      ctx.globalAlpha = 1;
    }
  }

  BloorMapView.PALETTE = PALETTE;
  BloorMapView.mapY = mapY;
  root.BloorMapView = BloorMapView;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BloorMapView, projection, mapY, buildTimeline, domainToTime, timeToDomain, samplePath, clockLabel, PALETTE };
  }
})(typeof window !== 'undefined' ? window : globalThis);
