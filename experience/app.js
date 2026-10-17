const { preparedScenarios, exploratoryScenario } = window.CounterfactualScenarios;
const CityScene = window.CityScene;
const traceAdapter = window.CounterfactualTraceAdapter;
const experimentRunner = window.CounterfactualExperiment;
const experimentFixtures = window.CounterfactualExperimentFixtures;
const experimentAdapter = window.CounterfactualExperimentAdapter;
// One mapped Bathurst–Spadina world for both prepared policies and compiled prompts.
const worldRunner = window.CounterfactualWorldExperiment;
const worldFixtures = window.CounterfactualWorldFixtures;
const worldAdapter = window.CounterfactualWorldRunAdapter;
const scenarioCompiler = window.CounterfactualScenarioCompiler;
// Demo view (the default stage walkthrough) or Researcher view (?detail=1); see view-mode.js. Both read the same run.
const demoView = () => Boolean(window.CounterfactualView?.isDemo());

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const scene = new CityScene($('#cityCanvas'));
const bikeScene = new CityScene($('#bikeWorldCanvas'));
bikeScene.setScenario('bike');
bikeScene.setPhase('lab');
const bloorMainMap = new window.BloorMapView($('#bloorMapMain'));
const bloorBikeMap = new window.BloorMapView($('#bloorMapBike'));

// Mapped-run state. `runs` keeps the latest version per prepared scenario; `active` is what the lab shows.
const mapped = {
  world: null, runs: {}, specs: {}, active: null, activeKey: null, activeEvent: null, ratingsOn: false,
  rerunStatus: {}, pending: {}, servedBy: new WeakMap(), clef: {}, unsubscribe: null, lastLabel: '', stripActor: null,
};
const worldReady = fetch('../data/world/bloor_spadina_bathurst.json')
  .then((response) => { if (!response.ok) throw new Error(`Map HTTP ${response.status}`); return response.json(); })
  .then((world) => {
    if (!bloorMainMap.setWorld(world)) return null;
    bloorBikeMap.setWorld(world);
    $('#bikeMapCredit').hidden = false;
    bloorMainMap.setScenario(current.id);
    bloorBikeMap.setScenario('bike');
    $('#worldCaption').textContent = current.id === 'custom' ? current.worldCaption : 'Mapped Bathurst–Spadina section · replays recorded travel events';
    mapped.world = world;
    return world;
  })
  .catch((error) => { console.warn('Mapped world unavailable; using the earlier schematic engines.', error); return null; });
// The canonical engine needs the world JSON and every mapped-run module; otherwise the old fixture engines run.
const mappedAvailable = () => Boolean(mapped.world && worldRunner && worldFixtures && worldAdapter && window.BloorSandbox);
const mappedMode = () => mappedAvailable() && !mapped.failed;

