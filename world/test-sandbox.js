const test = require('node:test');
const assert = require('node:assert');
const world = require('../data/world/bloor_spadina_bathurst.json');
const { createSandbox, calibrationReport, phaseAt } = require('./sandbox.js');

const AM = 8 * 3600;

test('world data keeps observed, derived and assumed values apart', () => {
  assert.equal(world.schema_version, 'world.v0');
  assert.equal(world.signal_timing.status, 'assumption');
  assert.equal(world.population.status, 'derived_estimate');
  const [bathurst, spadina] = world.counts.intersections;
  assert.equal(bathurst.count_date, spadina.count_date, 'both section ends use the same count day');
  for (const k of ['tmc', 'signals', 'pednet', 'cycling', 'massing', 'gtfs', 'osm']) assert.ok(world.sources[k].url, k);
  assert.ok(world.buildings.items.length > 100);
  assert.ok(world.businesses.items.some((b) => b.on_bloor));
});

test('walkers may not use car lanes or cycle tracks', () => {
  const sb = createSandbox(world);
  sb.addAgent({ id: 'w', at: 'portal_south_0', mode: 'walk', t: AM });
  const ev = sb.move('w', 'in_car_portal_south_0_eb');
  assert.equal(ev.type, 'action_rejected');
  assert.match(ev.reason, /mode_not_permitted/);
});

test('no teleporting: a move must start at the agent position', () => {
  const sb = createSandbox(world);
  sb.addAgent({ id: 'w', at: 'portal_south_0', mode: 'walk', t: AM });
  assert.equal(sb.move('w', 'car_eb_3').reason, 'not_adjacent');
});

test('Bloor can be crossed only on a mapped crosswalk at a signal', () => {
  const sb = createSandbox(world);
  const across = [...sb.graph.edges.values()].filter((e) => e.crosswalk === 'across_bloor');
  assert.ok(across.length >= 4);
  for (const e of across) assert.ok(e.gate && e.gate.kind === 'walk' && e.gate.movement === 'across_bloor');
  const signalled = new Set(world.bloor.intersections.map((n, i) => (n.signal_px ? i : null)).filter((i) => i !== null));
  for (const e of across) assert.ok(signalled.has(sb.graph.nodes.get(e.from).intersection), e.id);
});

test('pedestrians start a signalized crossing only during the walk interval', () => {
  const sb = createSandbox(world);
  const e = [...sb.graph.edges.values()].find((x) => x.crosswalk === 'across_bloor');
  for (let t = AM; t < AM + 200; t += 13) {
    sb.addAgent({ id: `p${t}`, at: e.from, mode: 'walk', t });
    const ev = sb.move(`p${t}`, e.id);
    assert.equal(ev.type, 'moved');
    assert.equal(phaseAt(sb.plan, e.gate.px, ev.t + ev.wait_s).walk, 'across_bloor');
  }
});

test('subway boarding waits for a scheduled departure and charges one fare', () => {
  const sb = createSandbox(world);
  sb.addAgent({ id: 'r', at: 'portal_south_0', mode: 'transit', t: AM });
  const trip = sb.travel('r', 'portal_north_7');
  assert.equal(trip.type, 'trip_completed');
  const ride = sb.events.find((x) => x.actor === 'r' && x.edge === 'line2_eb');
  assert.ok(ride, 'used Line 2');
  assert.equal(trip.fare_cad, 3.3);
  assert.equal(sb.agents.get('r').fares_paid, 3.3);
});

test('removing the cycle track puts cyclists in car lanes', () => {
  const kept = createSandbox(world, { policy: { bloor_cycle_track: 'protected' } });
  const gone = createSandbox(world, { policy: { bloor_cycle_track: 'none' } });
  assert.ok([...kept.graph.edges.keys()].some((k) => k.startsWith('trk_')));
  assert.ok(![...gone.graph.edges.keys()].some((k) => k.startsWith('trk_')));
  for (const sb of [kept, gone]) sb.addAgent({ id: 'c', at: 'portal_north_0', mode: 'bike', t: AM });
  assert.equal(kept.travel('c', 'portal_north_7').shared_with_cars_m, 0);
  assert.ok(gone.travel('c', 'portal_north_7').shared_with_cars_m > 600);
});

test('a visit is recorded only at the business door', () => {
  const sb = createSandbox(world);
  const door = sb.graph.nodes.get([...sb.graph.doors.values()][0]);
  sb.addAgent({ id: 's', at: 'portal_north_3', mode: 'walk', t: AM });
  assert.equal(sb.enter('s', door.business_ids[0]).reason, 'not_at_business_door');
  sb.travel('s', door.id);
  assert.equal(sb.enter('s', door.business_ids[0]).type, 'entered_business');
});

test('unknown policy levers are refused', () => {
  assert.throws(() => createSandbox(world, { policy: { free_parking_everywhere: true } }), /Unknown policy lever/);
});

test('same seed and policy replay the same events', () => {
  const run = () => {
    const sb = createSandbox(world, { seed: 3 });
    sb.addAgent({ id: 'c', at: 'portal_south_2', mode: 'bike', t: AM });
    sb.travel('c', 'portal_north_6');
    return JSON.stringify(sb.events);
  };
  assert.equal(run(), run());
});

test('calibration report compares section entries with far-end arrivals', () => {
  const r = calibrationReport(world);
  assert.equal(r.date, world.section_flows.count_date);
  for (const v of Object.values(r.net_side_street_gain_pct)) assert.ok(Math.abs(v) < 25, `side-street exchange ${v}% looks implausible`);
});
