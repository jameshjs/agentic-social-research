// Landing globe: scrolling the intro flies from the whole Earth down to Bloor St W, Bathurst to Spadina.
// It reads the same scroll progress as app.js updateReveal() (0 = top, ~.32 = the composer slide) and never
// touches run state. Without WebGL, with reduced motion, with ?globe=off, or if the tiles do not load,
// it removes itself and the drawn landing stays as it was.
(function () {
  'use strict';
  const MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js';
  const STYLE = 'https://tiles.openfreemap.org/styles/dark';
  // Same nodes as world/build/section.py.
  const BATHURST = [-79.411206, 43.665134];
  const SPADINA = [-79.403816, 43.666669];
  const CENTER = [(BATHURST[0] + SPADINA[0]) / 2, (BATHURST[1] + SPADINA[1]) / 2];
  const BLOOR_BEARING = -16;      // Bloor runs at azimuth ~74°, so this lays it level on screen
  const SECTION_M = 619;
  const ARRIVE = 0.62;            // progress at which the camera lands: the composer is fully shown by ~.68

  const stage = document.getElementById('globeStage');
  const params = new URLSearchParams(window.location.search);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stage || params.get('globe') === 'off' || reduced || !webgl()) { if (stage) stage.remove(); return; }
  document.body.classList.add('globe-pending');

  let map = null, target = 0, frame = 0, ready = false, live = null, lastStamp = 0;
  const caption = stage.querySelector('.globe-caption');

  function webgl() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (error) { return false; }
  }

  function giveUp(reason) {
    console.warn('[globe] drawn landing kept:', reason || 'unavailable');
    if (map) { try { map.remove(); } catch (error) { /* already gone */ } }
    stage.remove();
    document.body.classList.remove('globe-on', 'globe-pending');
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  }

  // Mirrors app.js updateReveal().
  function scrollProgress() {
    const section = document.getElementById('intro');
    if (!section) return 1;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    return Math.max(0, Math.min(1, window.scrollY / travel));
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  function zoomRange() {
    const w = window.innerWidth, h = window.innerHeight;
    // Globe diameter ≈ 512·2^z / π px; start at ~78% of the shorter side.
    const start = Math.log2(Math.min(w, h) * 0.78 * Math.PI / 512);
    // End with the 619 m section across ~50% of the width (metres per px at this latitude = 113 250 / 2^z).
    const end = Math.log2(113250 * (0.5 * w) / SECTION_M);
    return [start, clamp(end - 0.7, 14, 16.8)];   // −0.7: the tilt makes the near street look larger
  }

  function camera(p) {
    const t = clamp(p / ARRIVE, 0, 1);
    const [z0, z1] = zoomRange();
    const travel = smooth(span(t, 0, 0.4));        // spin the globe round to Toronto before zooming past z≈7
    const tilt = smooth(span(t, 0.6, 1));          // then tilt and level Bloor
    const wide = window.innerWidth > 760;
    return {
      center: [lerp(-52, CENTER[0], travel), lerp(28, CENTER[1], travel)],
      zoom: lerp(z0, z1, smooth(t)),
      pitch: lerp(0, wide ? 58 : 50, tilt),
      bearing: lerp(0, BLOOR_BEARING, tilt),
    };
  }

  // Scroll sets a target. The camera eases toward it in zoom-space and never jumps more than
  // a few zoom levels per second, so the globe keeps flying instead of stepping between tiles.
  function render(now) {
    frame = 0;
    if (!map || !ready) return;
    const dt = lastStamp ? Math.min(0.032, (now - lastStamp) / 1000) : 0.016;
    lastStamp = now;
    const goal = camera(target);
    if (!live) live = { center: [goal.center[0], goal.center[1]], zoom: goal.zoom, pitch: goal.pitch, bearing: goal.bearing };
    const k = 1 - Math.exp(-dt / 0.45);
    const maxZoom = 2.6 * dt;
    live.zoom += clamp((goal.zoom - live.zoom) * k, -maxZoom, maxZoom);
    live.center[0] += (goal.center[0] - live.center[0]) * k;
    live.center[1] += (goal.center[1] - live.center[1]) * k;
    live.pitch += (goal.pitch - live.pitch) * k;
    live.bearing += (goal.bearing - live.bearing) * k;
    map.jumpTo({ center: live.center, zoom: live.zoom, pitch: live.pitch, bearing: live.bearing });
    const [z0, z1] = zoomRange();
    const u = clamp((live.zoom - z0) / Math.max(0.01, z1 - z0), 0, 1);
    const stageName = u < 0.35 ? 'earth' : u < 0.82 ? 'city' : 'street';
    if (stage.dataset.stage !== stageName) stage.dataset.stage = stageName;
    if (caption) {
      const label = u < 0.72 ? 'TORONTO, ONTARIO · 43.67° N 79.41° W' : 'BLOOR ST W · BATHURST → SPADINA · 619 m';
      if (caption.textContent !== label) caption.textContent = label;
    }
    const settled = Math.abs(goal.zoom - live.zoom) < 0.02
      && Math.abs(goal.pitch - live.pitch) < 0.25
      && Math.abs(goal.center[0] - live.center[0]) < 0.04
      && Math.abs(goal.center[1] - live.center[1]) < 0.04;
    if (!settled) frame = requestAnimationFrame(render);
  }

  function onScroll() {
    target = scrollProgress();
    if (!frame) { lastStamp = 0; frame = requestAnimationFrame(render); }
  }

  function onResize() { if (map) { map.resize(); onScroll(); } }

  // Only shown on the landing; the replay keeps its own city views.
  function syncPhase() {
    const phase = document.body.dataset.phase;
    stage.classList.toggle('is-off', phase !== 'intro' && phase !== 'composer');
  }

  // The dark base style is near-black; lift land, water, borders and labels so the Earth reads at globe scale,
  // then let them settle darker as the camera reaches street level.
  function brighten() {
    const set = (id, prop, value) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, value); };
    set('background', 'background-color', ['interpolate', ['linear'], ['zoom'], 0, '#4d8a93', 6, '#2c5660', 11, '#1b343c', 15, '#13252c']);
    set('water', 'fill-color', ['interpolate', ['linear'], ['zoom'], 0, '#14415c', 8, '#0f3348', 13, '#0b2433']);
    set('landcover_ice_shelf', 'fill-color', '#9fc3c8');
    set('landcover_glacier', 'fill-color', '#b9d6da');
    for (const id of ['boundary_country_z0-4', 'boundary_country_z5-']) set(id, 'line-color', '#8fc7c4');
    set('boundary_state', 'line-color', '#6c9ea0');
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'symbol' && /^place_|water_name/.test(layer.id)) {
        set(layer.id, 'text-color', '#d7ecec');
        set(layer.id, 'text-halo-color', '#0b2028');
      }
    }
    try {
      map.setSky({
        'sky-color': '#0b2230', 'horizon-color': '#8affd5', 'fog-color': '#0f2c3a', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.6, 9, 0],
      });
    } catch (error) { /* older renderers skip the glow */ }
  }

  function addLayers() {
    map.addSource('bloor-section', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [BATHURST, SPADINA] } },
        { type: 'Feature', properties: { pin: 1 }, geometry: { type: 'Point', coordinates: CENTER } },
      ] },
    });
    map.addLayer({
      id: 'section-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': '#21434b',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.88,
      },
    });
    map.addLayer({
      id: 'section-glow', type: 'line', source: 'bloor-section', filter: ['==', ['geometry-type'], 'LineString'], minzoom: 11,
      paint: { 'line-color': '#8affd5', 'line-blur': 8, 'line-opacity': 0.35, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 4, 17, 30] },
    });
    map.addLayer({
      id: 'section-line', type: 'line', source: 'bloor-section', filter: ['==', ['geometry-type'], 'LineString'], minzoom: 11,
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#8affd5', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 1.5, 17, 6] },
    });
    map.addLayer({
      id: 'section-pin', type: 'circle', source: 'bloor-section', filter: ['==', ['geometry-type'], 'Point'], maxzoom: 12,
      paint: { 'circle-color': '#8affd5', 'circle-radius': 5, 'circle-stroke-color': '#8affd566', 'circle-stroke-width': 9 },
    });
  }

  function start() {
    const maplibregl = window.maplibregl;
    if (!maplibregl) return giveUp('MapLibre did not load');
    const timer = setTimeout(() => giveUp('map did not load within 12 s'), 12000);
    try {
      map = new maplibregl.Map({
        container: stage.querySelector('.globe-map'),
        style: STYLE,
        interactive: false,
        attributionControl: false,
        fadeDuration: 180,
        antialias: false,
        maxPitch: 60,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25),
        refreshExpiredTiles: false,
        ...camera(scrollProgress()),
      });
    } catch (error) { clearTimeout(timer); return giveUp(error.message); }
    map.on('style.load', () => {
      try { map.setProjection({ type: 'globe' }); } catch (error) { /* flat map still zooms */ }
      try { brighten(); } catch (error) { /* keeps the dark base colours */ }
      try { addLayers(); } catch (error) { /* the zoom works without the highlight */ }
    });
    map.on('error', (event) => console.warn('[globe]', event.error && event.error.message));
    map.once('load', () => {
      clearTimeout(timer);
      ready = true;
      target = scrollProgress();
      live = null;
      lastStamp = 0;
      frame = requestAnimationFrame(render);
      stage.classList.add('is-ready');
      document.body.classList.add('globe-on');
      document.body.classList.remove('globe-pending');
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    new MutationObserver(syncPhase).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
    syncPhase();
  }

  const script = document.createElement('script');
  script.src = MAPLIBRE;
  script.crossOrigin = 'anonymous';
  script.onload = start;
  script.onerror = () => giveUp('MapLibre script blocked');
  document.head.appendChild(script);
})();