// Engine backend (api/server.js, deployed on Vultr Cloud Compute). Lookup order:
//   1. same origin (the page is served by the Vultr VM, or `node api/server.js` locally);
//   2. on a localhost page (Steven's agent server on :4174, python http.server on :4173), the public Vultr
//      engine, which allows CORS only from localhost/127.0.0.1 origins. `?engine=<url>` overrides it and
//      `?engine=off` forces the in-browser engine.
// If neither answers, every run, compile and rerun happens in this browser with the same modules.
const VULTR_ENGINE_URL = 'https://155-138-141-130.sslip.io';
async function api(path, body = null, timeoutMs = 15000, base = mapped.base || '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal } : { signal: controller.signal });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
const backendReady = (async () => {
  const param = new URLSearchParams(window.location.search).get('engine');
  if (param === 'off') return (mapped.backend = null);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
  const candidates = param ? [param.replace(/\/$/, '')] : local ? ['', VULTR_ENGINE_URL] : [''];
  for (const base of candidates) {
    try {
      // Same origin gets 4 s too: the first health check races the world JSON parse on the main thread.
      const health = await api('/api/health', null, 4000, base);
      if (health?.ok && health.host) { mapped.base = base; mapped.backend = { ...health, remote: Boolean(base) }; return mapped.backend; }
    } catch { /* try the next candidate */ }
  }
  return (mapped.backend = null);
})();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let current = preparedScenarios.fare;
let phase = 'intro';
let investigationToken = 0;
let activeSector = 'mobility';
let activeBikeRole = 'cyclist';
let activeBikePath = 'stay';
let activeBikeDecisionKey = null;
let fareTrace = null;
let bikeExperiment = null;

// Live persona agents. The agent server (persona-swarm/runtime/server.js) also serves this site, so calls are same-origin
// and the browser holds no key. Served any other way, health() fails and the prepared replays run.
const agents = { client: window.AgentsClient?.create() || null, online: false, count: 0, roster: new Map(), polls: {}, chatPoll: null, shown: null, chatToken: 0, roleFilter: '' };
const agentsReady = (async () => {
  try {
    const health = agents.client && await agents.client.health();
    agents.online = Boolean(health?.ok);
    agents.count = health?.agents || 0;
    if (agents.online) agents.roster = new Map((await agents.client.agents()).agents.map((agent) => [agent.id, agent]));
  } catch (error) { console.warn('Persona agents unavailable; using prepared replays.', error); }
  // The corner pill always states the agents' real state.
  const note = $('#agentsNote');
  note.textContent = agents.online ? `LIVE · ${agents.count} PERSONA AGENTS` : 'AGENTS OFFLINE · PREPARED REPLAYS';
  note.dataset.state = agents.online ? 'live' : 'offline';
  note.hidden = false;
  // Steven's showcase collapses the earlier prepared replay while the 100 agents are live. The mapped paired run
  // (map, ledger and charts from one event log) is the canonical simulation, so it stays open.
  setReplayOpen(!agents.online || Boolean(await worldReady && mappedMode()));
  return agents.online;
})();

// The prepared simulation replay (ledger, charts, TTC inspector) is synthetic and separate from the 100 agents.
function setReplayOpen(open) {
  document.body.classList.toggle('replay-collapsed', !open);
  $('#replayToggle').setAttribute('aria-expanded', String(open));
  $('#replayToggleState').textContent = open ? 'Hide ↑' : 'Show ↓';
}

function useFareTrace(trace) {
  if (!traceAdapter.isFareTrace(trace)) return;
  $('#ttcWorkbenchStatus').textContent = `PROTOTYPE RUN v${trace.version} · ${trace.diverged_events} CHANGED CHOICES`;
  $('#ttcWorkbenchMeta').textContent = `SEED ${trace.seed} · ASSUMPTION-DRIVEN · NOT A FORECAST`;
  // With the mapped world loaded, the earlier prototype only updates its own status bar; the outer charts,
  // ledger and map stay on the canonical mapped RunResult.
  if (mappedMode()) return;
  fareTrace = trace;
  window.CounterfactualCurrentRun = trace;
  window.dispatchEvent(new CustomEvent('counterfactual:result', { detail: trace }));
  $('#ttcWorkbenchStatus').textContent = `RUN v${trace.version} · ${trace.diverged_events} CHANGED CHOICES`;
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

function eventDescendants(events, startId) {
  const reached = new Set([startId]);
  const chain = [];
  for (const event of events) {
    if (event.id === startId || (event.caused_by || []).some((id) => reached.has(id))) {
      chain.push(event);
      reached.add(event.id);
    }
  }
  return chain;
}

function eventText(event) {
  if (event.action === 'choose_trip') return `Chose ${event.chosen.replaceAll('_', ' ')} · ${event.provider.replaceAll('_', ' ')}: ${event.reason}`;
  if (event.action === 'change_destination') return `Changed destination: ${event.from.replaceAll('_', ' ')} → ${event.to.replaceAll('_', ' ')}`;
  if (event.action === 'travel') return `${event.mode} via ${event.route_id.replaceAll('_', ' ')} → ${event.to.replaceAll('_', ' ')}`;
  if (event.action === 'enter_shop') return 'Entered the local shop';
  if (event.action === 'purchase') return `Bought ${event.amount_cad.toFixed(2)} CAD at the local shop`;
  if (event.action === 'pay_fare') return `Paid ${event.amount_cad.toFixed(2)} CAD TTC fare`;
  if (event.action === 'pay_travel_cost') return `Paid ${event.amount_cad.toFixed(2)} CAD travel cost`;
  if (event.action === 'defer_trip') return 'Deferred the trip';
  if (event.action === 'set_shop_hours') return `Local shop set next-period hours to ${event.hours}`;
  return event.action.replaceAll('_', ' ');
}

function renderBikeExperiment(result) {
  if (!result) return;
  const by = experimentAdapter.deciders(result);
  $('#bikeLedgerSeed').textContent = `PREPARED SIMULATION REPLAY (SYNTHETIC, SEPARATE FROM THE 100 AGENTS) / SEED ${result.seed}`;
  $('#bikeLedgerScope').textContent = `Choose a changed decision to follow its committed events. All figures below are for the replay's ${result.population.count} ${by.who} over ${result.scenario.ticks} model periods, not the 100 agents.`;
  const changes = result.changed_decisions.filter((change) => change.tick >= result.scenario.policy_start);
  if (!changes.some((change) => change.key === activeBikeDecisionKey)) activeBikeDecisionKey = changes.find((change) => change.trip_id === 'shop')?.key || changes[0]?.key;
  const buttons = $('#bikeExperimentChoices');
  buttons.replaceChildren(...changes.slice(0, 8).map((change) => {
    const person = result.personas.find((item) => item.id === change.actor);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'experiment-choice';
    button.setAttribute('aria-pressed', String(change.key === activeBikeDecisionKey));
    const label = document.createElement('strong'); label.textContent = `${person?.name || change.actor} · ${change.trip_id} · P${change.tick}`;
    const route = document.createElement('span'); route.textContent = `${change.baseline.action.replaceAll('_', ' ')} → ${change.intervention.action.replaceAll('_', ' ')}`;
    button.append(label, route);
    button.addEventListener('click', () => { activeBikeDecisionKey = change.key; renderBikeExperiment(result); });
    return button;
  }));
  const change = changes.find((item) => item.key === activeBikeDecisionKey);
  const path = $('#bikeExperimentPath');
  path.replaceChildren();
  if (!change) return;
  const person = result.personas.find((item) => item.id === change.actor);
  const heading = document.createElement('div'); heading.className = 'experiment-path-heading';
  const provider = result.runs.intervention.decisions.find((item) => item.key === change.key)?.provider || 'fixture_rule';
  const title = document.createElement('strong'); title.textContent = `${person?.name || change.actor} (${(person?.role || 'resident').replaceAll('_', ' ')}) · ${change.trip_id} trip · period ${change.tick}`;
  const note = document.createElement('span'); note.textContent = `${provider === 'fixture_rule' ? 'FIXTURE RULE' : `AGENT · ${provider.toUpperCase()}`} / TRACEABLE EVENTS`;
  heading.append(title, note); path.append(heading);
  const columns = document.createElement('div'); columns.className = 'experiment-path-columns';
  for (const [arm, startId, label] of [['baseline', change.baseline_event_id, 'BASELINE'], ['intervention', change.intervention_event_id, 'WITH REMOVAL']]) {
    const column = document.createElement('div'); column.className = 'experiment-path-column';
    const armLabel = document.createElement('span'); armLabel.textContent = label; column.append(armLabel);
    const events = eventDescendants(result.runs[arm].events, startId);
    for (const event of events) {
      const row = document.createElement('p');
      const index = document.createElement('small'); index.textContent = event.id.split(':').at(-1);
      const description = document.createElement('span'); description.textContent = eventText(event);
      row.append(index, description); column.append(row);
    }
    columns.append(column);
  }
  path.append(columns);
  const caveat = document.createElement('p'); caveat.className = 'experiment-path-caveat';
  caveat.textContent = `The policy starts in period ${result.scenario.policy_start}. ${by.agent ? `Choices come from persona agents (${by.label})${by.agent < by.total ? '; the rest used the fixture rule' : ''}.` : 'Route preferences, safety sensitivity and basket values are explicit synthetic assumptions.'} These are sampled choices, not observed Toronto behavior.`;
  path.append(caveat);
}

// ---------- Mapped Bathurst–Spadina run: one RunResult for the map, ledger and charts ----------
const nice = (value) => String(value ?? '').replaceAll('_', ' ');
const cad = (value) => (Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '$—');
const hhmm = (seconds) => {
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '--:--';
  const whole = Math.max(0, Math.floor(s));
  return `${String(Math.floor(whole / 3600) % 24).padStart(2, '0')}:${String(Math.floor((whole % 3600) / 60)).padStart(2, '0')}`;
};
const ASSUMPTION_LABELS = { cost_weight: 'Cost weight', unprotected_cycling_discomfort_per_km: 'Shared-lane discomfort per km', shop_staffing_response: 'Shop staffing response' };
const assumptionLabel = (id) => ASSUMPTION_LABELS[id] || nice(id);
const formatValue = (value) => (typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value));
const STREET_LEVERS = new Set(['bloor_cycle_track', 'bloor_car_lanes_per_direction', 'on_street_parking', 'signal_cycle_s', 'bloor_green_share']);
const ARM_LABEL = { fare: 'WITH +$0.50 ADULT FARE', bike: 'WITH TRACK REMOVED', compiled: 'WITH COMPILED CHANGE' };
const runKeyOf = (result) => (result.scenario_id === 'fare' || result.scenario_id === 'bike' ? result.scenario_id : 'compiled');
// The event replay owns the timeline only while a mapped RunResult is on a visible map.
const replayActive = () => Boolean(current.run && bloorMainMap.run && !bloorMainMap.canvas.hidden);

async function executeMapped(key, spec, { overrides = {}, version = 1 } = {}) {
  const backend = await backendReady;
  if (backend) {
    try {
      const out = await api('/api/run', key === 'compiled' ? { spec, overrides, version } : { scenario: key, overrides, version }, 30000);
      const result = out?.result;
      if (result?.schema_version === 'experiment.v2' && result.runs?.baseline && result.runs?.intervention && result.version === version) {
        mapped.servedBy.set(result, { ...(out.served_by || {}), remote: true });
        return result;
      }
      console.info('Backend did not return the requested experiment.v2 version; running in this browser.');
    } catch (error) { console.warn('Backend run failed; running in this browser.', error); }
  }
  const started = performance.now();
  const result = await worldRunner.runWorldExperiment(spec, { world: mapped.world, seed: 42, version, overrides });
  mapped.servedBy.set(result, { host: 'this browser', elapsed_ms: Math.round(performance.now() - started), remote: false });
  return result;
}

async function preparedRun(key) {
  mapped.specs[key] = worldFixtures[key];
  if (!mapped.runs[key]) mapped.runs[key] = await executeMapped(key, worldFixtures[key]);
  return mapped.runs[key];
}

function publishRun(result) {
  window.CounterfactualCurrentRun = result;
  window.dispatchEvent(new CustomEvent('counterfactual:result', { detail: result }));
}

const trackChanged = (result) => (result.scenario.intervention || []).some((change) => (change.lever || change.target) === 'bloor_cycle_track' && change.value !== 'protected');
// A compiled change borrows the closest dashboard: street levers read the Bloor metrics, fare/service levers the TTC ones.
const dashboardKind = (result) => ((result.scenario.intervention || []).some((change) => STREET_LEVERS.has(change.lever || change.target)) ? 'bike' : 'fare');
const COMPILED_TITLES = {
  fare: { mobility: 'Line 2 trips in the sample.', access: 'Trips deferred or taken elsewhere.', commerce: 'The shop ledger follows purchases.', households: 'Household fare spending.', public: 'Sample TTC receipts, ride by ride.' },
  bike: { mobility: 'Cycling trips that use Bloor.', access: 'Cycling distance shared with cars.', commerce: 'The shop ledger follows purchases.', households: 'Recorded travel payments.', public: 'Driver minutes inside the section.' },
};

function mappedScenarioFor(result, template) {
  const key = runKeyOf(result);
  if (key !== 'compiled') return { ...worldAdapter.toMappedScenario(result, template), id: key, runKey: key, mapScenario: key, template, evidence: template.mappedEvidence || template.evidence };
  let scenario = null;
  try { scenario = worldAdapter.toMappedScenario(result, template); } catch { scenario = null; }
  if (!scenario) {
    // The adapter maps only the prepared dashboards; reuse the closest one and replace its policy-specific copy.
    const kind = dashboardKind(result);
    scenario = worldAdapter.toMappedScenario({ ...result, scenario_id: kind }, template);
    const ticks = result.scenario.ticks;
    for (const [name, sector] of Object.entries(scenario.sectors)) {
      sector.title = COMPILED_TITLES[kind][name];
      if (kind === 'bike' && name === 'public') {
        sector.description = 'Mean in-map minutes per sample car leg, read from committed travel events. Time beyond the section is not estimable.';
        sector.delta = `${sector.policy.at(-1) ?? '—'} / ${sector.baseline.at(-1) ?? '—'} MIN · P${ticks}`;
      }
      if (kind === 'fare' && name === 'households') sector.description = 'Fares recorded for sample households (payer side). Adult and Fair Pass spending are split in run.metrics.by_group.';
    }
    scenario.summary = `${template.change} from period ${result.scenario.policy_start}. ${result.changed_decisions.length} of ${result.runs.intervention.decisions.length} paired choices differ for the same synthetic people. Synthetic people and assumption-driven responses, not a Toronto forecast.`;
  }
  return { ...scenario, run: result, id: 'compiled', runKey: 'compiled', mapScenario: trackChanged(result) ? 'bike' : 'fare', template };
}

function compilerBadge(compiled) {
  const c = compiled?.compiler || {};
  if (c.live) {
    const who = /vultr/i.test(String(c.provider)) ? 'VULTR' : nice(c.provider).toUpperCase();
    return `COMPILED BY ${who}${c.model ? ` · ${c.model}` : ''}${Number.isFinite(c.latency_ms) ? ` · ${(c.latency_ms / 1000).toFixed(1)} s` : ''}`;
  }
  const fellBack = (c.warnings || []).some((warning) => warning.code === 'compiler_fallback');
  return `OFFLINE RULES${fellBack ? ' · HOSTED COMPILER UNAVAILABLE' : ''} · NO MODEL CALL`;
}

function compiledTemplate(prompt, compiled) {
  const changes = (compiled.interventions || []).map((change) => `${nice(change.lever)} → ${formatValue(change.value)}${change.unit === 'CAD' ? ' CAD' : change.unit === 'seconds' ? ' s' : ''}`);
  const change = changes.length ? `Compiled change: ${changes.join(' + ')}` : 'The compiled change';
  return {
    id: 'compiled', prompt, change, mapTag: 'COMPILED / BATHURST–SPADINA', location: 'Bloor Street West, Bathurst Street–Spadina Avenue',
    chain: [change, 'The same synthetic people choose again', 'Trips, fares and shop visits commit as events', 'Map, ledger and charts read that event log'],
    focus: ['01 / CHANGED CHOICE', '02 / LOCAL BUSINESS'],
    evidence: {
      title: 'A compiled question is still an assumption.',
      text: `${compilerBadge(compiled)}. ${compiled.interpretation || ''} The lever change runs on the same mapped Bathurst–Spadina section, synthetic people and seed as the prepared cases. Responses are assumption-driven, not a Toronto forecast. Assumptions the compiler proposed are for review only; they are not run inputs.`.replace(/\s+/g, ' '),
      links: [['Hypothesis compiler rules', '../experiment/scenario-compiler.js'], ['Mapped world sources', '../world/README.md'], ['Product requirements', '../prd.md']],
    },
    sectors: Object.fromEntries(Object.entries(preparedScenarios.fare.sectors).map(([name, sector]) => [name, { icon: sector.icon, number: sector.number }])),
  };
}

async function compilePrompt(prompt) {
  const backend = await backendReady;
  let compiled = null, spec = null;
  if (backend) {
    try { const out = await api('/api/compile', { prompt }, 25000); compiled = out?.compiled || null; spec = out?.spec || null; }
    catch (error) { console.warn('Hosted compiler unavailable; using offline rules.', error); }
  }
  if (!compiled) compiled = scenarioCompiler.offlineCompile(prompt, { world: mapped.world, warnings: backend ? [{ code: 'compiler_fallback', message: 'The hosted compiler did not answer.' }] : [] });
  if (!spec) {
    try { spec = scenarioCompiler.toWorldSpec(compiled, worldFixtures, { world: mapped.world }); }
    catch (error) { spec = { runnable: false, execution_path: 'speculative', reason: error.message }; }
  }
  return { compiled, spec };
}

// Readable names for sandbox nodes and places in ledger rows.
function placeName(id, result = current.run) {
  if (id === 'offmap' || id === 'outside_section') return 'a shop outside the section';
  return result?.places?.shops?.find((shop) => shop.business_id === id)?.name || nice(id);
}
function nodeName(node, result = current.run) {
  const id = String(node ?? '');
  const station = result?.places?.stations?.find((item) => item.node === id);
  if (station) return station.name;
  const crossings = mapped.world?.bloor?.intersections || [];
  const portal = /^portal_(north|south)_(\d+)$/.exec(id);
  const leg = portal && crossings[Number(portal[2])]?.legs?.find((item) => item.endsWith(`|${portal[1]}`));
  if (leg) return leg.split('|')[0];
  // Bloor lane and track nodes are indexed by the mapped intersection they sit at.
  const lane = /^(car|trk)_(eb|wb)_(\d+)$/.exec(id);
  const at = lane && [...new Set((crossings[Number(lane[3])]?.legs || []).map((item) => item.split('|')[0]))].join(' / ');
  if (lane) return `Bloor ${lane[2] === 'eb' ? 'eastbound' : 'westbound'} ${lane[1] === 'car' ? 'lane' : 'cycle track'}${at ? ` at ${at}` : ''}`;
  const shop = result?.places?.shops?.find((item) => item.door_node === id);
  if (shop) return `${shop.name} door`;
  return nice(id);
}
const TRAVEL_VERB = { walk: 'Walked', bike: 'Cycled', car: 'Drove', transit: 'Rode Line 2' };
const CHOICE_LABEL = { bike_bloor: 'bike on Bloor', bike_side_street: 'bike via a side street', shop_elsewhere: 'shop elsewhere', defer: 'defer the trip' };
const choiceLabel = (action) => CHOICE_LABEL[action] || nice(action);

function eventTextV2(event, result = current.run) {
  switch (event.action) {
    case 'choose_trip': return `Chose ${choiceLabel(event.chosen)} for the ${nice(event.purpose || event.trip_id)} trip · ${event.provider === 'fixture_rule' || !event.provider ? 'fixture rule' : `agent · ${event.provider}`}`;
    case 'change_destination': return `Changed destination: ${placeName(event.from, result)} → ${placeName(event.to, result)}`;
    case 'travel': {
      const minutes = Number.isFinite(event.arrive_t - event.depart_t) ? ` · ${((event.arrive_t - event.depart_t) / 60).toFixed(1)} min` : '';
      const shared = event.shared_with_cars_m > 0 ? ` · ${Math.round(event.shared_with_cars_m)} m shared with cars` : '';
      const exits = event.exits_to ? ` · exits to ${event.exits_to}` : '';
      return `${TRAVEL_VERB[event.mode] || nice(event.mode)} ${nodeName(event.from_node, result)} → ${nodeName(event.to_node, result)}${minutes}${shared}${exits}`;
    }
    case 'pay_fare': return `Paid ${cad(event.amount_cad)} TTC fare (${event.fare_product === 'fair_pass' ? 'Fair Pass' : nice(event.fare_product || 'adult')})`;
    case 'pay_travel_cost': return `Paid ${cad(event.amount_cad)} travel cost${event.recipient ? ` · ${nice(event.recipient)}` : ''}`;
    case 'enter_business': return `Entered ${event.name || placeName(event.business_id, result)}`;
    case 'purchase': return `Bought ${cad(event.amount_cad)} at ${placeName(event.recipient, result)}`;
    case 'spend_elsewhere': return `Spent ${cad(event.amount_cad)} outside the section`;
    case 'defer_trip': return `Deferred the ${nice(event.trip_id || 'planned')} trip`;
    case 'set_shop_hours': return `${event.name || placeName(event.business_id, result)} set next-period hours: closes ${typeof event.closes_at === 'string' ? event.closes_at : hhmm(event.closes_at)}${event.reduced ? ' (reduced)' : ''}`;
    case 'trip_completed': return `Trip completed · ${nice(event.mode)}${Number.isFinite(event.total_minutes) ? ` · ${event.total_minutes} min door to door` : ''}`;
    case 'policy_change': return 'The policy took effect';
    default: return nice(event.action);
  }
}

// changedSummary() from the adapter when present; otherwise the same rows from result.changed_decisions.
function changedRows(result) {
  if (typeof worldAdapter?.changedSummary === 'function') {
    try { const rows = worldAdapter.changedSummary(result); if (Array.isArray(rows)) return rows; } catch (error) { console.warn(error); }
  }
  const people = new Map(result.personas.map((person) => [person.id, person]));
  return result.changed_decisions.map((change) => {
    const moved = change.baseline.destination !== change.intervention.destination;
    const side = (value) => `${value.action}${moved && value.destination ? ` (${placeName(value.destination, result)})` : ''}`;
    return {
      key: change.key, actor: change.actor, name: people.get(change.actor)?.name || change.actor, role: people.get(change.actor)?.role || 'resident',
      tick: change.tick, trip_id: change.trip_id, from: side(change.baseline), to: side(change.intervention),
      baseline_event_id: change.baseline_event_id, intervention_event_id: change.intervention_event_id,
    };
  });
}
// Adapter rows may carry 'bike_bloor' or 'bike_bloor (Shop name)'; label the leading action only.
const sideText = (value) => {
  const text = String(typeof value === 'string' ? value : value?.action || '');
  const match = /^(\S+) (via|to) (.+)$/.exec(text);
  if (match) return `${choiceLabel(match[1])} ${match[2]} ${match[2] === 'to' ? placeName(match[3]) : nice(match[3])}`;
  const [action, ...rest] = text.split(' ');
  return [choiceLabel(action), ...rest].join(' ');
};

function renderRunLedger() {
  const result = current.run;
  $('#runLedger').hidden = !result;
  if (!result) return;
  const rows = changedRows(result);
  const by = experimentAdapter.deciders(result);
  const served = mapped.servedBy.get(result);
  $('#runLedgerSeed').textContent = `ONE EVENT LOG · RUN v${result.version} · SEED ${result.seed} · SYNTHETIC`;
  $('#runLedgerHost').textContent = !served ? '' : served.remote
    ? `SERVED BY ${String(served.host || 'BACKEND').toUpperCase()}${served.region ? ` · ${String(served.region).toUpperCase()}` : ''}${Number.isFinite(served.elapsed_ms) ? ` · ${served.elapsed_ms} MS` : ''}${served.cached ? ' · CACHED' : ''}`
    : `RUN IN THIS BROWSER · ${served.elapsed_ms} MS`;
  $('#runLedgerScope').textContent = `${result.population.count} synthetic people · ${rows.length} changed choice${rows.length === 1 ? '' : 's'} from period ${result.scenario.policy_start}. Choose one to follow both worlds on the map; each row below is a committed event. Choices come from ${by.label}, not observed Toronto behaviour.`;
  if (!rows.some((row) => row.key === mapped.activeKey)) mapped.activeKey = rows[0]?.key ?? null;
  $('#runLedgerChoices').replaceChildren(...rows.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'experiment-choice';
    button.setAttribute('aria-pressed', String(row.key === mapped.activeKey));
    const label = document.createElement('strong'); label.textContent = `${row.name || row.actor} · ${nice(row.trip_id)} · P${row.tick}`;
    const route = document.createElement('span'); route.textContent = `${sideText(row.from)} → ${sideText(row.to)}`;
    button.append(label, route);
    button.addEventListener('click', () => { mapped.activeKey = row.key; renderRunLedger(); followDecision(row); });
    return button;
  }));
  renderRunPath(result, rows.find((row) => row.key === mapped.activeKey), by);
  renderRerunControls(result);
  renderClef(current.runKey);
}

