(function () {
// UI-only replay data. These synthetic values are NOT empirical Toronto estimates.
// The production app should replace this module with one RunResult/event ledger.
const fare = {
  id: 'fare',
  prompt: 'What if the TTC adult pay-as-you-go fare increased by 50¢?',
  aliases: ['What if the adult TTC pay-as-you-go fare increased by $0.50?'],
  title: 'What if the TTC adult fare rose by 50¢?',
  summary: 'Follow riders, a neighbourhood shop, and sample fare payments as choices ripple through a small synthetic district near UTSC.',
  breadcrumb: 'MORNINGSIDE · HIGHLAND CREEK',
  viewport: 'UTSC DISTRICT',
  mapTag: 'TTC FARE / UTSC DISTRICT',
  location: 'Morningside–Highland Creek, Toronto',
  chain: ['Adult pay-as-you-go fare rises 50¢', 'Riders keep, change or defer a trip', 'Destinations see a different visit mix', 'Household costs and sample TTC receipts update'],
  worldCaption: 'People choose. The city changes.',
  focus: ['01 / RIDER DECISION', '02 / LOCAL BUSINESS'],
  headline: { label: 'SAMPLE PAID RIDES', value: '−9%', direction: 'vs baseline at period 4' },
  mini: [
    { label: 'Household travel spend', value: '+12%', tone: 'negative' },
    { label: 'Sample shop visits', value: '−3%', tone: 'negative' },
    { label: 'Sample fare receipts', value: '+6%', tone: 'positive' },
  ],
  narrative: 'A higher fare changes some riders’ trip or payment decisions. The displayed deltas come from a prepared synthetic example, with no Toronto-calibrated fare response.',
  sourceRibbon: 'TTC fare rules + Toronto area context; behavioural assumptions shown separately',
  evidence: {
    title: 'Fare response is a question, not a coefficient.',
    text: 'The TTC fare rule and local census/traffic context are observed inputs. Comparable studies motivate heterogeneous fare and trip responses, but they do not supply a 2026 Toronto elasticity or a shop-sales forecast. Retail and employment effects are deliberately uncertain.',
    links: [
      ['Locked Toronto observed inputs', '../demo-data.md'],
      ['Fare research and conflicting retail evidence', '../papers.md'],
      ['Bogotá fare response study (journal)', 'https://doi.org/10.1007/s11116-019-10034-6'],
    ],
  },
  sectors: {
    mobility: { icon: '↗', number: '01 / MOBILITY', title: 'A different route through the city.', description: 'Riders can keep a trip, choose another mode, travel elsewhere, or not travel. A fare change does not imply that every lost bus trip becomes a walk.', delta: '−9% RIDES', chartTitle: 'SAMPLE PAID RIDES / 4 PERIODS', unit: 'synthetic paid rides per model period', baseline: [42, 44, 45, 45], policy: [40, 39, 40, 41], evidence: 'Fare elasticities in other systems vary. Response size here is an illustrative assumption.' },
    access: { icon: '◇', number: '02 / ACCESS', title: 'Some destinations become harder to reach.', description: 'When a trip is deferred or a route changes, access to shops and services may change. The scenario records destination events, rather than presuming every journey disappears.', delta: '−6% TRIPS', chartTitle: 'DESTINATION TRIPS / 4 PERIODS', unit: 'synthetic destination trips per model period', baseline: [32, 33, 34, 35], policy: [31, 31, 32, 33], evidence: 'Boston low-income fare research shows trip purpose matters; it does not establish a Toronto increase effect.' },
    commerce: { icon: '⌑', number: '03 / LOCAL COMMERCE', title: 'Visits ripple into a shop’s day.', description: 'A synthetic shop sees a different mix of arrivals. Purchases and staffing only change if recorded choices and the stated shop rules support them.', delta: '−3% VISITS', chartTitle: 'SAMPLE SHOP VISITS / 4 PERIODS', unit: 'synthetic shop visits per model period', baseline: [31, 33, 32, 35], policy: [30, 32, 31, 34], evidence: 'Retail studies conflict and address different fare interventions. Zero retail effect remains a valid sensitivity case.' },
    households: { icon: '◈', number: '04 / HOUSEHOLDS', title: 'The cost lands unevenly.', description: 'Pay-as-you-go riders, Fair Pass riders, and people at the monthly cap face different effective prices. Household spend must follow each simulated paid trip.', delta: '+12% SPEND', chartTitle: 'SAMPLE TRANSPORT SPEND / 4 PERIODS', unit: 'illustrative CAD per sampled household per model period', baseline: [24, 25, 25, 26], policy: [27, 28, 28, 29], evidence: 'TTC fare and cap rules are observed. Income/travel traits are synthetic and separate census margins cannot be merged into people.' },
    public: { icon: '≋', number: '05 / PUBLIC REALM', title: 'More per ride, fewer rides.', description: 'Sample fare receipts reflect both actual paid fares and simulated ridership. This is not the TTC’s total revenue or a City budget estimate.', delta: '+6% RECEIPTS', chartTitle: 'SAMPLE FARE RECEIPTS / 4 PERIODS', unit: 'illustrative CAD receipts per sampled model period', baseline: [32, 33, 34, 35], policy: [34, 35, 36, 37], evidence: 'Fare-product choice and caps matter. Citywide revenue and operating costs are not estimated here.' },
  },
};

const bike = {
  id: 'bike',
  prompt: 'What if the protected Bloor Street West bike lanes were removed?',
  aliases: [
    'What if protected bike lanes on Bloor Street West between Shaw Street and Avenue Road were removed and road space returned to motor vehicles?',
    'What if the protected Bloor Street West bike lanes between Shaw Street and Avenue Road were removed and road space returned to motor vehicles?',
  ],
  title: 'What if Bloor’s protected bike lanes were removed?',
  summary: 'Explore a hypothetical road change on Bloor West. Follow cyclists, drivers, a shop and the curb as route and visit choices change.',
  breadcrumb: 'BLOOR WEST · ANNEX',
  viewport: 'SCHEMATIC BLOOR CORRIDOR',
  mapTag: 'BLOOR LANES / ANNEX DISTRICT',
  location: 'Bloor Street West, Shaw Street–Avenue Road',
  chain: ['Protected lane is removed in a hypothetical layout', 'Cyclists keep, detour, switch mode or defer', 'Traffic, curb and destination arrivals adjust', 'Shop visits and household costs update'],
  worldCaption: 'A street changes. People choose new paths.',
  focus: ['01 / CYCLIST REROUTES', '02 / SHOP & CURB'],
  headline: { label: 'SAMPLE BLOOR CYCLE TRIPS', value: '−16%', direction: 'vs baseline at period 4' },
  mini: [
    { label: 'Cyclist detour time', value: '+6 min', tone: 'negative' },
    { label: 'Sample shop visits', value: '−3%', tone: 'negative' },
    { label: 'Driver travel time', value: '0% case', tone: 'positive' },
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
