const { preparedScenarios, exploratoryScenario } = window.CounterfactualScenarios;
const CityScene = window.CityScene;
const traceAdapter = window.CounterfactualTraceAdapter;
const experimentRunner = window.CounterfactualExperiment;
const experimentFixtures = window.CounterfactualExperimentFixtures;
const experimentAdapter = window.CounterfactualExperimentAdapter;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const scene = new CityScene($('#cityCanvas'));
const bikeScene = new CityScene($('#bikeWorldCanvas'));
bikeScene.setScenario('bike');
bikeScene.setPhase('lab');
const bloorMainMap = new window.BloorMapView($('#bloorMapMain'));
const bloorBikeMap = new window.BloorMapView($('#bloorMapBike'));
fetch('../data/world/bloor_spadina_bathurst.json')
  .then((response) => { if (!response.ok) throw new Error(`Map HTTP ${response.status}`); return response.json(); })
  .then((world) => {
    bloorMainMap.setWorld(world);
    bloorBikeMap.setWorld(world);
    $('#bikeMapCredit').hidden = false;
    bloorMainMap.setScenario(current.id);
    bloorBikeMap.setScenario('bike');
    $('#worldCaption').textContent = current.id === 'custom' ? current.worldCaption : 'Mapped Bathurst–Spadina context · synthetic policy trace';
    if (phase === 'lab' || phase === 'impact') renderLab();
  })
  .catch(() => { /* Keep the existing schematic city as an offline fallback. */ });
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
  setReplayOpen(!agents.online);   // with the 100 agents online, the prepared replay starts collapsed
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
  else $('#mapMotionCount').textContent = `${actors.length} of ${poll.asked} agents rated · mean ${(actors.reduce((sum, a) => sum + a.rating, 0) / actors.length).toFixed(1)} / 5.`;
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
  if (scenario === 'fare') {
    if (!fareTrace) fareTrace = window.CFSim.buildTrace({ seed: 42, version: 1 });
    current = traceAdapter.toFareScenario(fareTrace, preparedScenarios.fare);
    useFareTrace(fareTrace);
    ensureFareInspector();
  } else if (scenario === 'bike') {
    if (!bikeExperiment) bikeExperiment = await experimentRunner.runExperiment(experimentFixtures.bike);
    if (token !== investigationToken) return;
    window.CounterfactualCurrentExperiment = bikeExperiment;
    current = experimentAdapter.toBikeScenario(bikeExperiment, preparedScenarios.bike);
  } else current = exploratoryScenario(promptOverride || '');
  if (scenario !== 'custom') startPolicyPoll(scenario);
  $('#investigationNote').textContent = !agents.online ? 'Prepared demo replay · no live model call'
    : scenario === 'custom' ? 'Drafting a policy, then asking all 100 persona agents for a 1–5 rating' : 'Asking all 100 persona agents for a 1–5 rating';
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
  requestAnimationFrame(() => $($('#agentPoll').hidden ? '#lab' : '#agentPoll').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }));
}