function renderRunPath(result, row, by) {
  const path = $('#runLedgerPath');
  path.replaceChildren();
  if (!row) {
    const empty = document.createElement('p'); empty.className = 'experiment-path-caveat';
    empty.textContent = 'No choice differs between the two worlds in this run, so the map, ledger and charts show the same events in both. That follows from these synthetic assumptions; it is not a measured null effect.';
    path.append(empty); return;
  }
  const person = result.personas.find((item) => item.id === row.actor);
  const provider = result.runs.intervention.decisions.find((item) => item.key === row.key)?.provider || 'fixture_rule';
  const heading = document.createElement('div'); heading.className = 'experiment-path-heading';
  const title = document.createElement('strong'); title.textContent = `${person?.name || row.actor} (${nice(person?.role || row.role || 'resident')}) · ${nice(row.trip_id)} trip · period ${row.tick}`;
  const note = document.createElement('span'); note.textContent = `${provider === 'fixture_rule' ? 'FIXTURE RULE' : `AGENT · ${String(provider).toUpperCase()}`} / EACH EVENT SEEKS THE MAP`;
  heading.append(title, note); path.append(heading);
  const columns = document.createElement('div'); columns.className = 'experiment-path-columns';
  for (const [arm, startId, label] of [['baseline', row.baseline_event_id, 'BASELINE'], ['intervention', row.intervention_event_id, ARM_LABEL[current.runKey] || 'WITH POLICY']]) {
    const column = document.createElement('div'); column.className = 'experiment-path-column';
    const armLabel = document.createElement('span'); armLabel.textContent = label; column.append(armLabel);
    for (const event of eventDescendants(result.runs[arm].events, startId)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'experiment-event';
      button.dataset.event = `${arm}|${event.id}`;
      button.setAttribute('aria-pressed', String(mapped.activeEvent === button.dataset.event));
      const index = document.createElement('small'); index.textContent = `${String(event.id).split(':').at(-1)} · ${hhmm(event.t)}`;
      const description = document.createElement('span'); description.textContent = eventTextV2(event, result);
      button.title = `Show this ${label.toLowerCase()} event on the map`;
      button.append(index, description);
      button.addEventListener('click', () => followEvent(arm, event.id));
      column.append(button);
    }
    columns.append(column);
  }
  path.append(columns);
  const caveat = document.createElement('p'); caveat.className = 'experiment-path-caveat';
  caveat.textContent = `The policy starts in period ${result.scenario.policy_start}. ${by.agent ? `Choices come from persona agents (${by.label})${by.agent < by.total ? '; the rest used the fixture rule' : ''}.` : 'Preferences, budgets, baskets and response weights are explicit synthetic assumptions.'} Every move passed the mapped world's rule checks. These are sampled choices, not observed Toronto behaviour.`;
  path.append(caveat);
}

// ---------- Demo view: title bar, "people who changed" strip and the short report, all from the same RunResult ----------
const SHORT_CHOICE = { bike_bloor: 'bike on Bloor', bike_side_street: 'side street', transit: 'TTC', walk: 'walk', drive: 'drive', car: 'drive', bike: 'bike', shop_elsewhere: 'shops elsewhere', defer: 'stays home' };
const NOT_ESTIMABLE_PLAIN = { injuries: 'Injuries', business_closures: 'Business closures', removal_construction_cost_cad: 'Construction cost', emissions_kg: 'Emissions', gdp_cad: 'GDP', citywide_ttc_revenue_cad: 'Citywide TTC revenue', driver_time_beyond_section: 'Driver time beyond the section' };
const NOT_ESTIMABLE_ORDER = Object.keys(NOT_ESTIMABLE_PLAIN);
const leadAction = (side) => String(typeof side === 'string' ? side : side?.action || '').split(' ')[0];
function changeText(row) {
  const from = leadAction(row.from), to = leadAction(row.to);
  if (from === 'bike_bloor' && to === 'bike_side_street') return 'Bloor → side street';
  if (from === to) return `${nice(row.trip_id)} trip changes route`;
  return `${SHORT_CHOICE[from] || nice(from)} → ${SHORT_CHOICE[to] || nice(to)}`;
}
// One row per person: their earliest changed choice (changedRows is ordered by period, then person).
function peopleWhoChanged(result) {
  const first = new Map();
  for (const row of changedRows(result)) if (!first.has(row.actor)) first.set(row.actor, row);
  return [...first.values()];
}

function renderPeopleStrip(result) {
  $('#peopleStrip').hidden = !result;
  if (!result) return;
  const people = peopleWhoChanged(result);
  const shown = people.slice(0, 8);
  if (!people.some((row) => row.actor === mapped.stripActor)) mapped.stripActor = null;
  $('#peopleStripChoices').replaceChildren(...shown.map((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'people-chip';
    button.dataset.viewer3dPerson = row.actor;   // viewer3d-bridge.js flies the 3D camera to this person
    button.setAttribute('aria-pressed', String(row.actor === mapped.stripActor));
    button.title = `Show ${row.name || row.actor} with the policy`;
    const name = document.createElement('strong'); name.textContent = row.name || row.actor;
    const what = document.createElement('span'); what.textContent = changeText(row);
    button.append(name, what);
    button.addEventListener('click', () => focusChangedPerson(row));
    return button;
  }));
  $('#peopleStripNote').textContent = !people.length
    ? 'Nobody changed a choice in this run, so both worlds show the same events.'
    : `${people.length} of ${result.population.count} people changed a choice${people.length > shown.length ? ` · first ${shown.length} shown` : ''} · pick one to follow`;
}

// A person picked in the strip: switch to "With policy" through its button (so the 3D view follows), then follow them.
function focusChangedPerson(row) {
  mapped.stripActor = row.actor;
  $$('#peopleStripChoices .people-chip').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.viewer3dPerson === row.actor)));
  if (!$('#policyView').classList.contains('selected')) $('#policyView').click();
  mapped.activeKey = row.key;
  renderRunLedger();
  followDecision(row);
}

