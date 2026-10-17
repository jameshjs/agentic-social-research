(function () {
// Templates for both prepared policies. They supply copy, icons and source links; with the
// mapped world loaded, world-run-adapter.js replaces every metric, chart and summary from the
// shared experiment.v2 RunResult. Without it, the earlier trace/v1 adapters fill them instead.
const fare = {
  id: 'fare',
  prompt: 'What if the TTC adult pay-as-you-go fare increased by 50¢?',
  aliases: ['What if the adult TTC pay-as-you-go fare increased by $0.50?', 'What if the adult TTC fare rose by 50 cents, with Fair Pass unchanged?'],
  title: 'What if the TTC adult fare rose by 50¢?',
  summary: 'Explore a fare change on the mapped Bathurst–Spadina section. People and policy responses remain a synthetic trace.',
  breadcrumb: 'BLOOR WEST · BATHURST–SPADINA',
  viewport: 'BATHURST–SPADINA SECTION',
  mapTag: 'TTC FARE / BATHURST–SPADINA',
  location: 'Bloor Street West, Bathurst Street–Spadina Avenue',
  chain: ['Adult pay-as-you-go fare rises 50¢', 'Riders keep, change or defer a trip', 'Destinations see a different visit mix', 'Household costs and sample TTC receipts update'],
  worldCaption: 'Mapped street context · the fare inspector still uses its earlier synthetic district.',
  focus: ['01 / RIDER DECISION', '02 / LOCAL BUSINESS'],
  headline: { label: 'AWAITING SEEDED RUN', value: '—', direction: 'trace required' },
  mini: [],
  narrative: 'The TTC figures are supplied by the seeded trace adapter.',
  sourceRibbon: 'Trace required',
  evidence: {
    title: 'Fare response is a question, not a coefficient.',
    text: 'The TTC fare is an observed input, and the shared city backdrop uses mapped Bathurst–Spadina streets and buildings. The fare inspector still runs its earlier schematic district; its people, income/travel combinations and responses are synthetic and are not calibrated to Bathurst–Spadina. Comparable studies motivate heterogeneous responses but do not supply a Toronto elasticity or shop-sales forecast.',
    links: [
      ['Locked Toronto observed inputs', '../demo-data.md'],
      ['Fare research and conflicting retail evidence', '../papers.md'],
      ['Bogotá fare response study (journal)', 'https://doi.org/10.1007/s11116-019-10034-6'],
    ],
  },
  // Used when the canonical mapped run is attached (app.js); `evidence` above stays for the earlier-engine fallback.
  mappedEvidence: {
    title: 'Fare response is a question, not a coefficient.',
    text: 'The adult fare ($3.30 → $3.80) and the unchanged Fair Pass fare are citywide TTC rules applied to the mapped Bathurst–Spadina section: City streets and buildings, OpenStreetMap shops and the Line 2 GTFS schedule. The people, homes, routines, budgets, baskets and fare responses are synthetic and not calibrated to Bathurst–Spadina. The earlier TTC inspector further down uses its own schematic district. Comparable studies motivate heterogeneous responses but supply no Toronto elasticity, shop-sales or City-wide revenue forecast.',
    links: [
      ['Mapped world and its sources', '../world/README.md'],
      ['Locked Toronto observed inputs', '../demo-data.md'],
      ['Fare research and conflicting retail evidence', '../papers.md'],
      ['Bogotá fare response study (journal)', 'https://doi.org/10.1007/s11116-019-10034-6'],
    ],
  },
  sectors: {
    mobility: { icon: '↗', number: '01 / MOBILITY', title: 'A different route through the city.', description: 'Riders can keep a trip, choose another mode, travel elsewhere, or not travel.' },
    access: { icon: '◇', number: '02 / ACCESS', title: 'Some trips do not happen.', description: 'A lost bus ride may become another trip mode or a deferred journey.' },
    commerce: { icon: '⌑', number: '03 / LOCAL COMMERCE', title: 'Visits ripple into a shop’s day.', description: 'Completed errands and transactions determine local shop activity.' },
    households: { icon: '◈', number: '04 / HOUSEHOLDS', title: 'The cost lands unevenly.', description: 'Fare burden is calculated from synthetic persona income and recorded paid trips.' },
    public: { icon: '≋', number: '05 / PUBLIC REALM', title: 'More per ride, fewer rides.', description: 'Sample fare receipts reflect paid fares and simulated ridership.' },
  },
};

const bike = {
  id: 'bike',
  prompt: 'What if the protected Bloor Street West bike lanes were removed?',
  aliases: [
    'What if protected bike lanes on Bloor Street West between Shaw Street and Avenue Road were removed and road space returned to motor vehicles?',
    'What if the protected Bloor Street West bike lanes between Shaw Street and Avenue Road were removed and road space returned to motor vehicles?',
    'What if the protected Bloor cycle track between Bathurst and Spadina were removed?',
  ],
  title: 'What if Bloor’s protected bike lanes were removed?',
  summary: 'Explore a hypothetical road change on Bloor West. Follow cyclists, drivers, a shop and the curb as route and visit choices change.',
  breadcrumb: 'BLOOR WEST · BATHURST–SPADINA',
  viewport: 'BATHURST–SPADINA SECTION',
  mapTag: 'BLOOR TRACK / BATHURST–SPADINA',
  location: 'Bloor Street West, Bathurst Street–Spadina Avenue',
  chain: ['Protected lane is removed in a hypothetical layout', 'Cyclists keep, detour, switch mode or defer', 'Traffic, curb and destination arrivals adjust', 'Shop visits and household costs update'],
  worldCaption: 'Mapped street context · recorded choices remain in the separate synthetic trace.',
  focus: ['01 / CYCLIST REROUTES', '02 / SHOP & CURB'],
  headline: { label: 'SAMPLE BLOOR CYCLE TRIPS', value: '−16%', direction: 'vs baseline at period 4' },
  mini: [
    { label: 'Cyclist detour time', value: '+6 min', tone: 'negative' },
    { label: 'Sample shop visits', value: '−3%', tone: 'negative' },
    { label: 'Driver travel time', value: '0% gain case', tone: 'neutral' },
  ],
  narrative: 'The street overlay and values are a hypothetical sample run. Historical lane-installation observations cannot be reversed into a removal forecast.',
  sourceRibbon: 'City Bloor counts and studies; removal response remains an assumption',
  evidence: {
    title: 'Removing a lane has no measured reverse effect.',
    text: 'Toronto has observed Bloor cycling counts, traffic and retail studies from installation and later operation. They provide context and mechanisms, not a valid coefficient for reversing the policy. Shop sales, travel time, safety and emissions require fresh analysis before a real decision.',
    links: [
      ['Bloor demo research and source caveats', '../bloor-bike-demo.md'],
      ['Bloor evidence pack and observed baseline', '../bike-lane-papers.md'],
      ['City 2025 Cycling Year in Review', 'https://www.toronto.ca/wp-content/uploads/2026/03/96e8-2025-Toronto-Cycling-Year-in-Review-FINAL.pdf'],
      ['Bloor merchant study', 'https://ero.ontario.ca/public/public_uploads/2024-10/Bloor-Economic-Impact-Study-Full-Report-2019-09-03_0.pdf'],
    ],
  },
  sectors: {
    mobility: { icon: '↗', number: '01 / MOBILITY', title: 'A protected path disappears.', description: 'Some cyclists stay on Bloor, others detour, change mode, or skip a trip. Drivers may or may not gain time, depending on the final street design.', delta: '−16% BIKES', chartTitle: 'SAMPLE BLOOR CYCLE TRIPS / 4 PERIODS', unit: 'synthetic Bloor cycle trips per model period', baseline: [39, 41, 42, 43], policy: [34, 34, 35, 36], evidence: 'The City observed 3,524 daily passages at its 2025 Huron counter. This sample delta is not inferred from that count.' },
    access: { icon: '◇', number: '02 / ACCESS', title: 'The route to a destination matters.', description: 'A detour can lengthen a commute or change which shops and services someone reaches. The scene shows a schematic corridor, not a GIS-accurate trip model.', delta: '+6 MIN DETOUR', chartTitle: 'SAMPLE DETOUR MINUTES / 4 PERIODS', unit: 'illustrative detour minutes per sampled cyclist trip', baseline: [0, 0, 0, 0], policy: [4, 5, 6, 6], evidence: 'Detour minutes are illustrative. Current origins, destinations and route suitability are not yet measured.' },
    commerce: { icon: '⌑', number: '03 / LOCAL COMMERCE', title: 'A different mix arrives at the door.', description: 'Shops may see changes in cycling, walking, driving and delivery visits. Purchases and partial margins should follow actual simulated transactions.', delta: '−3% VISITS', chartTitle: 'SAMPLE SHOP VISITS / 4 PERIODS', unit: 'synthetic shop visits per model period', baseline: [30, 32, 33, 34], policy: [30, 31, 32, 33], evidence: 'The Bloor merchant study notes retail growth, but comparison areas also grew; removal effects are unobserved.' },
    households: { icon: '◈', number: '04 / HOUSEHOLDS', title: 'Time and fares enter the household ledger.', description: 'People who switch from cycling to transit may pay fares; people who drive may pay for parking. The policy affects different households differently.', delta: '+4% COST', chartTitle: 'SAMPLE TRAVEL COST / 4 PERIODS', unit: 'illustrative CAD per sampled household per model period', baseline: [22, 22, 23, 23], policy: [23, 23, 24, 24], evidence: 'Transport spend is computed only where a simulated fare or parking payment exists; this preview uses synthetic choices.' },
    public: { icon: '≋', number: '05 / PUBLIC REALM', title: 'The curb serves competing needs.', description: 'Loading, parking, traffic and street safety pull in different directions. This mock run assumes zero driver-time gain to keep that uncertainty visible.', delta: '0% DRIVER GAIN', chartTitle: 'SAMPLE DRIVER TIME / 4 PERIODS', unit: 'illustrative minutes per sampled driver trip', baseline: [29, 30, 30, 31], policy: [29, 30, 30, 31], evidence: 'The City’s large removal-cost estimate spans multiple corridors. Bloor-segment construction cost and future safety outcomes are not estimable here.' },
  },
};

const preparedScenarios = { fare, bike };

function exploratoryScenario(prompt) {
  const title = prompt.trim().replace(/^what if\s+/i, '').replace(/[?.!]+$/, '') || 'a new city policy';
  const short = title.length > 75 ? `${title.slice(0, 72)}…` : title;
  const sectors = Object.fromEntries(['mobility', 'access', 'commerce', 'households', 'public'].map((key, i) => [key, {
    icon: ['↗', '◇', '⌑', '◈', '≋'][i], number: `${String(i + 1).padStart(2, '0')} / ${key.toUpperCase()}`,
    title: 'This effect needs a model and evidence.', description: 'The generic prompt has been accepted for exploration. This front-end concept does not invent a policy-specific result; a connected compiler and world engine must generate the event trace and metrics.',
    delta: 'NOT ESTIMABLE', chartTitle: 'NO CALIBRATED SERIES YET', baseline: [], policy: [], evidence: 'No retrieved source or validated mechanism has been attached to this prompt.'
  }]));
  return {
    id: 'custom', prompt, title: `What if ${short}?`, summary: 'An exploratory question is ready for a real scenario compiler. This interface shows the product path without manufacturing outcomes.',
    breadcrumb: 'UNPREPARED QUESTION', viewport: 'EXPLORATORY CITY', mapTag: 'SPECULATIVE / CITY LAB', location: 'Toronto-inspired illustrative world',
    chain: ['Interpret the freeform hypothesis', 'Generate affected stakeholders', 'Find evidence and missing mechanisms', 'Run baseline and proposed worlds'],
    worldCaption: 'A question is ready for investigation.', focus: ['01 / PROPOSED CHANGE', '02 / EFFECT TO INVESTIGATE'],
    headline: { label: 'POLICY EFFECT', value: '—', direction: 'not estimable yet' },
    mini: [{ label: 'People affected', value: 'TBD', tone: 'positive' }, { label: 'Economic effect', value: 'TBD', tone: 'positive' }, { label: 'Evidence tier', value: 'SPECULATIVE', tone: 'negative' }],
    narrative: 'This front-end prototype accepts the question and preserves it. Only a connected hypothesis compiler and simulation engine can produce a defensible result.',
    sourceRibbon: 'No source or run result attached to this question',
    evidence: { title: 'This question needs its own evidence.', text: 'The city is an interface preview for arbitrary hypotheses. No source-backed mechanism, affected-person sample, or computed metric has been produced for this custom prompt.', links: [['Product requirements', '../prd.md']] },
    sectors,
  };
}
window.CounterfactualScenarios = { preparedScenarios, exploratoryScenario };
})();
