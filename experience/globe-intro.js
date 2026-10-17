// Landing globe: scrolling the intro flies from the whole Earth down to Bloor St W, Bathurst to Spadina.
// It reads the same scroll progress as app.js updateReveal() (0 = top, ~.32 = the composer slide) and never
// touches run state. Without WebGL, with reduced motion, with ?globe=off, or if the map style does not load,
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
  const STREET_Y = 0.32;          // at street level, Bloor sits 32% of the height below centre, under the composer
  const FLIGHT_S = 8;             // one scroll plays the whole landing; the page and the globe take this long
  const MAX_ZOOM_PER_S = 2.2;     // a fast flick cannot skip Earth → Toronto → Bloor

  const stage = document.getElementById('globeStage');
  const params = new URLSearchParams(window.location.search);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!stage || params.get('globe') === 'off' || reduced || !webgl()) { if (stage) stage.remove(); return; }

  let map = null, target = 0, frame = 0, lastStamp = 0, ready = false, captionTimer = 0, live = null;
  let flightDir = 0, flightFrame = 0, flightLast = 0;
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
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKey);
  }

  // After the first run app.js marks the landing as done; it stays at the street until a page reload.
  const landed = () => document.body.classList.contains('is-landed');

  // Mirrors app.js updateReveal().
  function scrollProgress() {
    const section = document.getElementById('intro');
    if (!section || landed()) return 1;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    return Math.max(0, Math.min(1, window.scrollY / travel));
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep: no jolt where a phase starts or ends
  const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

  // Where the composer's "Watch everything else move." ends up once it has slid in (reveal = 1), so the
  // Bloor section can land as its underline. Measured from layout, not the current transform.
  let underline = null;
  function measureUnderline() {
    const composer = document.getElementById('composerScene');
    const em = composer && composer.querySelector('h2 em');
    if (!em) return (underline = null);
    const box = composer.getBoundingClientRect(), mark = em.getBoundingClientRect();
    const top = composer.offsetTop - 0.43 * composer.offsetHeight;   // translateY(-43%) at reveal = 1
    underline = { y: top + (mark.bottom - box.top) + 12, width: mark.width };
  }

  function zoomRange() {
    const w = window.innerWidth, h = window.innerHeight;
    // Globe diameter ≈ 512·2^z / π px; start at ~66% of the shorter side so it fits beside the headline.
    const start = Math.log2(Math.min(w, h) * 0.66 * Math.PI / 512);
    // End with the 619 m section as wide as the headline it underlines (metres per px = 56 614 / 2^z here).
    const span = underline ? underline.width * 0.98 : 0.5 * w;
    return [start, clamp(Math.log2(56614 * span / SECTION_M), 14, 16.7)];
  }

  function camera(p) {
    const t = clamp(p / ARRIVE, 0, 1);
    const [z0, z1] = zoomRange();
    const w = window.innerWidth, h = window.innerHeight, wide = w > 760;
    // Overlapping phases so one motion hands over to the next: spin to Toronto, zoom, then tilt and level Bloor.
    const travel = ease(span(t, 0, 0.5));
    const tilt = ease(span(t, 0.45, 1));
    // Keep the map out from under the text: the globe and the Toronto pin sit right of (on phones, below) the
    // headline, then the street lands in the band under the composer.
    const aside = 1 - ease(span(t, 0.35, 0.8));
    const below = ease(span(t, 0.55, 1));
    const streetY = underline ? clamp(underline.y / h, 0.3, 0.85) : 0.5 + STREET_Y;
    const fx = 0.5 + (wide ? 0.2 : 0) * aside;
    const fy = lerp(0.5 + (wide ? 0 : 0.2) * aside, streetY, below);
    return {
      center: [lerp(-52, CENTER[0], travel), lerp(28, CENTER[1], travel)],
      zoom: lerp(z0, z1, ease(t)),
      // A lower tilt keeps the horizon (and its pile of distant tiles) out of the street view.
      pitch: lerp(0, wide ? 48 : 42, tilt),
      bearing: lerp(0, BLOOR_BEARING, tilt),
      padding: {
        left: Math.max(0, (2 * fx - 1) * w), right: Math.max(0, (1 - 2 * fx) * w),
        top: Math.max(0, (2 * fy - 1) * h), bottom: Math.max(0, (1 - 2 * fy) * h),
      },
    };
  }

  function introTravel() {
    const section = document.getElementById('intro');
    return section ? Math.max(1, section.offsetHeight - window.innerHeight) : 1;
  }

  // One wheel, key, or swipe starts the landing. The page then scrolls itself. The size of the
  // gesture does not matter, so a fast flick cannot jump to the street.
  function play(dir) {
    flightDir = dir;
    if (!flightFrame) { flightLast = 0; flightFrame = requestAnimationFrame(drive); }
  }

  function drive(now) {
    flightFrame = 0;
    if (landed()) { flightDir = 0; return; }
    const dt = flightLast ? Math.min(0.05, (now - flightLast) / 1000) : 0.016;
    flightLast = now;
    const max = introTravel();
    const y = clamp(window.scrollY + flightDir * (max / FLIGHT_S) * dt, 0, max);
    // The page uses smooth scrolling. A per-frame scrollTo would restart that animation and crawl.
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    if ((flightDir > 0 && y >= max) || (flightDir < 0 && y <= 0)) flightDir = 0;
    if (flightDir !== 0) flightFrame = requestAnimationFrame(drive);
  }

  function onLanding(down) {
    if (landed()) return false;
    const max = introTravel();
    if (window.scrollY > max + 48) return false;
    if (down && window.scrollY >= max - 1) return false;
    if (!down && window.scrollY <= 0) return false;
    return true;
  }

  function onWheel(event) {
    if (event.target instanceof Element && event.target.closest('textarea, input, select')) return;
    const down = event.deltaY >= 0;
    if (!onLanding(down)) return;
    event.preventDefault();
    play(down ? 1 : -1);
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('textarea, input, select')) return;
    const down = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ';
    const up = event.key === 'ArrowUp' || event.key === 'PageUp';
    if (!down && !up) return;
    if (!onLanding(down)) return;
    event.preventDefault();
    play(down ? 1 : -1);
  }

  function render(now) {
    frame = 0;
    if (!map || !ready) return;
    const dt = lastStamp ? Math.min(0.032, (now - lastStamp) / 1000) : 0.016;
    lastStamp = now;
    const goal = camera(target);
    if (!live) live = { center: [goal.center[0], goal.center[1]], zoom: goal.zoom, pitch: goal.pitch, bearing: goal.bearing, padding: { ...goal.padding } };
    const k = 1 - Math.exp(-dt / 0.55);
    const maxZoom = MAX_ZOOM_PER_S * dt;
    live.zoom += clamp((goal.zoom - live.zoom) * k, -maxZoom, maxZoom);
    live.center[0] += (goal.center[0] - live.center[0]) * k;
    live.center[1] += (goal.center[1] - live.center[1]) * k;
    live.pitch += (goal.pitch - live.pitch) * k;
    live.bearing += (goal.bearing - live.bearing) * k;
    for (const side of ['left', 'right', 'top', 'bottom']) live.padding[side] += (goal.padding[side] - live.padding[side]) * k;
    map.jumpTo({ center: live.center, zoom: live.zoom, pitch: live.pitch, bearing: live.bearing, padding: live.padding });
    const [z0, z1] = zoomRange();
    const u = clamp((live.zoom - z0) / Math.max(0.01, z1 - z0), 0, 1);
    const stageName = u < 0.35 ? 'earth' : u < 0.82 ? 'city' : 'street';
    if (stage.dataset.stage !== stageName) stage.dataset.stage = stageName;
    setCaption(u < 0.72 ? 'TORONTO, ONTARIO · 43.67° N 79.41° W' : 'BLOOR ST W · BATHURST → SPADINA · 619 m');
    const settled = Math.abs(goal.zoom - live.zoom) < 0.03
      && Math.abs(goal.pitch - live.pitch) < 0.4
      && Math.abs(goal.center[0] - live.center[0]) < 0.08;
    if (!settled) frame = requestAnimationFrame(render);
    else lastStamp = 0;
  }

  // Cross-fades the caption instead of swapping it mid-frame.
  function setCaption(text) {
    if (!caption || caption.dataset.text === text) return;
    caption.dataset.text = text;
    caption.classList.add('is-swapping');
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => { caption.textContent = text; caption.classList.remove('is-swapping'); }, 280);
  }

  function onScroll() {
    // Landing mid-flight (e.g. a ?demo= link at the top) jumps to the street rather than flying there behind the lab.
    if (landed() && target !== 1) live = null;
    target = scrollProgress();
    if (!frame) frame = requestAnimationFrame(render);
  }

  function onResize() { measureUnderline(); if (map) { map.resize(); onScroll(); } }

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
      // No street, road or building-number labels on the landing; place and water names stay.
      if (layer.type === 'symbol' && /transportation_name|road|highway|street|housenumber|poi/.test(layer.id)) {
        try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (error) { /* layer gone */ }
        continue;
      }
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
    // Buildings rise and fade in over a zoom level rather than popping in when zoom 14 is crossed.
    map.addLayer({
      id: 'section-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13.2,
      paint: {
        'fill-extrusion-color': '#21434b',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 14.8, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 14.8, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13.2, 0, 14.2, 0.88],
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

  // Warm the browser cache with the street-level tiles around the section while the globe is at rest, so the
  // buildings are already there when the camera lands. Tiles are versioned and served with a 10-year max-age.
  function prefetchStreetTiles() {
    const source = map.getSource('openmaptiles');
    const template = source && source.tiles && source.tiles[0];
    if (!template) return;
    const tileAt = (z) => {
      const n = 2 ** z, lat = CENTER[1] * Math.PI / 180;
      return [Math.floor((CENTER[0] + 180) / 360 * n), Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n)];
    };
    const urls = [];
    const block = (z, xs, ys) => {
      const [cx, cy] = tileAt(z), cells = [];
      for (let dy = ys[0]; dy <= ys[1]; dy++) for (let dx = xs[0]; dx <= xs[1]; dx++) cells.push([dx, dy]);
      cells.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      for (const [dx, dy] of cells) urls.push(template.replace('{z}', z).replace('{x}', cx + dx).replace('{y}', cy + dy));
    };
    block(13, [-1, 1], [-1, 1]);
    block(14, [-2, 2], [-3, 1]);   // the tilted street view looks north, so more rows above the section than below
    let next = 0;
    const pump = () => {
      if (next >= urls.length) return;
      fetch(urls[next++], { credentials: 'same-origin', priority: 'low' })
        .then((response) => response.arrayBuffer())   // read the body so the response is stored in the cache
        .catch(() => {}).finally(pump);
    };
    for (let i = 0; i < 4; i++) pump();
  }

  function start() {
    const maplibregl = window.maplibregl;
    if (!maplibregl) return giveUp('MapLibre did not load');
    measureUnderline();
    if (document.fonts) document.fonts.ready.then(() => { measureUnderline(); onScroll(); });
    const timer = setTimeout(() => giveUp('map style did not load within 12 s'), 12000);
    try {
      map = new maplibregl.Map({
        container: stage.querySelector('.globe-map'),
        style: STYLE,
        interactive: false,
        attributionControl: false,
        fadeDuration: 180,
        antialias: false,
        maxPitch: 55,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25),
        ...camera(scrollProgress()),
      });
    } catch (error) { clearTimeout(timer); return giveUp(error.message); }
    map.on('style.load', () => {
      clearTimeout(timer);   // the network works; slow tiles just bring the globe in later, never the drawn city
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
      map.once('idle', prefetchStreetTiles);
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
  }

  const script = document.createElement('script');
  script.src = MAPLIBRE;
  script.crossOrigin = 'anonymous';
  script.onload = start;
  script.onerror = () => giveUp('MapLibre script blocked');
  document.head.appendChild(script);
})();
