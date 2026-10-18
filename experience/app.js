const { preparedScenarios, exploratoryScenario } = window.CounterfactualScenarios;
const CityScene = window.CityScene;
const experimentAdapter = window.CounterfactualExperimentAdapter;
// One mapped Bathurst–Spadina world for both prepared policies and compiled prompts.
const worldRunner = window.CounterfactualWorldExperiment;
const worldFixtures = window.CounterfactualWorldFixtures;
const worldAdapter = window.CounterfactualWorldRunAdapter;
const scenarioCompiler = window.CounterfactualScenarioCompiler;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const scene = new CityScene($('#cityCanvas'));
const bloorMainMap = new window.BloorMapView($('#bloorMapMain'));

// Mapped-run state. `runs` keeps the latest version per prepared scenario; `active` is what the lab shows.
const mapped = {
  world: null, runs: {}, specs: {}, activeKey: null, activeEvent: null,
  rerunStatus: {}, pending: {}, servedBy: new WeakMap(), clef: {},
};
const worldReady = fetch('../data/world/bloor_spadina_bathurst.json')
  .then((response) => { if (!response.ok) throw new Error(`Map HTTP ${response.status}`); return response.json(); })
  .then((world) => {
    if (!bloorMainMap.setWorld(world)) return null;
    bloorMainMap.setScenario(current.id);
    mapped.world = world;
    return world;
  })
  .catch((error) => { console.warn('Mapped world unavailable; questions take the speculative path.', error); return null; });