// A focal shop whose synthetic staffing rule cuts its hours only in the policy world, read from set_shop_hours events.
function shopHoursStory(result) {
  const hours = (arm) => result.runs[arm].events.filter((event) => event.action === 'set_shop_hours');
  const baseline = new Map(hours('baseline').map((event) => [`${event.business_id}|${event.tick}`, event]));
  const event = hours('intervention').find((item) => item.reduced && !baseline.get(`${item.business_id}|${item.tick}`)?.reduced);
  if (!event) return '';
  const before = baseline.get(`${event.business_id}|${event.tick}`);
  const name = event.name || placeName(event.business_id, result);
  const takings = Number.isFinite(event.receipts_cad) && Number.isFinite(event.receipt_floor_cad) ? ` takes ${cad(event.receipts_cad)}, under its ${cad(event.receipt_floor_cad)} staffing line, so it` : '';
  const close = typeof event.closes_at === 'string' ? event.closes_at : hhmm(event.closes_at);
  const usual = before && before.closes_at !== event.closes_at ? ` instead of ${typeof before.closes_at === 'string' ? before.closes_at : hhmm(before.closes_at)}` : '';
  const when = event.tick < result.scenario.ticks ? `from period ${event.tick + 1}` : 'after the last period';
  return `${name}${takings} closes at ${close}${usual} ${when}. Synthetic staffing rule, not a closure forecast.`;
}

function notEstimableItems(result) {
  if (!result && current.id === 'custom') return [{ id: 'everything', label: 'Every outcome', reason: 'No mapped lever matched this question, so nothing was simulated.' }];
  // The earlier prepared replays (no mapped world) carry no not_estimable list; show the same boundary.
  if (!result) return NOT_ESTIMABLE_ORDER.filter((id) => current.id === 'bike' || id !== 'removal_construction_cost_cad').map((id) => ({ id, label: NOT_ESTIMABLE_PLAIN[id], reason: '' }));
  return (result.not_estimable || [])
    .filter((item) => item.id !== 'removal_construction_cost_cad' || trackChanged(result))   // a street-layout cost; irrelevant to a fare change
    .map((item) => ({ id: item.id, label: NOT_ESTIMABLE_PLAIN[item.id] || nice(item.id).replace(/^./, (c) => c.toUpperCase()), reason: item.reason || '' }))
    .sort((a, b) => (NOT_ESTIMABLE_ORDER.indexOf(a.id) + 1 || 99) - (NOT_ESTIMABLE_ORDER.indexOf(b.id) + 1 || 99));
}

function renderDemo(result) {
  const custom = current.id === 'custom';
  const served = result && mapped.servedBy.get(result);
  $('#labKicker').textContent = custom ? 'SPECULATIVE · NOT SIMULATED' : 'BLOOR ST W · BATHURST → SPADINA';
  $('#labCredit').hidden = custom;
  $('#labQuestion').textContent = current.title;
  $('#labStatus').textContent = custom
    ? 'Speculative · no mapped lever matched · nothing was simulated'
    : result ? `${result.population.count} synthetic people · same seed · real Bloor St W map` : 'Prepared replay · synthetic people · not a forecast';
  $('#labHost').hidden = !served;
  $('#labHost').textContent = !served ? '' : served.remote ? `RUN ON ${hostLabel(served).toUpperCase()}${served.cached ? ' · CACHED' : ''}` : 'RUN IN THIS BROWSER';
  $('#labCompiler').hidden = !current.compilerBadge;
  $('#labCompiler').textContent = current.compilerBadge || '';
  renderPeopleStrip(result);

  $('#reportEyebrow').textContent = custom ? 'THE REPORT · NOTHING WAS SIMULATED' : 'THE REPORT · ONE EVENT LOG';
  $('#reportTitleLead').textContent = custom ? 'Nothing' : 'What';
  $('#reportTitleEm').textContent = custom ? 'to sum yet.' : 'changed.';
  $('#reportChartsLabel').textContent = custom ? 'FIVE SECTORS · NO SERIES ATTACHED' : `FIVE CHARTS · ${result?.scenario?.ticks || 4} MODELLED PERIODS`;
  $('#reportQuestion').textContent = current.title;
  $('#reportHeadlineLabel').textContent = current.headline.label;
  const headline = String(current.headline.value).replace(/(\$\d+)\.00\b/g, '$1');
  $('#reportHeadlineValue').textContent = headline;
  $('#reportHeadlineValue').classList.toggle('is-long', headline.length > 9);
  $('#reportHeadlineDirection').textContent = current.headline.direction;
  $('#reportMini').replaceChildren(...current.mini.slice(0, 3).map((metric) => {
    const card = document.createElement('div'); card.className = 'report-mini-card';
    const label = document.createElement('span'); label.textContent = metric.label;
    // Whole-dollar amounts read better at this size ("$260 / $316"); the charts keep the cents.
    const value = document.createElement('strong'); value.textContent = String(metric.value).replace(/(\$\d+)\.00\b/g, '$1'); value.className = custom && metric.tone === 'positive' ? 'neutral' : metric.tone || 'neutral';   // a placeholder is not good news
    card.append(label, value); return card;
  }));
  const story = result ? shopHoursStory(result) : '';
  $('#reportStory').hidden = !story;
  $('#reportStory').textContent = story;
  $('#reportNotEstimable').replaceChildren(...notEstimableItems(result).map((item) => {
    const li = document.createElement('li');
    li.textContent = item.label;
    if (item.reason) li.title = item.reason;
    return li;
  }));
  $('#reportProvenance').textContent = custom
    ? 'Nothing was simulated for this question · no numbers to sum · not a forecast'
    : result ? `Every number is summed from recorded events in this run (v${result.version}, seed ${result.seed}) · synthetic people, real map · not a forecast`
      : 'Every number comes from a prepared synthetic replay · not a forecast';
}

function revealMap() {
  const rect = $('#simulationViewport').getBoundingClientRect();
  if (rect.bottom < 90 || rect.top > window.innerHeight - 90) $('#simulationViewport').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'nearest' });
}

function followEvent(arm, eventId, { play = false } = {}) {
  if (!bloorMainMap.run || !eventId) return;
  setCityMode(arm === 'baseline' ? 'baseline' : 'policy');
  const hit = bloorMainMap.seekToEvent(arm, eventId);
  mapped.activeEvent = `${arm}|${eventId}`;
  $$('#runLedgerPath [data-event]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.event === mapped.activeEvent)));
  const name = current.run.personas.find((person) => person.id === bloorMainMap.focusId)?.name;
  $('#runLedgerSeek').textContent = hit
    ? `MAP AT P${hit.tick} · ${hit.clock} · ${arm === 'baseline' ? 'BASELINE' : 'WITH POLICY'}${name ? ` · FOLLOWING ${name.toUpperCase()}` : ''}`
    : 'THIS EVENT HAS NO TIME ON THE MAP';
  showPersonaCard(bloorMainMap.focusId);
  if (play && !reducedMotion) bloorMainMap.play();
  revealMap();
}

function followDecision(row) {
  const arm = bloorMainMap.arm;
  followEvent(arm, arm === 'baseline' ? row.baseline_event_id : row.intervention_event_id, { play: true });
}

// A small synthetic persona card on the map for a clicked person.
function showPersonaCard(personaId) {
  const card = $('#mapPersonaCard');
  const result = current.run;
  const person = personaId && result?.personas.find((item) => item.id === personaId);
  card.hidden = !person;
  if (!person) return;
  const rows = changedRows(result).filter((row) => row.actor === personaId);
  const name = document.createElement('strong'); name.textContent = person.name || person.id;
  const home = person.home?.kind === 'mapped' ? `home on ${person.home.street || 'a mapped side street'}` : `visitor · ${person.home?.label || 'lives off the map'}`;
  const facts = document.createElement('span');
  facts.textContent = `${nice(person.role)} · ${home} · ${person.fare_category === 'fair_pass' ? 'Fair Pass' : 'adult fare'} · synthetic persona`;
  card.replaceChildren(name, facts);
  if (rows.length) {
    const link = document.createElement('button'); link.type = 'button'; link.className = 'map-persona-link';
    link.textContent = `${rows.length} changed choice${rows.length === 1 ? '' : 's'} ${demoView() ? 'below' : 'in the ledger'} ↓`;
    link.addEventListener('click', () => $(demoView() ? '#peopleStrip' : '#runLedger').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: demoView() ? 'nearest' : 'start' }));
    card.append(link);
  } else {
    const same = document.createElement('small'); same.textContent = 'Same choices in both worlds this run.'; card.append(same);
  }
}

// ---------- Versioned rerun: change one sensitivity assumption, rerun from the same seed ----------
const sensitivityOf = (result) => (result.assumptions || []).filter((item) => item.kind === 'sensitivity');
function levelsOf(assumption) {
  if (typeof assumption.value === 'boolean') return [{ label: 'On', value: true }, { label: 'Off', value: false }];
  const levels = [];
  for (const [label, value] of [['Low', assumption.low], ['Base', assumption.value], ['High', assumption.high]]) {
    if (value !== undefined && !levels.some((level) => level.value === value)) levels.push({ label: `${label} · ${value}`, value });
  }
  return levels;
}

function renderRerunControls(result) {
  const list = sensitivityOf(result);
  $('#runRerun').hidden = !list.length;
  if (!list.length) return;
  const key = current.runKey;
  const pending = mapped.pending[key] ||= { id: list[0].id, value: undefined };
  if (!list.some((item) => item.id === pending.id)) Object.assign(pending, { id: list[0].id, value: undefined });
  $('#rerunAssumption').replaceChildren(...list.map((item) => new Option(assumptionLabel(item.id), item.id, false, item.id === pending.id)));
  const assumption = list.find((item) => item.id === pending.id);
  const now = result.assumption_values?.[assumption.id] ?? assumption.value;
  if (pending.value === undefined) pending.value = now;
  $('#rerunLevels').replaceChildren(...levelsOf(assumption).map((level) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = level.label;
    button.setAttribute('aria-pressed', String(level.value === pending.value));
    if (level.value === now) button.dataset.current = 'true';
    button.addEventListener('click', () => { pending.value = level.value; renderRerunControls(result); });
    return button;
  }));
  $('#rerunNote').textContent = `${assumption.note || ''} In v${result.version}: ${formatValue(now)}${assumption.unit && assumption.unit !== 'on/off' ? ` (${assumption.unit})` : ''}. A synthetic sensitivity, not a measured Toronto value.`;
  const button = $('#rerunButton');
  button.disabled = Boolean(mapped.rerunning) || pending.value === now;
  button.textContent = `Rerun as v${result.version + 1} ↻`;
  const overrides = Object.entries(result.assumption_overrides || {});
  $('#rerunStatus').textContent = mapped.rerunStatus[key] || `RUN v${result.version} · ${overrides.length ? overrides.map(([id, value]) => `${assumptionLabel(id)} = ${formatValue(value)}`).join(' · ') : 'ALL ASSUMPTIONS AT BASE'} · ${result.changed_decisions.length} CHANGED CHOICES`;
  $('#sweepButton').hidden = !mapped.backend || key === 'compiled';
}

async function rerunMapped() {
  const previous = current.run;
  if (!previous || mapped.rerunning) return;
  const key = current.runKey;
  const pending = mapped.pending[key];
  const assumption = sensitivityOf(previous).find((item) => item.id === pending?.id);
  if (!assumption) return;
  const overrides = { ...(previous.assumption_overrides || {}) };
  if (pending.value === assumption.value) delete overrides[assumption.id]; else overrides[assumption.id] = pending.value;
  const version = previous.version + 1;
  const token = investigationToken;
  mapped.rerunning = true;
  $('#rerunButton').disabled = true;
  $('#rerunStatus').textContent = `RUNNING v${version} · ${assumptionLabel(assumption.id)} = ${formatValue(pending.value)}…`;
  try {
    const result = await executeMapped(key, mapped.specs[key], { overrides, version });
    if (token !== investigationToken || current.run !== previous) return;   // the reader moved on
    const delta = result.changed_decisions.length - previous.changed_decisions.length;
    mapped.runs[key] = result;
    mapped.rerunStatus[key] = `RUN v${version} · ${assumptionLabel(assumption.id)} = ${formatValue(pending.value)} · ${result.changed_decisions.length} CHANGED CHOICES (${delta >= 0 ? '+' : '−'}${Math.abs(delta)} VS v${previous.version})`;
    pending.value = undefined;
    current = mappedScenarioFor(result, current.template);
    publishRun(result);
    renderLab({ rerun: true });
  } catch (error) {
    console.error(error);
    mapped.rerunStatus[key] = `RERUN FAILED · ${String(error.message || error).toUpperCase()}`;
  } finally {
    mapped.rerunning = false;
    if (current.run) renderRerunControls(current.run);
  }
}

