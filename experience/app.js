const { preparedScenarios, exploratoryScenario } = window.CounterfactualScenarios;
const CityScene = window.CityScene;
const traceAdapter = window.CounterfactualTraceAdapter;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const scene = new CityScene($('#cityCanvas'));
const bikeScene = new CityScene($('#bikeWorldCanvas'));
bikeScene.setScenario('bike');
bikeScene.setPhase('lab');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let current = preparedScenarios.fare;
let phase = 'intro';
let investigationToken = 0;
let activeSector = 'mobility';
let activeBikeRole = 'cyclist';
let activeBikePath = 'stay';
let fareTrace = null;

function useFareTrace(trace) {
  if (!traceAdapter.isFareTrace(trace)) return;
  fareTrace = trace;
  window.CounterfactualCurrentRun = trace;
  window.dispatchEvent(new CustomEvent('counterfactual:result', { detail: trace }));
  $('#ttcWorkbenchStatus').textContent = `RUN v${trace.version} · ${trace.diverged_events} CHANGED CHOICES`;
  $('#ttcWorkbenchMeta').textContent = `SEED ${trace.seed} · ASSUMPTION-DRIVEN · NOT A FORECAST`;
  if (current.id === 'fare' && phase !== 'intro' && phase !== 'composer') {
    current = traceAdapter.toFareScenario(trace, preparedScenarios.fare);
    renderLab();
  }
}

function ensureFareInspector() {
  const inspector = $('#ttcInspector');
  if (!inspector.getAttribute('src')) inspector.src = '../demo-ui/?embedded=1&v=cinematic-2';
}

// Storyboard branches demonstrate causal questions until the shared WorldEvent log is connected.
const bikeStories = {
  cyclist: {
    label: 'LESS-CONFIDENT CYCLIST',
    paths: [
      { id: 'stay', label: 'Continue on Bloor', icon: '↗', title: 'The same destination, a different ride.', description: 'This cyclist still takes Bloor in the proposed layout. Their route is shorter than a detour, but the loss of separation changes what they must assess before leaving.', steps: ['Protection removed', 'Choose Bloor', 'Arrive or turn back', 'Shop entry?'], outcome: 'Current comfort, exposure and completed arrival; do not infer an injury count.' },
      { id: 'detour', label: 'Take a detour', icon: '◇', title: 'A longer path may change the stop.', description: 'An alternate street could preserve a cycling trip while moving the rider away from a planned Bloor stop. The direction and size of the change need current routes and origins.', steps: ['Protection removed', 'Choose alternate', 'Time changes', 'Destination choice'], outcome: 'Current route suitability and origin–destination trips; historic rerouting is not a reverse coefficient.' },
      { id: 'ttc', label: 'Switch to TTC', icon: '≋', title: 'One bicycle trip becomes a fare decision.', description: 'A person may still reach the same destination by transit. Their household may pay a fare; any TTC receipt is the other side of that same transaction.', steps: ['Protection removed', 'Choose TTC', 'Pay fare', 'Arrive or bypass'], outcome: 'Fare product, trip purpose and destination before claiming an economic effect.' },
      { id: 'defer', label: 'Defer the trip', icon: '×', title: 'The missing arrival is the signal.', description: 'A discretionary trip may happen later or not at all. A shop effect exists only if this person would have entered and bought something in the baseline world.', steps: ['Protection removed', 'Reconsider trip', 'Defer', 'No visit yet'], outcome: 'Which trips were discretionary and whether a purchase would have occurred.' },
    ],
  },
  delivery: {
    label: 'DRIVER + DELIVERY',
    paths: [
      { id: 'zero', label: 'No time gain', icon: '0', title: 'More road space does not guarantee speed.', description: 'A driver can still face the same intersection delay in the proposed layout. This branch deliberately shows zero time benefit, a valid sensitivity case.', steps: ['Lane reallocated', 'Route unchanged', 'Same travel time', 'No time benefit'], outcome: 'Traffic operations and junction delay under a specific engineered design.' },
      { id: 'pickup', label: 'Easier pickup', icon: '↗', title: 'The curb might work differently.', description: 'A driver with a heavy purchase could benefit from a better pickup location, if the redesign actually supplies one. Parking and loading effects need an explicit curb inventory.', steps: ['Curb redesigned', 'Find loading spot', 'Pick up purchase', 'Record cost'], outcome: 'Curb-space inventory, loading rules, parking payments and actual pickup events.' },
      { id: 'courier', label: 'Delivery reroutes', icon: '◇', title: 'A courier also has a route choice.', description: 'A cyclist delivering goods might take a longer path or share the proposed mixed-traffic section. Earnings change only if time and paid-job rules are measured.', steps: ['Protection removed', 'Choose route', 'Complete delivery?', 'Record time'], outcome: 'Current delivery routes, job pay rules and completed delivery events.' },
    ],
  },
  merchant: {
    label: 'LOCAL SHOP OWNER',
    paths: [
      { id: 'same', label: 'Sales unchanged', icon: '0', title: 'A changed street can leave sales unchanged.', description: 'Customers can change travel mode and still enter the same shop. A zero-retail-response case protects the analysis from assuming every route change is a lost sale.', steps: ['Arrival mix shifts', 'Visits continue', 'Purchases hold', 'Margin unchanged'], outcome: 'Current customer mode, visit and transaction data; model zero retail response.' },
      { id: 'mix', label: 'Visitor mix shifts', icon: '↗', title: 'A new mix reaches the counter.', description: 'Fewer cycling arrivals and more walking, TTC or driving arrivals could offset each other. The shop ledger should follow completed visits and purchases, then compute partial margin.', steps: ['Routes change', 'Arrivals by mode', 'Purchases', 'Partial margin'], outcome: 'Mode-specific arrivals, conversion and variable costs at this shop.' },
      { id: 'disruption', label: 'Construction period', icon: '!', title: 'The transition is its own scenario.', description: 'Street reconstruction could temporarily change access and loading before any steady-state layout exists. This panel does not estimate the duration or cost.', steps: ['Design decision', 'Construction phase', 'Access changes', 'Remeasure'], outcome: 'A real construction plan, duration and Bloor-segment cost.' },
    ],
  },
};

