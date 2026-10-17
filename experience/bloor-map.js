(function (root) {
  'use strict';

  // One observed street layer for both prepared policies. This draws mapped
  // context only: actor movement and policy outcomes must come from RunResult.
  const COLORS = {
    residential: '#456f78', mixed: '#77948e', commercial: '#ba8b72',
    institutional: '#7490a2', other: '#526e78',
  };
  const SECTION = { x0: -35, x1: 655, y0: -185, y1: 185 };

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

  class BloorMapView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.scenario = 'fare';
      this.mode = 'policy';
      this.world = null;
      this.observer = new ResizeObserver(() => this.draw());
      this.observer.observe(canvas.parentElement);
    }

    setWorld(world) {
      if (world?.id !== 'bloor-spadina-bathurst' || !Array.isArray(world?.buildings?.items)) return false;
      this.world = world;
      this.canvas.hidden = false;
      this.draw();
      return true;
    }

    setScenario(scenario) { this.scenario = scenario; this.draw(); }
    setMode(mode) { this.mode = mode; this.draw(); }

    draw() {
      if (!this.world || this.canvas.hidden) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0c2430'; ctx.fillRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * .5, height * .48, 20, width * .5, height * .48, width * .65);
      glow.addColorStop(0, '#285459'); glow.addColorStop(1, '#0c2430');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      const P = projection(width, height);
      const world = this.world;

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
      polygon(ctx, [P(0, -17), P(619, -17), P(619, 17), P(0, 17)], '#315151', '#8db4a549');
      polygon(ctx, [P(0, -10), P(619, -10), P(619, 10), P(0, 10)], '#19343d');
      segment(ctx, P(0, 0), P(619, 0), '#e5d7ae55', 1.5, [9, 9]);

      const protectedTrack = this.scenario !== 'bike' || this.mode === 'baseline';
      if (protectedTrack) {
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

      // Footprints/heights come from City 3D Massing. Use/color assignments are
      // OSM-derived or assumed in the world fixture; no shop outcome is drawn.
      const buildings = world.buildings.items.filter((b) =>
        b.centroid[0] >= SECTION.x0 && b.centroid[0] <= SECTION.x1 &&
        b.centroid[1] >= SECTION.y0 && b.centroid[1] <= SECTION.y1
      ).sort((a, b) => P(...a.centroid)[1] - P(...b.centroid)[1]);
      for (const building of buildings) {
        const footprint = building.footprint.slice(0, -1).map(([x, y]) => P(x, y));
        if (footprint.length < 3) continue;
        const z = Math.min(32, Math.max(4, building.height_m || 7));
        const roof = building.footprint.slice(0, -1).map(([x, y]) => P(x, y, z));
        const base = COLORS[building.use] || COLORS.other;
        for (let i = 0; i < footprint.length; i++) {
          const j = (i + 1) % footprint.length;
          polygon(ctx, [footprint[i], footprint[j], roof[j], roof[i]], i % 2 ? '#203e48' : '#294b54');
        }
        polygon(ctx, roof, base, '#c3e5d544');
      }

      for (const station of world.transit.stations) {
        const x = station.id === 'bathurst' ? 0 : world.frame.section_length_m;
        const [px, py] = P(x, 0, 8);
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#a9f4d6'; ctx.fill();
        ctx.fillStyle = '#082832'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('T', px - 3, py + 3);
        ctx.fillStyle = '#e3f6ee'; ctx.font = 'bold 10px sans-serif';
        ctx.fillText(station.name.toUpperCase(), px + (station.id === 'bathurst' ? 13 : -100), py - 12);
      }
    }
  }

  root.BloorMapView = BloorMapView;
  if (typeof module !== 'undefined' && module.exports) module.exports = { BloorMapView, projection };
})(typeof window !== 'undefined' ? window : globalThis);