function sweepCell(value) {
  if (Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object') {
    if ('intervention' in value || 'baseline' in value) return `${value.intervention ?? value.policy ?? '—'} / ${value.baseline ?? '—'}`;
    return Object.entries(value).slice(0, 3).map(([name, item]) => `${nice(name)} ${typeof item === 'object' ? JSON.stringify(item) : item}`).join(' · ');
  }
  return value == null ? '—' : String(value);
}

async function sweepOnVultr() {
  const result = current.run, key = current.runKey;
  const assumption = result && sensitivityOf(result).find((item) => item.id === mapped.pending[key]?.id);
  if (!assumption || !mapped.backend || key === 'compiled') return;
  const box = $('#sweepResult');
  box.hidden = false;
  box.textContent = `SWEEPING ${assumptionLabel(assumption.id).toUpperCase()} ON THE HOSTED BACKEND…`;
  const started = performance.now();
  try {
    const out = await api('/api/sweep', { scenario: key, assumption_id: assumption.id, values: levelsOf(assumption).map((level) => level.value) }, 60000);
    if (current.run !== result) return;
    const rows = Array.isArray(out?.rows) ? out.rows : [];
    const host = out?.served_by?.host || mapped.backend.host, region = out?.served_by?.region || mapped.backend.region;
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = `${assumptionLabel(assumption.id)} sweep · served by ${host}${region ? ` · ${region}` : ''} · ${Math.round(performance.now() - started)} ms round trip · synthetic sensitivity, not a forecast`;
    const head = document.createElement('tr');
    for (const label of ['Value', `P${result.scenario.ticks} headline (policy / baseline)`, 'Run', 'ms']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th); }
    const thead = document.createElement('thead'); thead.append(head);
    const tbody = document.createElement('tbody');
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const cell of [formatValue(row.value), sweepCell(row.p4), row.run_id || '—', Number.isFinite(row.elapsed_ms) ? String(row.elapsed_ms) : '—']) { const td = document.createElement('td'); td.textContent = cell; tr.append(td); }
      tbody.append(tr);
    }
    table.append(caption, thead, tbody);
    box.replaceChildren(table);
  } catch (error) {
    box.textContent = `SWEEP FAILED · ${String(error.message || error).toUpperCase()}`;
  }
}

// ---------- Vultr Clef second opinion: shown only when a saved comparison exists ----------
function clefSummary(data) {
  if (!data || typeof data !== 'object') return null;
  const source = { ...(data.summary || {}), ...data };
  const overall = Number(source.agreement?.overall);
  if (!Number.isFinite(overall)) return null;
  const n = [source.agreement?.n, source.agreement?.choices, source.agreement?.total, source.calls].map(Number).find(Number.isFinite);
  const median = Number(source.median_latency_ms);
  return { model: source.model || 'clef', pct: Math.round(overall <= 1 ? overall * 100 : overall), n, median: Number.isFinite(median) ? Math.round(median) : null };
}
function loadClef(key) {
  if (key === 'compiled') return Promise.resolve(null);
  mapped.clef[key] ||= (async () => {
    const backend = await backendReady;
    const paths = [...(backend ? [`/api/clef/${key}`] : []), `../experiment/vultr-runs/clef-world-${key}.json`];
    for (const path of paths) {
      try { const summary = clefSummary(await api(path, null, 4000)); if (summary) return summary; } catch { /* not saved */ }
    }
    return null;
  })();
  return mapped.clef[key];
}
async function renderClef(key) {
  const card = $('#clefCard');
  const summary = await loadClef(key);
  if (current.runKey !== key) return;
  card.hidden = !summary;
  if (!summary) return;
  const label = document.createElement('span'); label.textContent = 'VULTR CLEF SECOND OPINION';
  const value = document.createElement('strong'); value.textContent = `Agrees with ${summary.pct}%${Number.isFinite(summary.n) ? ` of ${summary.n} choices` : ''}`;
  const meta = document.createElement('small'); meta.textContent = `${summary.median != null ? `median ${summary.median} ms · ` : ''}${summary.model} · not used for the run`;
  card.replaceChildren(label, value, meta);
}

