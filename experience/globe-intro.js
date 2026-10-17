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

  let map = null, target = 0, current = 0, frame = 0, ready = false;
  const caption = stage.querySelector('.globe-caption');

  function webgl() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (error) { return false; }
  }

  function giveUp(reason) {
    console.warn('[globe] drawn landing kept:', reason || 'unavailable');
    if (map) { try { map.remove(); } catch (error) { /* already gone */ } }
    stage.remove();
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
      center: [lerp(-38, CENTER[0], travel), lerp(24, CENTER[1], travel)],
      zoom: lerp(z0, z1, smooth(t)),
      pitch: lerp(0, wide ? 58 : 50, tilt),
      bearing: lerp(0, BLOOR_BEARING, tilt),
      // Keep the globe right of the headline on slide one; centre the street by slide two.
      padding: { left: wide ? window.innerWidth * 0.36 * (1 - travel) : 0, right: 0, top: wide ? 0 : window.innerHeight * 0.28 * (1 - travel), bottom: 0 },
    };
  }

  function render() {
    frame = 0;
    current += (target - current) * 0.2;
    if (Math.abs(target - current) < 0.0005) current = target;
    if (map && ready) {
      map.jumpTo(camera(current));
      const t = clamp(current / ARRIVE, 0, 1);
      stage.dataset.stage = t < 0.4 ? 'earth' : t < 0.92 ? 'city' : 'street';
      if (caption) caption.textContent = t < 0.78 ? 'TORONTO, ONTARIO · 43.67° N 79.41° W' : 'BLOOR ST W · BATHURST → SPADINA · 619 m';
    }
    if (current !== target) frame = requestAnimationFrame(render);
  }

  function onScroll() {
    target = scrollProgress();
    if (!frame) frame = requestAnimationFrame(render);
  }

  function onResize() { if (map) { map.resize(); onScroll(); } }

  // Only shown on the landing; the replay keeps its own city views.
  function syncPhase() {
    const phase = document.body.dataset.phase;
    stage.classList.toggle('is-off', phase !== 'intro' && phase !== 'composer');
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
        fadeDuration: 0,
        maxPitch: 60,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        ...camera(scrollProgress()),
      });
    } catch (error) { clearTimeout(timer); return giveUp(error.message); }
    map.on('style.load', () => {
      try { map.setProjection({ type: 'globe' }); } catch (error) { /* flat map still zooms */ }
      try { addLayers(); } catch (error) { /* the zoom works without the highlight */ }
    });
    map.on('error', (event) => console.warn('[globe]', event.error && event.error.message));
    map.once('load', () => {
      clearTimeout(timer);
      ready = true;
      current = target = scrollProgress();
      render();
      stage.classList.add('is-ready');
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