function renderLab() {
  bloorMainMap.canvas.hidden = current.id === 'custom' || !bloorMainMap.world;
  $('#simulationViewport').classList.toggle('has-mapped-world', !bloorMainMap.canvas.hidden);
  $('#mapAttribution').hidden = bloorMainMap.canvas.hidden;
  bloorMainMap.setScenario(current.id);
  bloorBikeMap.setScenario('bike');
  showPoll(agents.polls[current.id] || (current.id === 'custom' ? agents.chatPoll : null));
  showActors();
  $('#bikeLab').hidden = current.id !== 'bike';
  if (current.id === 'bike') {
    bikeScene.resize();
    bikeScene.setPhase('lab');
    bikeScene.setMotion(!bloorBikeMap.world);
    renderBikeExperiment(current.experiment);
  } else bikeScene.setMotion(false);
  $('#bikeLabButton').hidden = current.id !== 'bike';
  $('#replayToggle').hidden = current.id === 'custom' || !agents.online;
  $('#ttcWorkbench').hidden = current.id !== 'fare';
  $('#ttcInspectorButton').hidden = current.id !== 'fare';
  $('#scenarioBreadcrumb').textContent = current.breadcrumb;
  const run = current.experiment || current.trace;
  $('#runStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW' : 'PREPARED REPLAY (SYNTHETIC)';
  $('#sampleStatus').textContent = current.id === 'custom' ? 'NO MODEL RESULT' : `SYNTHETIC v${run.version}`;
  $('#studyTitle').textContent = current.title;
  $('#studySummary').textContent = current.id === 'custom' ? current.summary : `Prepared simulation replay (synthetic, separate from the 100 agents): ${current.summary}`;
  $('#viewportArea').textContent = current.viewport;
  $('#worldCaption').textContent = !bloorMainMap.canvas.hidden ? 'Mapped Bathurst–Spadina context · synthetic policy trace' : current.worldCaption;
  $('#focusLabelA').textContent = current.focus[0];
  $('#focusLabelB').textContent = current.focus[1];
  $('#headlineEyebrow').textContent = current.headline.label;
  $('#headlineValue').textContent = current.headline.value;
  $('#headlineDirection').textContent = current.headline.direction;
  $('#insightNarrative').textContent = current.narrative;
  $('#sourceRibbon').textContent = current.sourceRibbon;
  $('#impactScenarioTag').textContent = current.mapTag;
  $('#overviewStatus').textContent = current.id === 'custom' ? 'SPECULATIVE PREVIEW / NO MODEL SERIES' : `PREPARED SIMULATION REPLAY (SYNTHETIC, SEPARATE FROM THE 100 AGENTS) v${run.version}`;
  const custom = current.id === 'custom';
  $('#chainLabel').textContent = custom ? 'WHAT A CONNECTED ENGINE WOULD DO' : 'WATCH THE CHAIN';
  $('#impactButtonHint').textContent = custom ? 'Inspect missing evidence' : 'See the connected effects';
  $('#railNoteText').textContent = custom ? 'No simulated policy effects have been computed for this question. The 100 agents rate the drafted policy above; inspect a sector to see what is missing.' : `The map shows observed Bathurst–Spadina context; its dots follow the 100 agents' 1–5 ratings when they are online. The charts and ${current.id === 'fare' ? 'TTC inspector' : 'decision ledger'} are a prepared simulation replay (synthetic, separate from the 100 agents).`;
  $('#impactHeadingLine').textContent = custom ? 'One question.' : 'One decision.';
  $('#impactHeadingEm').textContent = custom ? 'Open outcomes.' : 'Many futures.';
  $('#impactDescription').textContent = custom ? 'Each sector shows the evidence and model work still needed before a policy effect can be estimated.' : current.trace ? 'Each chart reads the same versioned event trace as the TTC city inspector.' : current.id === 'fare' ? 'Each fare chart reduces the same committed events of one paired run.' : 'Each Bloor chart reduces the same committed events shown in the decision ledger.';
  $('#boardCaption').textContent = custom ? 'NO RUN RESULT ATTACHED' : `PREPARED REPLAY (SYNTHETIC) v${run.version} · NOT A FORECAST`;
  $('#boardAction').textContent = custom ? '✳ INSPECT AN OPEN QUESTION' : '✳ TRACE A CONNECTION';
  $('#overviewTitle').textContent = custom ? 'What remains to measure.' : 'Every signal in view.';
  $('#overviewDescription').textContent = custom ? 'These sectors have no modelled series. Choose one to see its missing inputs and evidence.' : current.trace ? 'Five linked views of one seeded run. Change an assumption in the TTC inspector and every chart updates.' : `Five event-derived views of one paired ${current.id === 'fare' ? 'TTC fare' : 'Bloor'} sample. Choose a chart to inspect its assumption boundary.`;
  $('#viewToggle').hidden = custom;
  $('#motionButton').hidden = !bloorMainMap.canvas.hidden;
  $('.timeline-bar').hidden = !bloorMainMap.canvas.hidden;
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
    : current.trace
      ? `Seeded model values, weeks 1–${base.length}. Baseline: ${base.join(', ')}. Proposal: ${policy.join(', ')}. Unit: ${data.unit}. Displayed change compares the average after the policy starts: ${data.delta}. Not a Toronto forecast.`
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
  const chosen = match ? match[0] : 'custom';
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