// ---------- Event replay timeline ----------
function syncReplayButton(running) {
  if (mapped.replayRunning === running) return;
  mapped.replayRunning = running;
  $('#eventReplayPlay').textContent = running ? 'Ⅱ' : '▶';
  $('#eventReplayPlay').setAttribute('aria-label', running ? 'Pause event replay' : 'Play event replay');
  $('#eventReplayPlay').setAttribute('aria-pressed', String(running));
}
function renderReplayPeriods() {
  const run = bloorMainMap.run;
  const start = current.run?.scenario?.policy_start;
  $('#timelinePeriods').replaceChildren(...(run?.timeline.ticks || []).map((tick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tick = String(tick);
    button.textContent = tick === start ? `P${tick} · POLICY` : `P${tick}`;
    button.setAttribute('aria-label', `Jump the replay to period ${tick}${tick === start ? ', when the policy starts' : ''}`);
    button.addEventListener('click', () => bloorMainMap.seekTo(tick, 0));
    return button;
  }));
}
bloorMainMap.onFrame((state) => {
  if (!replayActive()) return;
  const label = `EVENT REPLAY · P${state.tick ?? '–'} · ${state.clock} · ${state.arm === 'baseline' ? 'BASELINE' : 'WITH POLICY'}`;
  if (label !== mapped.lastLabel) {
    mapped.lastLabel = label;
    $('#timelineLabel').textContent = label;
    $('#timeScrubber').setAttribute('aria-valuetext', label);
    $$('#timelinePeriods button').forEach((button) => button.classList.toggle('current', Number(button.dataset.tick) === state.tick));
  }
  $('#timeScrubber').value = String(Math.round(state.progress * 1000));
  syncReplayButton(state.running);
});
function startReplay() {
  if (replayActive() && !reducedMotion) bloorMainMap.play();
  syncReplayButton(bloorMainMap.running);
}

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
  $('#runLedger').hidden = true;
  bloorMainMap.pause();
  $('#impact').hidden = true;
  $('#personaLab').hidden = true;
  agents.chatToken++;
  agents.chatPoll = null;
  showPoll(null);
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
// The mapped engine runs a real paired experiment, so its overlay describes that work.
const mappedSteps = [
  ['Framing the question.', 'Turning the policy into a sandbox lever, or marking it speculative.'],
  ['Loading the people.', 'Placing the same synthetic residents and visitors on the mapped Bathurst–Spadina section.'],
  ['Reviewing the evidence.', 'Separating observed Toronto inputs from synthetic assumptions.'],
  ['Running both worlds.', 'Baseline and policy from one seed; every move passes the world’s rule checks.'],
];
// Demo view: the same four steps, shorter and plainer, on a faster clock.
const demoSteps = [
  ['Reading the question.', 'Turning it into one change on the map.'],
  ['Placing the people.', 'Synthetic residents and visitors on the real Bloor St W map.'],
  ['Running the city twice.', 'Same people, same seed: once without the policy, once with it.'],
  ['Adding it up.', 'Every number is summed from the recorded events.'],
];
const DEMO_STEP_LABELS = ['Read', 'Place people', 'Run twice', 'Add up'];
let researchStepLabels = null;
// A short name for where a run executed, e.g. "Vultr · YTO" for the deployed engine.
function hostLabel(served) {
  if (!served) return '';
  if (!served.remote) return 'this browser';
  const host = String(served.host || 'backend');
  return /vultr/i.test(host) ? `Vultr${served.region ? ` · ${String(served.region).toUpperCase()}` : ''}` : host === 'local' ? 'the local engine' : host;
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ---------- Persona agents: one showcase of 100 agents rating a policy 1–5, and illustrative map motion ----------
const SCALE = [1, 2, 3, 4, 5];
const STANCES = ['strongly oppose', 'oppose', 'neutral', 'support', 'strongly support'];
const RATING_COLORS = ['#ff7a5c', '#ffb29d', '#6f8c8f', '#a8f4d1', '#5fe0a8'];
const ratingOf = (answer) => (Number.isInteger(answer.choice) ? answer.choice : (STANCES.indexOf(answer.stance) + 1)) || null;
const LABEL = 'Survey-style reaction from 100 persona agents, not a forecast.';
const POLICY_POLLS = {
  fare: { kind: 'PREPARED POLICY · TTC FARE', question: 'The adult TTC fare rises by $0.50 per ride (to $3.80); Fair Pass stays at $2.10. How do you feel about this change?' },
  bike: { kind: 'PREPARED POLICY · BLOOR BIKE LANES', question: 'The protected bike lanes on Bloor St W between Bathurst St and Spadina Ave are removed and the space returned to cars. How do you feel about this change?' },
};

// Illustrative map motion, tunable here (and documented in README.md): a fixed, role-aware map from each agent's
// 1–5 rating to a cue that bloor-map.js animates. Baseline view: the agent's usual mode (base). Policy view:
// MOTION_MAP[policy][mode][rating - 1]; modes not listed keep their base cue. 'car_or_walk' = drive with a car, else
// walk; 'half_walk' = walk for half the agents (stable hash of id and seed 42), else transit. No model calls, no trips
// simulated, and the ledger and charts stay on the prepared replay.
const MOTION_MAP = {
  base: { cyclist: 'bike', driver: 'drive', transit_rider: 'transit', pedestrian: 'walk' },
  fare: { transit_rider: ['car_or_walk', 'half_walk', 'transit', 'transit', 'transit'] },   // Fair Pass riders keep transit
  bike: { cyclist: ['detour', 'detour', 'bike', 'bike', 'bike'] },                          // drivers keep driving Bloor
};
function motionFor(policy, agent, rating) {
  const base = MOTION_MAP.base[agent.mode] || 'walk';
  let cue = (policy === 'fare' && agent.fare_category === 'fair_pass') ? base : MOTION_MAP[policy][agent.mode]?.[rating - 1] || base;
  if (cue === 'car_or_walk') cue = agent.has_car ? 'drive' : 'walk';
  if (cue === 'half_walk') cue = [...agent.id].reduce((sum, c) => sum + c.charCodeAt(0), 42) % 2 ? 'walk' : 'transit';
  return { base, policy: cue };
}

const newPoll = (kind, question, view) => ({ kind, question, view, rows: [], status: '', summary: '', asked: 100 });
const words = (text) => String(text || 'agent').replaceAll('_', ' ');

// A compact card: name, role and rating colour; the reason opens on click and shows on hover.
function pollCard({ id, answer, agent }) {
  const rating = ratingOf(answer);
  const card = document.createElement('details'); card.className = 'agent-card'; card.dataset.role = agent.role || 'agent';
  card.style.setProperty('--rating', RATING_COLORS[rating - 1] || '#6f8c8f');
  const check = answer.consistency === 'check';
  if (check) card.classList.add('agent-card--check');
  card.title = `${check ? 'Flagged: the reason may not match the rating. ' : ''}${answer.reason || ''}`;
  const summary = document.createElement('summary');
  const name = document.createElement('strong'); name.textContent = agent.name || id;
  const role = document.createElement('span'); role.textContent = words(agent.role);
  const score = document.createElement('b'); score.textContent = rating || '–'; score.setAttribute('aria-label', rating ? `rated ${rating}, ${STANCES[rating - 1]}` : 'no rating');
  summary.append(name, role, score);
  const reason = document.createElement('p'); reason.textContent = answer.reason || '';
  card.append(summary, reason);
  card.hidden = Boolean(agents.roleFilter && agents.roleFilter !== card.dataset.role);
  return card;
}

// The 1–5 bar, the mean and N, the by-role and by-fare means, and the role filter, from the rows so far.
function renderPollStats(poll) {
  const counts = SCALE.map((n) => poll.rows.filter((row) => ratingOf(row.answer) === n).length);
  $('#agentPollSplit').hidden = !poll.rows.length;
  $('#agentPollSplit').setAttribute('aria-label', `Ratings: ${SCALE.map((n, i) => `${n} ${STANCES[i]} ${counts[i]}`).join(', ')}`);
  $('#agentPollSplit').replaceChildren(...SCALE.filter((n, i) => counts[i]).map((n) => {
    const part = document.createElement('span');
    part.style.flex = String(counts[n - 1]);
    part.style.background = RATING_COLORS[n - 1];
    part.textContent = `${n} ${STANCES[n - 1].toUpperCase()} · ${counts[n - 1]}`;
    return part;
  }));
  const flagged = poll.rows.filter((row) => row.answer.consistency === 'check').length;
  const mean = (rows) => { const r = rows.map((row) => ratingOf(row.answer)).filter(Boolean); return r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : '–'; };
  const by = (key) => {
    const groups = {};
    for (const row of poll.rows) (groups[key(row.agent)] ||= []).push(row);
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([name, rows]) => `${words(name)} ${mean(rows)} (${rows.length})`).join(' · ');
  };
  $('#agentPollStats').textContent = !poll.rows.length ? '' : [
    `${poll.rows.length} OF ${poll.asked} ANSWERED · MEAN ${mean(poll.rows)} / 5${flagged ? ` · ${flagged} FLAGGED (?) WHERE THE REASON MAY NOT MATCH THE RATING` : ''}`,
    `BY ROLE · ${by((agent) => agent.role)}`,
    `BY FARE · ${by((agent) => agent.fare_category === 'fair_pass' ? 'Fair Pass' : 'adult fare')}`,
  ].join('\n');
  const roles = {};
  for (const { agent } of poll.rows) roles[agent.role] = (roles[agent.role] || 0) + 1;
  $('#agentPollFilter').replaceChildren(...[['', poll.rows.length], ...Object.entries(roles).sort((a, b) => b[1] - a[1])].map(([role, n]) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${role ? words(role) : 'all'} ${n}`;
    button.setAttribute('aria-pressed', String((agents.roleFilter || '') === role));
    button.addEventListener('click', () => { agents.roleFilter = role; showPoll(poll); });
    return button;
  }));
}

// The showcase panel shows one poll: the current prepared policy's, or the composer's drafted policy.
function showPoll(poll) {
  if (agents.shown !== poll) agents.roleFilter = '';
  agents.shown = poll;
  $('#agentPoll').hidden = !poll;
  if (!poll) return;
  $('#agentPollCards').replaceChildren(...poll.rows.map(pollCard));
  renderPollStats(poll);
  updatePoll(poll, {});
}

function updatePoll(poll, patch) {
  Object.assign(poll, patch);
  if (agents.shown !== poll) return;
  $('#agentPollKind').textContent = poll.kind;
  $('#agentPollQuestion').textContent = poll.question;
  $('#agentPollStatus').textContent = poll.status;
  $('#agentPollSummary').textContent = poll.summary;
}

function addPollRow(poll, id, answer, agent) {
  if (!answer) return;
  const row = { id, answer, agent: agent || agents.roster.get(id) || { id } };
  poll.rows.push(row);
  poll.onRow?.(row);
  if (agents.shown === poll) { $('#agentPollCards').append(pollCard(row)); renderPollStats(poll); }
}

// Streams one 1–5 poll of all 100 agents into a poll object (askAgents for prepared policies, chat for drafts).
function pollHandlers(poll, fresh = () => true) {
  const update = (patch) => { if (fresh()) updatePoll(poll, patch); };
  const fail = (error) => { poll.failed = true; update({ status: `AGENT POLL FAILED · ${error.message}`.toUpperCase() }); };
  return {
    onStart: (start) => { poll.asked = start.ids.length; },
    onAnswer: (event) => { if (!fresh()) return; addPollRow(poll, event.id, event.answer, event.agent); update({ status: `LIVE · ${poll.rows.length} OF ${poll.asked} AGENTS ANSWERED` }); },
    onStatus: (status) => update(status.stage === 'planning' ? { status: `DRAFTING THE POLICY · ${status.message.toUpperCase()}` } : { summary: 'Summarising…' }),
    onDone: (done) => update({ status: `${done.aggregate?.answered ?? poll.rows.length} OF ${done.aggregate?.asked ?? poll.asked} AGENTS ANSWERED` }),
    onSummary: (summary) => update({ summary: `${summary.summary} (${summary.numbers_verified ? 'numbers checked' : 'numbers not verified'})` }),
    // At the plan limit the server replays the newest saved poll; use it only if it asked this exact question.
    onReplay: (saved) => {
      if (saved.record.question !== poll.question) { fail({ message: 'agent backend at its limit; no saved poll for this policy' }); return; }
      Object.entries(saved.record.answers || {}).forEach(([id, answer]) => addPollRow(poll, id, answer));
      update({ status: saved.label.toUpperCase() });
    },
    onError: fail,
    fail,
  };
}

// Prepared fare and Bloor views: all 100 agents rate the policy 1–5; the ratings drive the map's illustrative motion.
function startPolicyPoll(view) {
  const prior = agents.polls[view];
  if ((prior && !prior.failed) || !agents.online) return;
  const spec = POLICY_POLLS[view];
  const poll = agents.polls[view] = newPoll(spec.kind, spec.question, view);
  poll.actors = [];
  poll.onRow = (row) => {
    const rating = ratingOf(row.answer);
    if (!rating) return;
    poll.actors.push({ ...row.agent, rating, reason: row.answer.reason, ...motionFor(view, row.agent, rating) });
    if (current.id === view) showActors();
  };
  if (current.id === view) showPoll(poll);
  updatePoll(poll, { status: 'ASKING ALL 100 AGENTS' });
  const handlers = pollHandlers(poll);
  agents.client.askAgents(spec.question, { options: SCALE, orchestrate: false, ...handlers })
    .catch((error) => { if (!poll.failed && !poll.rows.length) handlers.fail(error); });
}

// The composer drafts one concrete policy from the typed idea (Opus), then all 100 agents rate it 1–5.
async function draftPolicy(idea) {
  if (!(await agentsReady)) return;
  const token = ++agents.chatToken;
  const fresh = () => token === agents.chatToken;
  const poll = agents.chatPoll = newPoll(`DRAFTED POLICY · FROM “${idea}”`, 'Drafting one concrete policy from your idea…', 'custom');
  showPoll(poll);
  updatePoll(poll, { status: 'DRAFTING THE POLICY…' });
  const handlers = pollHandlers(poll, fresh);
  try {
    await agents.client.chat(idea, {
      modes: ['poll'], options: SCALE, ...handlers,
      onPlan: (plan) => { if (fresh()) updatePoll(poll, { question: plan.policy || plan.question, status: 'ASKING ALL 100 AGENTS' }); },
      onReply: (reply) => { if (fresh()) updatePoll(poll, { summary: reply.text }); },
    });
  } catch (error) { if (fresh() && !poll.failed && !poll.rows.length) handlers.fail(error); }
}

function showActors() {
  const poll = agents.polls[current.id];
  const actors = poll?.actors || [];
  bloorMainMap.setActors(actors);
  bloorBikeMap.setActors(agents.polls.bike?.actors || []);
  $('#mapMotionNote').hidden = !actors.length || bloorMainMap.canvas.hidden;
  if (!actors.length) $('#mapActorCard').hidden = true;
  else $('#mapMotionCount').textContent = `${actors.length} of ${poll.asked || 100} agents rated · mean ${(actors.reduce((sum, a) => sum + a.rating, 0) / actors.length).toFixed(1)} / 5.`;
  syncRatingsNote();
}

// With an event-driven run on the map, the rating dots are an opt-in overlay; the run's actors stay primary.
function syncRatingsNote() {
  const hasRun = Boolean(bloorMainMap.run);
  const expanded = !hasRun || mapped.ratingsOn;
  bloorMainMap.setRatingsOverlay(hasRun && mapped.ratingsOn);
  $('#mapMotionNote').classList.toggle('is-collapsed', !expanded);
  $('#mapMotionTitle').textContent = expanded
    ? "Illustrative motion mapped from agents' 1–5 ratings, not simulated trip decisions."
    : 'Live agent 1–5 ratings (survey-style, not trip decisions).';
  $('#ratingsToggle').hidden = !hasRun;
  $('#ratingsToggle').setAttribute('aria-pressed', String(Boolean(mapped.ratingsOn)));
  if (!expanded) $('#mapActorCard').hidden = true;
}

function showPickedActor(actor) {
  $('#mapActorCard').hidden = !actor;
  if (actor) $('#mapActorCard').textContent = `${actor.name} · ${words(actor.role)} · rated ${actor.rating}/5 · shown as ${bloorMainMap.mode === 'baseline' ? actor.base : actor.policy}: “${actor.reason}”`;
}
bloorMainMap.onPick = showPickedActor;

async function runScenario(scenario, promptOverride = null) {
  const token = ++investigationToken;
  await agentsReady;
  if (token !== investigationToken) return;
  await Promise.all([worldReady, backendReady]);
  if (token !== investigationToken) return;
  const useMapped = mappedMode();
  if (!useMapped) {
    current = await legacyScenario(scenario, promptOverride);
    if (token !== investigationToken) return;
  }
  if (scenario !== 'custom') startPolicyPoll(scenario);   // the composer drafts a policy for the agents via draftPolicy
  const agentNote = !agents.online ? 'no live model call'
    : scenario === 'custom' ? 'drafting a policy, then asking all 100 persona agents for a 1–5 rating' : 'asking all 100 persona agents for a 1–5 rating';
  const demo = demoView();
  const where = mapped.backend ? `on ${demo ? hostLabel({ ...mapped.backend, remote: true }) : mapped.backend.host}` : 'in this browser';
  $('#investigationNote').textContent = !useMapped
    ? (!agents.online ? 'Prepared demo replay · no live model call'
      : scenario === 'custom' ? 'Drafting a policy, then asking all 100 persona agents for a 1–5 rating' : 'Asking all 100 persona agents for a 1–5 rating')
    : demo
      ? `${scenario === 'custom' ? `Compiling ${mapped.backend ? where : 'with offline rules'}` : `Running ${where}`}${agents.online ? ' · 100 persona agents are rating it' : ''}`
      : scenario === 'custom'
        ? `Compiling the hypothesis ${mapped.backend ? `on ${mapped.backend.host}` : 'with offline rules in this browser'} · ${agentNote}`
        : `Mapped paired run ${where} · ${agentNote}`;
  const stepItems = $$('#investigationSteps li');
  researchStepLabels ||= stepItems.map((li) => li.textContent);
  stepItems.forEach((li, n) => { li.textContent = demo && useMapped ? DEMO_STEP_LABELS[n] : researchStepLabels[n]; });
  document.body.dataset.scenario = useMapped ? scenario : current.id;
  scene.setScenario(useMapped ? scenario : current.id);
  const overlay = $('#investigation');
  overlay.hidden = false;
  setPhase('investigating');
  const copy = useMapped ? (demo ? demoSteps : mappedSteps) : steps;
  const stepMs = reducedMotion ? 100 : demo ? 350 : 670;
  let work = null;
  for (let i = 0; i < copy.length; i++) {
    if (token !== investigationToken) return;
    $('#investigationCount').textContent = `${String(i + 1).padStart(2, '0')} / 04`;
    $('#investigationTitle').textContent = copy[i][0];
    $('#investigationDescription').textContent = copy[i][1];
    $('#investigationProgress').style.width = `${(i + 1) * 25}%`;
    $$('#investigationSteps li').forEach((li, n) => li.classList.toggle('complete', n <= i));
    await wait(stepMs);
    // Start the run after the overlay has painted; the in-browser paired run blocks the main thread briefly.
    if (useMapped && i === 0) { work = mappedWork(scenario, promptOverride); work.catch(() => {}); }
  }
  if (token !== investigationToken) return;
  if (work) {
    try { current = await work; }
    catch (error) {
      console.error('Mapped run failed; using the earlier engine for this scenario.', error);
      mapped.failed = true;
      current = await legacyScenario(scenario, promptOverride);
    }
    if (token !== investigationToken) return;
    if (current.run) publishRun(current.run);
    if (current.id === 'fare') ensureFareInspector();
    document.body.dataset.scenario = current.id;
  }
  overlay.hidden = true;
  renderLab();
  $('#lab').hidden = false;
  $('#impact').hidden = false;
  $('#personaLab').hidden = false;
  setPhase('lab');
  requestAnimationFrame(() => {
    // The demo view always lands on the 3D lab; the 100-agent panel is the last beat, further down.
    $(demoView() || $('#agentPoll').hidden ? '#lab' : '#agentPoll').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    startReplay();
  });
}

// The earlier engines: the TTC demo-ui trace and the experiment.v1 Bloor fixture. Used only without the mapped world.
async function legacyScenario(scenario, promptOverride) {
  if (scenario === 'fare') {
    if (!fareTrace) fareTrace = window.CFSim.buildTrace({ seed: 42, version: 1 });
    current = traceAdapter.toFareScenario(fareTrace, preparedScenarios.fare);
    useFareTrace(fareTrace);
    ensureFareInspector();
    return current;
  }
  if (scenario === 'bike') {
    if (!bikeExperiment) bikeExperiment = await experimentRunner.runExperiment(experimentFixtures.bike);
    window.CounterfactualCurrentExperiment = bikeExperiment;
    return experimentAdapter.toBikeScenario(bikeExperiment, preparedScenarios.bike);
  }
  return exploratoryScenario(promptOverride || '');
}

// Prepared selectors run the canonical mapped RunResult; any other prompt is compiled, then run or kept speculative.
async function mappedWork(scenario, prompt) {
  if (scenario === 'fare' || scenario === 'bike') return mappedScenarioFor(await preparedRun(scenario), preparedScenarios[scenario]);
  const text = prompt || '';
  if (!scenarioCompiler) return exploratoryScenario(text);
  const { compiled, spec } = await compilePrompt(text);
  const badge = compilerBadge(compiled);
  let reason = spec?.reason || compiled?.unsupported_reason || null;
  if (scenarioCompiler.isRunnableSpec(spec)) {
    try {
      const result = await executeMapped('compiled', spec);
      mapped.specs.compiled = spec;
      mapped.runs.compiled = result;
      delete mapped.rerunStatus.compiled;
      delete mapped.pending.compiled;
      return { ...mappedScenarioFor(result, compiledTemplate(text, compiled)), compilerBadge: badge };
    } catch (error) {
      console.warn('Compiled spec did not run on the mapped world.', error);
      reason = `The compiled change could not run on the mapped world (${error.message}).`;
    }
  }
  reason ||= 'No mapped Bathurst–Spadina sandbox lever directly represents this hypothesis.';
  const speculative = exploratoryScenario(text);
  speculative.compilerBadge = badge;
  speculative.summary = `${reason} The compiler kept this question on the speculative path, so no agent decisions or policy effects were computed. Every outcome is not estimable.`;
  speculative.narrative = 'The hypothesis compiler found no mapped sandbox lever for this question, so nothing was simulated on the Bathurst–Spadina world. A defensible result needs a modelled mechanism, evidence and its own run.';
  for (const sector of Object.values(speculative.sectors)) sector.evidence = `Compiler (${badge.toLowerCase()}): ${reason}`;
  speculative.evidence = { ...speculative.evidence, text: `${speculative.evidence.text} Compiler result (${badge.toLowerCase()}): ${reason}` };
  return speculative;
}

// Fallback copy is captured from the markup, so the earlier-engine mode reads exactly as before.
const fallbackCopy = new Map();
function setCopy(selector, mappedText, useMapped) {
  const element = $(selector);
  if (!element) return;
  if (!fallbackCopy.has(selector)) fallbackCopy.set(selector, element.textContent);
  element.textContent = useMapped ? mappedText : fallbackCopy.get(selector);
}

// Put the current RunResult on the one shared map. A fresh scenario starts at the period the policy begins.
function attachRun(rerun) {
  const result = current.run;
  if (bloorMainMap.run?.result !== result) {
    bloorMainMap.setRun(result, { keepProgress: rerun });
    if (!rerun) bloorMainMap.seekTo(result.scenario.policy_start, 0);
  }
  bloorMainMap.setScenario(current.mapScenario || 'fare');
}

function mappedRailNote(result, by) {
  const changed = result.changed_decisions.length;
  const base = `${result.population.count} ${by.who} · seed ${result.seed} · v${result.version} · ${changed} changed choice${changed === 1 ? '' : 's'}. The map, charts and decision ledger read one event log.`;
  if (current.id === 'fare') return `${base} The TTC inspector further down is the earlier rule-based prototype district with its own trace.`;
  if (current.id === 'bike') return `${base} The street section and branches below the ledger are schematic illustrations, not run output.`;
  return `${base} Your question was compiled to a sandbox lever (${(current.compilerBadge || 'offline rules').toLowerCase()}); responses stay assumption-driven.`;
}

function renderLab(options = {}) {
  const rerun = Boolean(options.rerun);
  const result = current.run || null;
  bloorMainMap.canvas.hidden = current.id === 'custom' || !bloorMainMap.world;
  $('#simulationViewport').classList.toggle('has-mapped-world', !bloorMainMap.canvas.hidden);
  // A speculative question has no run, so the 3D view (which still holds the previous run) steps aside.
  $('#simulationViewport').classList.toggle('is-speculative', current.id === 'custom');
  $('#mapAttribution').hidden = bloorMainMap.canvas.hidden;
  if (result) attachRun(rerun);
  else { if (bloorMainMap.run) bloorMainMap.setRun(null); bloorMainMap.setScenario(current.id); }
  const replay = replayActive();
  bloorBikeMap.setScenario('bike');
  const chatPoll = agents.chatPoll && (current.id === 'custom' || current.id === 'compiled') ? agents.chatPoll : null;
  showPoll(agents.polls[current.id] || chatPoll);
  showActors();
  $('#bikeLab').hidden = current.id !== 'bike';
  // Mapped mode keeps the bike lab's schematic street comparison and optional branches; the shared
  // ledger and the main map replace its experiment.v1 ledger and its second map.
  $('#bikeExperimentLedger').hidden = Boolean(result);
  $('#bikeWorldPanel').hidden = Boolean(result);
  setCopy('#bikeLabDeck', 'A protected cycle track connects a person to more than a route. The live map above replays the recorded run and the shared ledger lists every changed choice. This section compares the street layout schematically and offers branches that are not in the run.', Boolean(result));
  setCopy('#bikeWorldHead', 'Street section', Boolean(result));
  setCopy('#bikeWorldTag', 'SCHEMATIC · NOT RUN OUTPUT', Boolean(result));
  setCopy('#bikeTraceDeck', 'These selectable branches show additional mechanisms that are not choices in the seeded run. The recorded decisions and their event paths are in the shared ledger under the city.', Boolean(result));
  setCopy('#bikePipelineNote', 'The recorded run, its decision ledger and the five charts sit above. Its choices and shop responses are synthetic assumptions, not a Bloor removal forecast.', Boolean(result));
  if (current.id === 'bike') {
    bikeScene.resize();
    bikeScene.setPhase('lab');
    bikeScene.setMotion(!bloorBikeMap.world);
    renderBikeExperiment(current.experiment);
  } else bikeScene.setMotion(false);
  $('#bikeLabButton').hidden = current.id !== 'bike';
  // Steven's collapse toggle is for the earlier prepared replay; the mapped run's ledger and charts stay open.
  $('#replayToggle').hidden = current.id === 'custom' || !agents.online || Boolean(result);
  $('#ttcWorkbench').hidden = current.id !== 'fare';
  $('#ttcInspectorButton').hidden = current.id !== 'fare';
  setCopy('#ttcWorkbenchKicker', '01 / EARLIER PROTOTYPE · RULE-BASED DISTRICT', Boolean(result));
  setCopy('#ttcWorkbenchDeck', 'This is the earlier rule-based TTC prototype in its own synthetic district, kept for its persona inspector, evidence and rerun controls. Its reruns update only the status bar below; the mapped Bloor run above drives the city, the decision ledger and every chart.', Boolean(result));
  setCopy('#ttcInspectorTitle', 'Open the earlier TTC prototype', Boolean(result));
  setCopy('#ttcInspectorHint', 'Rule-based district with its own trace', Boolean(result));
  $('#scenarioBreadcrumb').textContent = current.breadcrumb;
  const run = result || current.experiment || current.trace;
  const by = (result || current.experiment) && experimentAdapter.deciders(result || current.experiment);
  const served = result && mapped.servedBy.get(result);
  $('#runStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW' : result ? 'MAPPED PAIRED RUN (SYNTHETIC)' : 'PREPARED REPLAY (SYNTHETIC)';
  $('#sampleStatus').textContent = current.id === 'custom' ? 'NO MODEL RESULT'
    : result ? `SEED ${result.seed} · v${result.version}${served?.remote ? ` · ${/vultr/i.test(String(served.host)) ? 'VULTR' : 'HOSTED'}` : ''}` : `SYNTHETIC v${run.version}`;
  $('#studyTitle').textContent = current.title;
  $('#studySummary').textContent = current.id === 'custom' || result ? current.summary : `Prepared simulation replay (synthetic, separate from the 100 agents): ${current.summary}`;
  $('#compilerBadge').hidden = !current.compilerBadge;
  $('#compilerBadge').textContent = current.compilerBadge || '';
  $('#viewportArea').textContent = current.viewport;
  $('#worldCaption').textContent = result && !bloorMainMap.canvas.hidden ? current.worldCaption : !bloorMainMap.canvas.hidden ? 'Mapped Bathurst–Spadina context · synthetic policy trace' : current.worldCaption;
  $('#focusLabelA').textContent = current.focus[0];
  $('#focusLabelB').textContent = current.focus[1];
  $('#headlineEyebrow').textContent = current.headline.label;
  $('#headlineValue').textContent = current.headline.value;
  $('#headlineDirection').textContent = current.headline.direction;
  $('#insightNarrative').textContent = current.narrative;
  $('#sourceRibbon').textContent = current.sourceRibbon;
  $('#impactScenarioTag').textContent = current.mapTag;
  $('#overviewStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW / NO MODEL SERIES' : result ? `SCENARIO OUTPUTS / MAPPED RUN v${run.version}` : `PREPARED SIMULATION REPLAY (SYNTHETIC, SEPARATE FROM THE 100 AGENTS) v${run.version}`;
  const custom = current.id === 'custom';
  $('#chainLabel').textContent = custom ? 'WHAT A CONNECTED ENGINE WOULD DO' : 'WATCH THE CHAIN';
  $('#impactButtonHint').textContent = custom ? 'Inspect missing evidence' : 'See the connected effects';
  $('#railNoteText').textContent = custom
    ? (current.compilerBadge ? 'The compiler found no mapped lever for this question, so no simulated policy effects were computed. The 100 agents rate the drafted policy above; inspect a sector to see what is missing.' : 'No simulated policy effects have been computed for this question. The 100 agents rate the drafted policy above; inspect a sector to see what is missing.')
    : result ? mappedRailNote(result, by)
    : `The map shows observed Bathurst–Spadina context; its dots follow the 100 agents' 1–5 ratings when they are online. The charts and ${current.id === 'fare' ? 'TTC inspector' : 'decision ledger'} are a prepared simulation replay (synthetic, separate from the 100 agents).`;
  $('#impactHeadingLine').textContent = custom ? 'One question.' : 'One decision.';
  $('#impactHeadingEm').textContent = custom ? 'Open outcomes.' : 'Many futures.';
  $('#impactDescription').textContent = custom ? 'Each sector shows the evidence and model work still needed before a policy effect can be estimated.' : result ? 'Each chart reduces the same committed events the map replays and the decision ledger lists.' : current.trace ? 'Each chart reads the same versioned event trace as the TTC city inspector.' : current.id === 'fare' ? 'Each fare chart reduces the same committed events of one paired run.' : 'Each Bloor chart reduces the same committed events shown in the decision ledger.';
  $('#boardCaption').textContent = custom ? 'NO RUN RESULT ATTACHED' : result ? `MAPPED PAIRED RUN v${run.version} · SYNTHETIC · NOT A FORECAST` : `PREPARED REPLAY (SYNTHETIC) v${run.version} · NOT A FORECAST`;
  $('#boardAction').textContent = custom ? '✳ INSPECT AN OPEN QUESTION' : '✳ TRACE A CONNECTION';
  $('#overviewTitle').textContent = custom ? 'What remains to measure.' : 'Every signal in view.';
  $('#overviewDescription').textContent = custom ? 'These sectors have no modelled series. Choose one to see its missing inputs and evidence.' : result ? 'Five event-derived views of one paired run on the mapped section. Change an assumption in the decision ledger and the map, ledger and every chart update together.' : current.trace ? 'Five linked views of one seeded run. Change an assumption in the TTC inspector and every chart updates.' : `Five event-derived views of one paired ${current.id === 'fare' ? 'TTC fare' : 'Bloor'} sample. Choose a chart to inspect its assumption boundary.`;
  $('#viewToggle').hidden = custom;
  $('#motionButton').hidden = !bloorMainMap.canvas.hidden;
  // With a mapped run the timeline is the event replay scrubber; otherwise it scrubs the schematic city (old behaviour).
  $('.timeline-bar').hidden = !bloorMainMap.canvas.hidden && !replay;
  $('.timeline-bar').classList.toggle('is-replay', replay);
  $('#timelineKicker').textContent = replay ? 'ONE EVENT LOG · BOTH WORLDS' : 'ILLUSTRATIVE CITY REPLAY';
  $('#eventReplayPlay').hidden = !replay;
  $('#timelinePeriods').hidden = !replay;
  $('#timelineFrames').hidden = replay;
  $('#timeScrubber').max = replay ? '1000' : '100';
  $('#timeScrubber').setAttribute('aria-label', replay ? 'Event replay position. Scrub through the recorded travel events of both worlds.' : 'Scrub schematic city animation; recorded decisions appear in the experiment ledger below');
  if (!replay) $('#timeScrubber').removeAttribute('aria-valuetext');
  $('#viewportLegend').hidden = custom;
  $('#cityStateNote').hidden = !custom;
  // The schematic hotspots would point at arbitrary pixels on the mapped street.
  $('#focusMarkerA').hidden = custom || replay;
  $('#focusMarkerB').hidden = custom || replay;
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
  if (!rerun) activeSector = 'mobility';
  renderSector();
  renderOverview();
  scene.setSector(null);
  // The demo view opens a fresh run on Baseline, so the presenter can switch to "With policy" on stage.
  if (!rerun) setCityMode(demoView() ? 'baseline' : 'policy');
  if (current.id === 'bike' && !rerun) setBikeRole('cyclist');
  const moving = scene.setMotion(true);
  $('#motionButton').textContent = moving ? 'Ⅱ' : '▶';
  $('#motionButton').setAttribute('aria-label', moving ? 'Pause city animation' : 'Play city animation');
  if (replay) {
    renderReplayPeriods();
    mapped.lastLabel = '';
    mapped.replayRunning = null;
    bloorMainMap.requestDraw();
  } else {
    $('#timeScrubber').value = 70;
    updateTimeline();
  }
  if (!rerun) {
    mapped.activeEvent = null;
    $('#runLedgerSeek').textContent = '';
    $('#mapPersonaCard').hidden = true;
    $('#sweepResult').hidden = true;
    $('#impact').classList.remove('is-detail-open');
    mapped.stripActor = null;
  }
  renderRunLedger();
  renderDemo(result);
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
    : current.trace
      ? `Seeded model values, weeks 1–${base.length}. Baseline: ${base.join(', ')}. Proposal: ${policy.join(', ')}. Unit: ${data.unit}. Displayed change compares the average after the policy starts: ${data.delta}. Not a Toronto forecast.`
      : current.run
        ? `Paired event totals from the shared event log, modelled weekdays 1–${base.length}. Baseline: ${base.map((v) => v ?? '—').join(', ')}. Proposal: ${policy.map((v) => v ?? '—').join(', ')}. Unit: ${data.unit}. Displayed value compares period ${base.length}: ${data.delta}. Synthetic run v${current.run.version}, not a Toronto forecast.`
        : `Paired event totals, periods 1–${base.length}. Baseline: ${base.join(', ')}. Proposal: ${policy.join(', ')}. Unit: ${data.unit}. Displayed value compares period 4: ${data.delta}. Not a Toronto forecast.`;
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
    // The sector's plain-language finding (e.g. "No driver-time gain."); shown in the demo view only.
    const finding = document.createElement('span'); finding.className = 'overview-card-finding'; finding.textContent = data.title || '';
    const delta = document.createElement('em'); delta.textContent = data.delta;
    card.append(top, title, finding, delta);
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
      $('#impact').classList.add('is-detail-open');   // the demo view opens the detail under the charts
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
  bloorMainMap.setMode(mode);
  bloorBikeMap.setMode(mode);
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
  // The compiler's prepared-prompt list also routes to the prepared mapped runs.
  const compiledMatch = !match && scenarioCompiler?.PREPARED_PROMPTS
    ? Object.entries(scenarioCompiler.PREPARED_PROMPTS).find(([id, prompts]) => preparedScenarios[id] && prompts.some((phrase) => scenarioCompiler.normalizeText(phrase) === scenarioCompiler.normalizeText(query)))
    : null;
  const chosen = match ? match[0] : compiledMatch ? compiledMatch[0] : 'custom';
  runScenario(chosen, query);
  if (chosen === 'custom') draftPolicy(query);
});
$('#hypothesisInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#hypothesisForm').requestSubmit(); } });
$$('[data-scenario-choice]').forEach(button => button.addEventListener('click', () => {
  const chosen = button.dataset.scenarioChoice;
  $('#hypothesisInput').value = preparedScenarios[chosen].prompt;
  runScenario(chosen);
}));
$('#replayToggle').addEventListener('click', () => setReplayOpen(document.body.classList.contains('replay-collapsed')));
// Buttons that lead into the replay open it first (registered before their own scroll handlers).
$$('#impactMapButton, #bikeLabButton, #ttcInspectorButton').forEach((button) => button.addEventListener('click', () => setReplayOpen(true)));
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
$('#backToCity').addEventListener('click', () => { setPhase('lab'); scene.setSector(null); $('#impact').classList.remove('is-detail-open'); $('#lab').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }); });
$('#reportEvidence').addEventListener('click', openEvidence);
$$('.sector-node').forEach(node => {
  node.addEventListener('click', () => chooseSector(node.dataset.sector));
  node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseSector(node.dataset.sector); } });
});
$('#baselineView').addEventListener('click', () => setCityMode('baseline'));
$('#policyView').addEventListener('click', () => setCityMode('policy'));
$('#motionButton').addEventListener('click', () => { const running = scene.toggleMotion(); $('#motionButton').textContent = running ? 'Ⅱ' : '▶'; $('#motionButton').setAttribute('aria-label', running ? 'Pause city animation' : 'Play city animation'); });
$('#timeScrubber').addEventListener('input', () => {
  if (!replayActive()) { updateTimeline(true); return; }
  bloorMainMap.pause();
  bloorMainMap.setProgress(Number($('#timeScrubber').value) / Number($('#timeScrubber').max || 1000));
});
$('#eventReplayPlay').addEventListener('click', () => syncReplayButton(bloorMainMap.toggle()));
setInterval(() => {
  if ($('#lab').hidden || !scene.running || replayActive()) return;
  const value = Math.floor(scene.time % 100);
  $('#timeScrubber').value = value;
  updateTimelineLabel(value);
}, 250);
$('#inspectEvidence').addEventListener('click', openEvidence);
$('#focusMarkerA').addEventListener('click', () => { activeSector = 'mobility'; renderSector(); $('#impactMapButton').click(); });
$('#focusMarkerB').addEventListener('click', () => { activeSector = 'commerce'; renderSector(); $('#impactMapButton').click(); });
window.addEventListener('scroll', updateReveal, { passive: true });
window.addEventListener('resize', updateReveal, { passive: true });
// Clicking a person on the mapped city selects their first changed decision and shows a synthetic persona card.
$('#bloorMapMain').addEventListener('bloormap:select', (event) => {
  if (!current.run) return;
  const personaId = event.detail?.personaId || null;
  showPersonaCard(personaId);
  const row = personaId && changedRows(current.run).find((item) => item.actor === personaId);
  if (row && row.key !== mapped.activeKey) { mapped.activeKey = row.key; renderRunLedger(); }
});
$('#rerunAssumption').addEventListener('change', () => {
  if (!current.run) return;
  mapped.pending[current.runKey] = { id: $('#rerunAssumption').value, value: undefined };
  renderRerunControls(current.run);
});
$('#rerunButton').addEventListener('click', rerunMapped);
$('#sweepButton').addEventListener('click', sweepOnVultr);
$('#ratingsToggle').addEventListener('click', () => { mapped.ratingsOn = !mapped.ratingsOn; syncRatingsNote(); });
window.addEventListener('message', event => {
  const inspector = $('#ttcInspector');
  if (event.origin !== window.location.origin || event.source !== inspector.contentWindow || event.data?.type !== 'counterfactual:result') return;
  useFareTrace(event.data.trace);
});
updateReveal();
const linkedDemo = new URLSearchParams(window.location.search).get('demo');
if (linkedDemo && preparedScenarios[linkedDemo]) runScenario(linkedDemo);

// Preview helpers for in-app QA; no production data is exposed.
window.counterfactualPreview = { runScenario, scene, goToComposer, openEvidence, map: bloorMainMap, rerun: rerunMapped, current: () => current };