function setPhase(value) {
  phase = value;
  document.body.dataset.phase = value;
  scene.setPhase(value === 'investigating' ? 'composer' : value);
}

function updateReveal() {
  const section = $('#intro');
  const travel = Math.max(1, section.offsetHeight - window.innerHeight);
  const progress = Math.max(0, Math.min(1, window.scrollY / travel));
  document.documentElement.style.setProperty('--reveal', progress.toFixed(3));
  const composer = $('#composerScene');
  const ready = progress > .32;
  composer.classList.toggle('is-ready', ready);
  composer.inert = !ready;
  composer.setAttribute('aria-hidden', String(!ready));
  if (!ready && composer.contains(document.activeElement)) document.activeElement.blur();
  scene.setReveal(progress);
  if (phase === 'intro' && progress > .34) setPhase('composer');
  if (phase === 'composer' && progress < .22) setPhase('intro');
}

function goToComposer() {
  const section = $('#intro');
  const travel = section.offsetHeight - window.innerHeight;
  window.scrollTo({ top: Math.max(0, travel * .82), behavior: reducedMotion ? 'instant' : 'smooth' });
  setTimeout(() => $('#hypothesisInput').focus({ preventScroll: true }), reducedMotion ? 50 : 650);
}

function resetToIntro() {
  investigationToken++;
  $('#investigation').hidden = true;
  $('#lab').hidden = true;
  $('#bikeLab').hidden = true;
  bikeScene.setMotion(false);
  $('#ttcWorkbench').hidden = true;
  $('#impact').hidden = true;
  $('#personaLab').hidden = true;
  scene.setSector(null);
  scene.setScenario('fare');
  setPhase('intro');
}