// The canonical engine needs the world JSON and every mapped-run module; otherwise nothing is simulated.
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
let landed = false;
let investigationToken = 0;

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
  return agents.online;
})();

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
// The 2D map replays only while it shows a mapped RunResult.
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
function mappedScenarioFor(result, template) {
  const key = runKeyOf(result);
  if (key !== 'compiled') return { ...worldAdapter.toMappedScenario(result, template), id: key, runKey: key, mapScenario: key, template, evidence: template.mappedEvidence || template.evidence };
  let scenario = null;
  try { scenario = worldAdapter.toMappedScenario(result, template); } catch { scenario = null; }
  // The adapter maps only the prepared dashboards; a compiled run borrows the closest one.
  if (!scenario) scenario = worldAdapter.toMappedScenario({ ...result, scenario_id: dashboardKind(result) }, template);
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
  const note = document.createElement('small');
  note.textContent = rows.length ? `${rows.length} changed choice${rows.length === 1 ? '' : 's'} with the policy.` : 'Same choices in both worlds this run.';
  card.append(note);
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

// The 2D map replays the run when it is the visible view (no WebGL); the 3D view has its own clock.
function startReplay() {
  if (replayActive() && !reducedMotion) bloorMainMap.play();
}

function setPhase(value) {
  phase = value;
  document.body.dataset.phase = value;
  scene.setPhase(value === 'investigating' ? 'composer' : value);
}

function updateReveal() {
  const section = $('#intro');
  const travel = Math.max(1, section.offsetHeight - window.innerHeight);
  const progress = landed ? 1 : Math.max(0, Math.min(1, window.scrollY / travel));
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

// The first run ends the landing: the intro shrinks to the composer alone, so scrolling back up offers another
// question instead of replaying the Earth-to-Bloor flight. Only a page reload shows the landing again.
function endLanding() {
  if (landed) return;
  const section = $('#intro'), before = section.offsetHeight;
  landed = true;
  document.body.classList.add('is-landed');
  window.scrollTo({ top: Math.max(0, window.scrollY - (before - section.offsetHeight)), behavior: 'instant' });
  updateReveal();
}

function resetToIntro() {
  investigationToken++;
  $('#investigation').hidden = true;
  $('#lab').hidden = true;
  $('#runLedger').hidden = true;
  bloorMainMap.pause();
  agents.chatToken++;
  agents.chatPoll = null;
  showPoll(null);
  scene.setScenario('fare');
  setPhase(landed ? 'composer' : 'intro');
}

// The overlay's four steps while the paired run computes.
const demoSteps = [
  ['Reading the question.', 'Turning it into one change on the map.'],
  ['Placing the people.', 'Synthetic residents and visitors on the real Bloor St W map.'],
  ['Running the city twice.', 'Same people, same seed: once without the policy, once with it.'],
  ['Adding it up.', 'Every number is summed from the recorded events.'],
];
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
const POLICY_POLLS = {
  fare: { kind: 'PREPARED POLICY · TTC FARE', question: 'The adult TTC fare rises by $0.50 per ride (to $3.80); Fair Pass stays at $2.10. How do you feel about this change?' },
  bike: { kind: 'PREPARED POLICY · BLOOR BIKE LANES', question: 'The protected bike lanes on Bloor St W between Bathurst St and Spadina Ave are removed and the space returned to cars. How do you feel about this change?' },
};

const newPoll = (kind, question, view) => ({ kind, question, view, rows: [], status: '', summary: '', asked: 100 });
const words = (text) => String(text || 'agent').replaceAll('_', ' ');

// A fixed-size tile: name, role, rating colour and the reason (clamped; the full text on hover or focus).
function pollCard({ id, answer, agent }) {
  const rating = ratingOf(answer);
  const card = document.createElement('article'); card.className = 'agent-card'; card.dataset.role = agent.role || 'agent'; card.tabIndex = 0;
  card.style.setProperty('--rating', RATING_COLORS[rating - 1] || '#6f8c8f');
  const check = answer.consistency === 'check';
  if (check) card.classList.add('agent-card--check');
  card.title = `${check ? 'Flagged: the reason may not match the rating. ' : ''}${answer.reason || ''}`;
  const head = document.createElement('div'); head.className = 'agent-card-head';
  const name = document.createElement('strong'); name.textContent = agent.name || id;
  const role = document.createElement('span'); role.textContent = words(agent.role);
  const score = document.createElement('b'); score.textContent = rating || '–'; score.setAttribute('aria-label', rating ? `rated ${rating}, ${STANCES[rating - 1]}` : 'no rating');
  head.append(name, role, score);
  const reason = document.createElement('p'); reason.textContent = answer.reason || '';
  card.append(head, reason);
  card.hidden = Boolean(agents.roleFilter && agents.roleFilter !== card.dataset.role);
  return card;
}

// The 1–5 bar and the role filter, from the rows so far.
function renderPollStats(poll) {
  const counts = SCALE.map((n) => poll.rows.filter((row) => ratingOf(row.answer) === n).length);
  $('#agentPollSplit').setAttribute('aria-label', `Ratings: ${SCALE.map((n, i) => `${n} ${STANCES[i]} ${counts[i]}`).join(', ')}`);
  $('#agentPollSplit').replaceChildren(...SCALE.filter((n, i) => counts[i]).map((n) => {
    const part = document.createElement('span');
    part.style.flex = String(counts[n - 1]);
    part.style.background = RATING_COLORS[n - 1];
    part.textContent = `${n} ${STANCES[n - 1].toUpperCase()} · ${counts[n - 1]}`;
    return part;
  }));
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
  $('#agentPollCards').scrollLeft = 0;
  renderPollStats(poll);
  updatePoll(poll, {});
}

function updatePoll(poll, patch) {
  Object.assign(poll, patch);
  if (agents.shown !== poll) return;
  $('#agentPollKind').textContent = poll.kind;
  $('#agentPollQuestion').textContent = poll.question;
  $('#agentPollStatus').textContent = poll.status;
  announcePoll(poll);
}

// two-world.js builds the not-simulated report from the shown poll.
function announcePoll(poll) { window.dispatchEvent(new CustomEvent('counterfactual:poll', { detail: poll })); }

function addPollRow(poll, id, answer, agent) {
  if (!answer) return;
  const row = { id, answer, rating: ratingOf(answer), agent: agent || agents.roster.get(id) || { id } };
  poll.rows.push(row);
  if (agents.shown === poll) {
    // New answers join the right end of the one-row strip, which follows them, so the row runs right to left.
    const cards = $('#agentPollCards'), card = pollCard(row);
    card.classList.add('is-new');
    cards.append(card);
    followStrip(cards);
    renderPollStats(poll); announcePoll(poll);
  }
}

// One frame loop glides the strip to its right end. Repeated smooth scrollTo calls restart before finishing and fall behind a fast stream.
let stripGlide = 0;
function followStrip(strip) {
  if (reducedMotion) { strip.scrollLeft = strip.scrollWidth; return; }
  if (stripGlide) return;
  const step = () => {
    const gap = strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
    if (gap < 1) { stripGlide = 0; return; }
    strip.scrollLeft += Math.max(1, gap * 0.18);
    stripGlide = requestAnimationFrame(step);
  };
  stripGlide = requestAnimationFrame(step);
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

// Prepared fare and Bloor views: all 100 agents rate the policy 1–5.
function startPolicyPoll(view) {
  const prior = agents.polls[view];
  if ((prior && !prior.failed) || !agents.online) return;
  const spec = POLICY_POLLS[view];
  const poll = agents.polls[view] = newPoll(spec.kind, spec.question, view);
  if (current.id === view) showPoll(poll);
  updatePoll(poll, { status: 'ASKING ALL 100 AGENTS' });
  const handlers = pollHandlers(poll);
  agents.client.askAgents(spec.question, { options: SCALE, orchestrate: false, ...handlers })
    .catch((error) => { if (!poll.failed && !poll.rows.length) handlers.fail(error); });
}

// The composer drafts one concrete policy from the typed idea (Opus), then all 100 agents rate it 1–5.
async function draftPolicy(idea) {
  await agentsReady;
  const token = ++agents.chatToken;
  const fresh = () => token === agents.chatToken;
  const poll = agents.chatPoll = newPoll(`DRAFTED POLICY · FROM “${idea}”`, 'Drafting one concrete policy from your idea…', 'custom');
  showPoll(poll);
  if (!agents.online || !agents.client) {
    poll.failed = true;
    updatePoll(poll, { status: 'AGENT POLL FAILED · PERSONA AGENTS ARE OFFLINE' });
    return;
  }
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

async function runScenario(scenario, promptOverride = null) {
  const token = ++investigationToken;
  await agentsReady;
  if (token !== investigationToken) return;
  await Promise.all([worldReady, backendReady]);
  if (token !== investigationToken) return;
  const useMapped = mappedMode();
  if (!useMapped) current = exploratoryScenario(promptOverride || preparedScenarios[scenario]?.prompt || '');
  if (scenario !== 'custom') startPolicyPoll(scenario);
  else draftPolicy(promptOverride || $('#hypothesisInput').value.trim());
  const where = mapped.backend ? `on ${hostLabel({ ...mapped.backend, remote: true })}` : 'in this browser';
  $('#investigationNote').textContent = useMapped
    ? `${scenario === 'custom' ? `Compiling ${mapped.backend ? where : 'with offline rules'}` : `Running ${where}`}${agents.online ? ' · 100 persona agents are rating it' : ''}`
    : 'The mapped world did not load · nothing is simulated';
  document.body.dataset.scenario = useMapped ? scenario : current.id;
  scene.setScenario(useMapped ? scenario : current.id);
  const overlay = $('#investigation');
  overlay.hidden = false;
  endLanding();
  setPhase('investigating');
  const stepMs = reducedMotion ? 100 : 350;
  let work = null;
  for (let i = 0; i < demoSteps.length; i++) {
    if (token !== investigationToken) return;
    $('#investigationCount').textContent = `${String(i + 1).padStart(2, '0')} / 04`;
    $('#investigationTitle').textContent = demoSteps[i][0];
    $('#investigationDescription').textContent = demoSteps[i][1];
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
      console.error('Mapped run failed; nothing is simulated for this question.', error);
      mapped.failed = true;
      current = exploratoryScenario(promptOverride || preparedScenarios[scenario]?.prompt || '');
    }
    if (token !== investigationToken) return;
    if (current.run) publishRun(current.run);
    document.body.dataset.scenario = current.id;
  }
  overlay.hidden = true;
  renderLab();
  $('#lab').hidden = false;
  setPhase('lab');
  requestAnimationFrame(() => {
    // When the 100 persona agents are online, their panel and its rating animation come first (it sits above the lab); then the 3D lab.
    // A question with no run has no 3D view; its report (agents included) is in the lab.
    $(current.id === 'custom' || $('#agentPoll').hidden ? '#lab' : '#agentPoll').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    startReplay();
  });
}

// Prepared selectors run the canonical mapped RunResult; any other prompt is compiled, then run or kept speculative.
async function mappedWork(scenario, prompt) {
  if (scenario === 'fare' || scenario === 'bike') return mappedScenarioFor(await preparedRun(scenario), preparedScenarios[scenario]);
  const text = prompt || '';
  if (!scenarioCompiler) return exploratoryScenario(text);
  const { compiled, spec } = await compilePrompt(text);
  if (scenarioCompiler.isRunnableSpec(spec)) {
    try {
      const result = await executeMapped('compiled', spec);
      mapped.specs.compiled = spec;
      mapped.runs.compiled = result;
      delete mapped.rerunStatus.compiled;
      delete mapped.pending.compiled;
      return mappedScenarioFor(result, compiledTemplate(text, compiled));
    } catch (error) { console.warn('Compiled spec did not run on the mapped world.', error); }
  }
  return exploratoryScenario(text);
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

function renderLab(options = {}) {
  const rerun = Boolean(options.rerun);
  const result = current.run || null;
  const showStreet = current.id === 'fare' || current.id === 'bike';
  bloorMainMap.canvas.hidden = !showStreet || !bloorMainMap.world;
  $('#simulationViewport').classList.toggle('has-mapped-world', !bloorMainMap.canvas.hidden);
  // Only the two prepared policies have a 3D street. A compiled or speculative question keeps the agents and the brief.
  $('#simulationViewport').classList.toggle('is-speculative', !showStreet);
  if (result) attachRun(rerun);
  else { if (bloorMainMap.run) bloorMainMap.setRun(null); bloorMainMap.setScenario(current.id); }
  const chatPoll = agents.chatPoll && (current.id === 'custom' || current.id === 'compiled') ? agents.chatPoll : null;
  showPoll(agents.polls[current.id] || chatPoll);
  $('#labKicker').textContent = current.id === 'custom' ? 'SPECULATIVE · NOT SIMULATED' : 'BLOOR ST W · BATHURST → SPADINA';
  $('#labQuestion').textContent = current.title;
  $('#viewToggle').hidden = current.id === 'custom';
  scene.setMotion(true);
  if (!rerun) {
    // A fresh run opens on Baseline, so the presenter can switch to "With policy" on stage.
    setCityMode('baseline');
    mapped.activeEvent = null;
    $('#runLedgerSeek').textContent = '';
    $('#mapPersonaCard').hidden = true;
    $('#sweepResult').hidden = true;
  }
  if (replayActive()) bloorMainMap.requestDraw();
  renderRunLedger();
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
  bloorMainMap.setMode(mode);
  setViewSelection(mode);
}

$('#headerExplore').addEventListener('click', () => $('[data-scenario-choice="fare"]').click());   // same as the TTC fare chip
$('.brand').addEventListener('click', resetToIntro);
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
  // A question about the TTC fare or the Bloor bike lane opens the matching prepared run (they are no longer buttons).
  const intent = !match && !compiledMatch ? preparedIntent(normalized) : null;
  const chosen = match ? match[0] : compiledMatch ? compiledMatch[0] : intent || 'custom';
  runScenario(chosen, query);
});
// Only a fare increase or a lane removal is the prepared run; a fare cut or a new lane is compiled like any other question.
function preparedIntent(text) {
  const fare = /\b(ttc|transit|subway|streetcar|bus|presto)\b/.test(text) && /\b(fare|fares|price|cost|cents?|\$|raise|increase|hike)\b|\$/.test(text)
    && !/\b(free|cut(s|ting)?|lower(s|ed|ing)?|reduc(e|es|ed|ing)|decreas(e|es|ed|ing)|drop(s|ped|ping)?|discount(s|ed)?|eliminat(e|es|ed|ing)|freez(e|es|ing)|frozen|scrap(s|ped)?)\b/.test(text);
  const bike = /\b(bike|bikes|bicycle|cycle|cycling|cyclists?)\b/.test(text) && /\b(lane|lanes|track|tracks|bloor|path)\b/.test(text)
    && !/\b(add(s|ed|ing)?|build(s|ing)?|built|install(s|ed|ing)?|new|extend(s|ed|ing)?|expand(s|ed|ing)?|widen(s|ed|ing)?|creat(e|es|ed|ing)|another|more)\b/.test(text);
  return fare && preparedScenarios.fare ? 'fare' : bike && preparedScenarios.bike ? 'bike' : null;
}
// The question bar grows with its text instead of showing a scrollbar.
function fitQuestion() { const box = $('#hypothesisInput'); box.style.height = 'auto'; box.style.height = `${box.scrollHeight}px`; }
$('#hypothesisInput').addEventListener('input', fitQuestion);
window.addEventListener('resize', fitQuestion);
fitQuestion();
$('#hypothesisInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#hypothesisForm').requestSubmit(); } });
$$('[data-scenario-choice]').forEach(button => button.addEventListener('click', () => {
  const chosen = button.dataset.scenarioChoice;
  $('#hypothesisInput').value = preparedScenarios[chosen].prompt;
  fitQuestion();
  runScenario(chosen);
}));
$('#baselineView').addEventListener('click', () => setCityMode('baseline'));
$('#policyView').addEventListener('click', () => setCityMode('policy'));
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
updateReveal();
const linkedDemo = new URLSearchParams(window.location.search).get('demo');
if (linkedDemo && preparedScenarios[linkedDemo]) runScenario(linkedDemo);

// Preview helpers for in-app QA; no production data is exposed.
window.counterfactualPreview = {
  runScenario, scene, map: bloorMainMap, rerun: rerunMapped, current: () => current,
  // Same people, seed and spec with assumption overrides, for the brief's sensitivity table. Always in this
  // browser: the API's run quota is per IP, and visitors on one network share it.
  variant: (result, overrides) => (mappedAvailable() && mapped.specs[runKeyOf(result)]
    ? worldRunner.runWorldExperiment(mapped.specs[runKeyOf(result)], { world: mapped.world, seed: result.seed, version: result.version, overrides })
    : Promise.reject(new Error('The in-browser engine is not loaded'))),
};