const steps = [
  ['Framing the question.', 'Identifying the policy change and what a comparison world needs.'],
  ['Loading the people.', 'Showing example riders, cyclists, households, shops and public agencies.'],
  ['Reviewing the evidence.', 'Showing the research and the effects it cannot establish.'],
  ['Comparing both worlds.', 'Replaying illustrative city states and connecting them to example metrics.'],
];

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runScenario(scenario, promptOverride = null) {
  const token = ++investigationToken;
  if (scenario === 'fare') {
    if (!fareTrace) fareTrace = window.CFSim.buildTrace({ seed: 42, version: 1 });
    current = traceAdapter.toFareScenario(fareTrace, preparedScenarios.fare);
    useFareTrace(fareTrace);
    ensureFareInspector();
  } else current = scenario === 'custom' ? exploratoryScenario(promptOverride || '') : preparedScenarios[scenario];
  document.body.dataset.scenario = current.id;
  scene.setScenario(current.id);
  const overlay = $('#investigation');
  overlay.hidden = false;
  setPhase('investigating');
  for (let i = 0; i < steps.length; i++) {
    if (token !== investigationToken) return;
    $('#investigationCount').textContent = `${String(i + 1).padStart(2, '0')} / 04`;
    $('#investigationTitle').textContent = steps[i][0];
    $('#investigationDescription').textContent = steps[i][1];
    $('#investigationProgress').style.width = `${(i + 1) * 25}%`;
    $$('#investigationSteps li').forEach((li, n) => li.classList.toggle('complete', n <= i));
    await wait(reducedMotion ? 100 : 670);
  }
  if (token !== investigationToken) return;
  overlay.hidden = true;
  renderLab();
  $('#lab').hidden = false;
  $('#impact').hidden = false;
  $('#personaLab').hidden = false;
  setPhase('lab');
  requestAnimationFrame(() => $('#lab').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }));
}

function renderLab() {
  $('#bikeLab').hidden = current.id !== 'bike';
  if (current.id === 'bike') {
    bikeScene.resize();
    bikeScene.setPhase('lab');
    bikeScene.setMotion(true);
  } else bikeScene.setMotion(false);
  $('#bikeLabButton').hidden = current.id !== 'bike';
  $('#ttcWorkbench').hidden = current.id !== 'fare';
  $('#ttcInspectorButton').hidden = current.id !== 'fare';
  $('#scenarioBreadcrumb').textContent = current.breadcrumb;
  $('#runStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW' : current.id === 'fare' ? 'SEEDED EVENT REPLAY' : 'PREPARED DEMO REPLAY';
  $('#sampleStatus').textContent = current.id === 'custom' ? 'NO MODEL RESULT' : current.id === 'fare' ? `SYNTHETIC v${current.trace.version}` : 'ILLUSTRATIVE SAMPLE';
  $('#studyTitle').textContent = current.title;
  $('#studySummary').textContent = current.summary;
  $('#viewportArea').textContent = current.viewport;
  $('#worldCaption').textContent = current.worldCaption;
  $('#focusLabelA').textContent = current.focus[0];
  $('#focusLabelB').textContent = current.focus[1];
  $('#headlineEyebrow').textContent = current.headline.label;
  $('#headlineValue').textContent = current.headline.value;
  $('#headlineDirection').textContent = current.headline.direction;
  $('#insightNarrative').textContent = current.narrative;
  $('#sourceRibbon').textContent = current.sourceRibbon;
  $('#impactScenarioTag').textContent = current.mapTag;
  $('#overviewStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW / NO MODEL SERIES' : current.id === 'fare' ? `SCENARIO OUTPUTS / SHARED TRACE v${current.trace.version}` : 'SCENARIO OUTPUTS / PREPARED REPLAY';
  const custom = current.id === 'custom';
  $('#chainLabel').textContent = custom ? 'WHAT A CONNECTED ENGINE WOULD DO' : 'WATCH THE CHAIN';
  $('#impactButtonHint').textContent = custom ? 'Inspect missing evidence' : 'See the connected effects';
  $('#railNoteText').textContent = custom ? 'No agent decisions or policy effects have been computed for this question. Inspect a sector to see what is missing.' : current.id === 'fare' ? 'This is a seeded rule-engine result, not a Toronto forecast. Open the living run to inspect people, events, evidence and reruns.' : 'Simulated decisions are illustrative, not a validated policy forecast. Click an impact to inspect its assumptions.';
  $('#impactHeadingLine').textContent = custom ? 'One question.' : 'One decision.';
  $('#impactHeadingEm').textContent = custom ? 'Open outcomes.' : 'Many futures.';
  $('#impactDescription').textContent = custom ? 'Each sector shows the evidence and model work still needed before a policy effect can be estimated.' : current.id === 'fare' ? 'Each chart reads the same versioned event trace as the TTC city inspector.' : 'Choose a connected sector to inspect its illustrative comparison and evidence boundary.';
  $('#boardCaption').textContent = custom ? 'NO RUN RESULT ATTACHED' : current.id === 'fare' ? `SEEDED TRACE v${current.trace.version} · NOT A FORECAST` : 'ILLUSTRATIVE RUN · NOT A FORECAST';
  $('#boardAction').textContent = custom ? '✳ INSPECT AN OPEN QUESTION' : '✳ TRACE A CONNECTION';
  $('#overviewTitle').textContent = custom ? 'What remains to measure.' : 'Every signal in view.';
  $('#overviewDescription').textContent = custom ? 'These sectors have no modelled series. Choose one to see its missing inputs and evidence.' : current.id === 'fare' ? 'Five linked views of one seeded run. Change an assumption in the TTC inspector and every chart updates.' : 'Five connected sectors, one illustrative comparison. Choose any chart to inspect its mechanism and evidence boundary.';
  $('#viewToggle').hidden = custom;
  $('#viewportLegend').hidden = custom;
  $('#cityStateNote').hidden = !custom;
  $('#focusMarkerA').hidden = custom;
  $('#focusMarkerB').hidden = custom;
  $('#causalChain').replaceChildren(...current.chain.map(item => {
    const li = document.createElement('li'); li.textContent = item; return li;
  }));
  $('#metricMiniCards').replaceChildren(...current.mini.map(metric => {
    const card = document.createElement('div'); card.className = 'metric-mini-card';
    const label = document.createElement('span'); label.textContent = metric.label;
    const value = document.createElement('strong'); value.textContent = metric.value; value.className = metric.tone;
    card.append(label, value); return card;
  }));
  $$('.switch-button').forEach(button => {
    const selected = button.dataset.scenarioChoice === current.id;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const deltas = {
    mobility: '#sectorDeltaMobility', access: '#sectorDeltaAccess', commerce: '#sectorDeltaCommerce',
    households: '#sectorDeltaHouseholds', public: '#sectorDeltaPublic',
  };
  for (const [sector, selector] of Object.entries(deltas)) $(selector).textContent = current.sectors[sector].delta;
  activeSector = 'mobility';
  renderSector();
  renderOverview();
  scene.setSector(null);
  setCityMode('policy');
  if (current.id === 'bike') setBikeRole('cyclist');
  const moving = scene.setMotion(true);
  $('#motionButton').textContent = moving ? 'Ⅱ' : '▶';
  $('#motionButton').setAttribute('aria-label', moving ? 'Pause city animation' : 'Play city animation');
  $('#timeScrubber').value = 70;
  updateTimeline();
  $('#focusMarkerA').style.top = current.id === 'bike' ? '45%' : '39%';
  $('#focusMarkerA').style.left = current.id === 'bike' ? '43%' : '52%';
  $('#focusMarkerB').style.top = current.id === 'bike' ? '62%' : '63%';
  $('#focusMarkerB').style.left = window.innerWidth < 760 ? '39%' : current.id === 'bike' ? '65%' : '69%';
}

function chartPath(points, min, max) {
  if (!points.length) return '';
  const x0 = 25, y0 = 135, width = 370, height = 98;
  return points.map((v, i) => `${i ? 'L' : 'M'} ${x0 + i * width / Math.max(1, points.length - 1)} ${y0 - (v - min) / Math.max(1, max - min) * height}`).join(' ');
}

function renderChart(data) {
  const chart = $('#detailChart');
  const base = data.baseline, policy = data.policy;
  chart.replaceChildren();
  const summary = !base.length || !policy.length
    ? 'No modelled series or numeric effect is attached to this question.'
    : current.id === 'fare'
      ? `Seeded model values, weeks 1–${base.length}. Baseline: ${base.join(', ')}. Proposal: ${policy.join(', ')}. Unit: ${data.unit}. Displayed change compares the average after the policy starts: ${data.delta}. Not a Toronto forecast.`
      : `Illustrative values, periods 1–4. Baseline: ${base.join(', ')}. Proposal: ${policy.join(', ')}. Unit: ${data.unit}. Displayed change uses period 4: ${data.delta}.`;
  chart.setAttribute('aria-label', `${data.chartTitle}. ${summary}`);
  $('#chartSummary').textContent = summary;
  const ns = 'http://www.w3.org/2000/svg';
  const element = (name, attrs) => {
    const el = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  for (let i = 0; i < 4; i++) {
    chart.append(element('line', { x1: 25, x2: 395, y1: 38 + i * 32, y2: 38 + i * 32, stroke: '#94b5ad34', 'stroke-width': 1 }));
  }
  [0, 1, 2, 3].forEach(i => {
    const text = element('text', { x: 25 + i * 370 / 3, y: 159, fill: '#8db3b3', 'font-size': 9, 'text-anchor': 'middle', 'font-family': 'DM Sans, sans-serif' });
    text.textContent = `P${i + 1}`; chart.append(text);
  });
  if (!base.length || !policy.length) {
    const note = element('text', { x: 210, y: 93, fill: '#b4ccc4', 'font-size': 12, 'text-anchor': 'middle', 'font-family': 'DM Sans, sans-serif' });
    note.textContent = 'No modelled series attached'; chart.append(note); return;
  }
  const all = [...base, ...policy];
  const lo = Math.min(...all) - 2, hi = Math.max(...all) + 2;
  chart.append(element('path', { d: chartPath(base, lo, hi), fill: 'none', stroke: '#ff987e', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  chart.append(element('path', { d: chartPath(policy, lo, hi), fill: 'none', stroke: '#a8f4d1', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  for (const [series, color] of [[base, '#ff987e'], [policy, '#a8f4d1']]) {
    series.forEach((v, i) => chart.append(element('circle', { cx: 25 + i * 370 / 3, cy: 135 - (v - lo) / (hi - lo) * 98, r: 3.4, fill: color, stroke: '#153039', 'stroke-width': 1.6 })));
  }
}

function renderSector() {
  const sector = current.sectors[activeSector];
  $$('.sector-node').forEach(node => {
    const selected = node.dataset.sector === activeSector;
    node.classList.toggle('active', selected);
    node.setAttribute('aria-pressed', String(selected));
  });
  $$('.overview-card').forEach(card => {
    const selected = card.dataset.sector === activeSector;
    card.classList.toggle('active', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  $('#detailNumber').textContent = sector.number;
  $('#detailIcon').textContent = sector.icon;
  $('#detailTitle').textContent = sector.title;
  $('#detailDescription').textContent = sector.description;
  $('#chartTitle').textContent = sector.chartTitle;
  $('#detailEvidence').textContent = sector.evidence;
  renderChart(sector);
  if (phase === 'impact') scene.setSector(activeSector);
}

function renderOverview() {
  const grid = $('#overviewGrid');
  grid.replaceChildren();
  const keys = ['mobility', 'access', 'commerce', 'households', 'public'];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], data = current.sectors[key];
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'overview-card'; card.dataset.sector = key;
    card.setAttribute('aria-label', `Inspect ${key} chart and evidence`);
    const top = document.createElement('div'); top.className = 'overview-card-top';
    const num = document.createElement('span'); num.textContent = `${String(i + 1).padStart(2, '0')} / ${key.toUpperCase()}`;
    const icon = document.createElement('span'); icon.textContent = data.icon; top.append(num, icon);
    const title = document.createElement('strong'); title.textContent = key === 'public' ? 'Public realm' : key === 'commerce' ? 'Local shops' : key[0].toUpperCase() + key.slice(1);
    const delta = document.createElement('em'); delta.textContent = data.delta;
    card.append(top, title, delta);
    if (data.baseline.length && data.policy.length) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 200 58'); svg.setAttribute('aria-hidden', 'true');
      const values = [...data.baseline, ...data.policy]; const lo = Math.min(...values) - 2, hi = Math.max(...values) + 2;
      for (const [series, color] of [[data.baseline, '#ff987e'], [data.policy, '#a8f4d1']]) {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', series.map((v, n) => `${n ? 'L' : 'M'} ${n * 198 / Math.max(1, series.length - 1) + 1} ${55 - (v - lo) / (hi - lo) * 52}`).join(' '));
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', '2.2'); path.setAttribute('stroke-linecap', 'round');
        svg.append(path);
      }
      card.append(svg);
    } else {
      const empty = document.createElement('div'); empty.className = 'overview-card-empty'; empty.textContent = 'NO SERIES ATTACHED'; card.append(empty);
    }
    const hint = document.createElement('small'); hint.textContent = data.baseline.length ? 'BASELINE / POLICY · OPEN ↗' : 'OPEN LIMITS ↗'; card.append(hint);
    card.addEventListener('click', () => {
      if (phase !== 'impact') setPhase('impact');
      chooseSector(key);
      $('#sectorDetail').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
    });
    grid.append(card);
  }
  $$('.overview-card').forEach(card => {
    const selected = card.dataset.sector === activeSector;
    card.classList.toggle('active', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
}

function chooseSector(name) {
  if (!current.sectors[name]) return;
  activeSector = name;
  renderSector();
}

function openEvidence() {
  $('#evidenceDialogTitle').textContent = current.evidence.title;
  $('#evidenceDialogText').textContent = current.evidence.text;
  $('#evidenceLinks').replaceChildren(...current.evidence.links.map(([label, url]) => {
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = label; const arrow = document.createElement('span'); arrow.textContent = '↗'; link.append(arrow); return link;
  }));
  $('#evidenceDialog').showModal();
}

function updateTimeline(scrubbing = false) {
  const value = Number($('#timeScrubber').value);
  updateTimelineLabel(value);
  scene.setProgress(value / 100, scrubbing);
  if (scrubbing) {
    $('#motionButton').textContent = '▶';
    $('#motionButton').setAttribute('aria-label', 'Play city animation');
  }
}

function updateTimelineLabel(value) {
  const period = value < 17 ? 0 : value < 37 ? 1 : value < 62 ? 2 : value < 84 ? 3 : 4;
  $('#timelineLabel').textContent = `MOTION FRAME ${String(period).padStart(2, '0')} / 04`;
}

function setViewSelection(mode) {
  for (const [choice, selector] of [['baseline', '#baselineView'], ['policy', '#policyView']]) {
    const selected = choice === mode;
    $(selector).classList.toggle('selected', selected);
    $(selector).setAttribute('aria-pressed', String(selected));
  }
}

function setCityMode(mode) {
  scene.setMode(mode);
  bikeScene.setMode(mode);
  $('#bikeWorldState').textContent = mode === 'baseline' ? 'EXISTING PROTECTED TRACK' : 'HYPOTHETICAL REMOVAL';
  setViewSelection(mode);
  $('#bikeStage').dataset.view = mode;
  for (const [choice, selector] of [['baseline', '#bikeViewBaseline'], ['policy', '#bikeViewPolicy']]) {
    const selected = choice === mode;
    $(selector).classList.toggle('selected', selected);
    $(selector).setAttribute('aria-pressed', String(selected));
  }
  $('#bikeStageIndex').textContent = mode === 'baseline' ? '01 / EXISTING STREET' : '02 / PROPOSED WORLD';
  $('#bikeStageTitle').textContent = mode === 'baseline' ? 'A protected path through Bloor.' : 'The protected track is removed.';
  $('#bikeStageSubtitle').textContent = mode === 'baseline'
    ? 'Present-day protected cycling space, shown schematically.'
    : 'A hypothetical motor-vehicle and curb layout; exact geometry is unverified.';
}

function setBikePath(pathId) {
  const story = bikeStories[activeBikeRole].paths.find(path => path.id === pathId);
  if (!story) return;
  activeBikePath = pathId;
  $$('#bikePaths button').forEach(button => {
    const selected = button.dataset.bikePath === pathId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#bikeRoleLabel').textContent = bikeStories[activeBikeRole].label;
  $('#bikePathTitle').textContent = story.title;
  $('#bikePathDescription').textContent = story.description;
  $('#bikeOutcomeText').textContent = story.outcome;
  $('#bikeStepFlow').replaceChildren(...story.steps.map((step, index) => {
    const item = document.createElement('span');
    item.className = 'bike-step';
    item.textContent = step;
    item.dataset.step = String(index + 1).padStart(2, '0');
    return item;
  }));
}

function setBikeRole(roleId) {
  const role = bikeStories[roleId];
  if (!role) return;
  activeBikeRole = roleId;
  $$('[data-bike-role]').forEach(button => {
    const selected = button.dataset.bikeRole === roleId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const pathContainer = $('#bikePaths');
  pathContainer.replaceChildren(...role.paths.map(path => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.bikePath = path.id;
    button.innerHTML = `<span class="bike-path-icon" aria-hidden="true"></span><span class="bike-path-text"></span><span class="bike-path-arrow" aria-hidden="true">↗</span>`;
    button.querySelector('.bike-path-icon').textContent = path.icon;
    button.querySelector('.bike-path-text').textContent = path.label;
    button.addEventListener('click', () => setBikePath(path.id));
    return button;
  }));
  setBikePath(role.paths[0].id);
}

$('#enterButton').addEventListener('click', goToComposer);
$('#headerExplore').addEventListener('click', () => { resetToIntro(); goToComposer(); });
$('.brand').addEventListener('click', resetToIntro);
$('#askAnother').addEventListener('click', resetToIntro);
$('#hypothesisForm').addEventListener('submit', event => {
  event.preventDefault();
  const query = $('#hypothesisInput').value.trim();
  if (!query) { $('#hypothesisInput').focus(); return; }
  const normalized = query.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '');
  const match = Object.entries(preparedScenarios).find(([, prepared]) => [prepared.prompt, ...(prepared.aliases || [])].some(phrase => phrase.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '') === normalized));
  const chosen = match ? match[0] : 'custom';
  runScenario(chosen, query);
});
$('#hypothesisInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#hypothesisForm').requestSubmit(); } });
$$('[data-scenario-choice]').forEach(button => button.addEventListener('click', () => {
  const chosen = button.dataset.scenarioChoice;
  $('#hypothesisInput').value = preparedScenarios[chosen].prompt;
  runScenario(chosen);
}));
$('#impactMapButton').addEventListener('click', () => { $('#impact').hidden = false; setPhase('impact'); scene.setSector(activeSector); $('#impact').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }); });
$('#bikeLabButton').addEventListener('click', () => $('#bikeLab').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }));
$('#ttcInspectorButton').addEventListener('click', () => $('#ttcWorkbench').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }));
$('#personaLabButton').addEventListener('click', () => $('#personaLab').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }));
$('#bikeImpactButton').addEventListener('click', () => {
  const sector = activeBikeRole === 'merchant' ? 'commerce' : activeBikeRole === 'delivery' ? 'public' : 'mobility';
  chooseSector(sector);
  $('#impactMapButton').click();
});
$$('[data-bike-role]').forEach(button => button.addEventListener('click', () => setBikeRole(button.dataset.bikeRole)));
$('#bikeViewBaseline').addEventListener('click', () => setCityMode('baseline'));
$('#bikeViewPolicy').addEventListener('click', () => setCityMode('policy'));
$('#backToCity').addEventListener('click', () => { setPhase('lab'); scene.setSector(null); $('#lab').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }); });
$$('.sector-node').forEach(node => {
  node.addEventListener('click', () => chooseSector(node.dataset.sector));
  node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseSector(node.dataset.sector); } });
});
$('#baselineView').addEventListener('click', () => setCityMode('baseline'));
$('#policyView').addEventListener('click', () => setCityMode('policy'));
$('#motionButton').addEventListener('click', () => { const running = scene.toggleMotion(); $('#motionButton').textContent = running ? 'Ⅱ' : '▶'; $('#motionButton').setAttribute('aria-label', running ? 'Pause city animation' : 'Play city animation'); });
$('#timeScrubber').addEventListener('input', () => updateTimeline(true));
setInterval(() => {
  if ($('#lab').hidden || !scene.running) return;
  const value = Math.floor(scene.time % 100);
  $('#timeScrubber').value = value;
  updateTimelineLabel(value);
}, 250);
$('#inspectEvidence').addEventListener('click', openEvidence);
$('#focusMarkerA').addEventListener('click', () => { activeSector = 'mobility'; renderSector(); $('#impactMapButton').click(); });
$('#focusMarkerB').addEventListener('click', () => { activeSector = 'commerce'; renderSector(); $('#impactMapButton').click(); });
window.addEventListener('scroll', updateReveal, { passive: true });
window.addEventListener('resize', updateReveal, { passive: true });
window.addEventListener('message', event => {
  const inspector = $('#ttcInspector');
  if (event.origin !== window.location.origin || event.source !== inspector.contentWindow || event.data?.type !== 'counterfactual:result') return;
  useFareTrace(event.data.trace);
});
updateReveal();
const linkedDemo = new URLSearchParams(window.location.search).get('demo');
if (linkedDemo && preparedScenarios[linkedDemo]) runScenario(linkedDemo);

// Preview helpers for in-app QA; no production data is exposed.
window.counterfactualPreview = { runScenario, scene, goToComposer, openEvidence };
