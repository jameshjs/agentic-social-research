"""Build the Bloor St W (Spadina Ave to Bathurst St) sandbox world from downloaded open data.

Usage:
  world/build/download.sh <raw_dir>                      # fetch sources once (about 250 MB)
  python3 world/build/extract_gtfs.py <raw_dir>/gtfs <raw_dir>/gtfs_section.json
  PYTHONPATH=<dir with pyshp> python3 world/build/build_world.py <raw_dir> data/world/bloor_spadina_bathurst.json

Every value is tagged observed, derived or assumption in the output. Nothing here is a
simulation result.
"""
import collections
import csv
import json
import math
import sys

import shapefile  # pyshp

from section import (BBOX, SECTION_LENGTH_M, THETA, from_local, in_bbox, mercator_to_wgs84,
                     point_in_ring, ring_area, to_local)

COUNT_DATE = '2025-06-25'          # same weekday count at both ends of the section
NEIGHBOURHOODS = {'095': 'Annex', '079': 'University', '080': 'Palmerston-Little Italy'}
# 2021 Census, 25% sample population and private households (neighbourhood profiles workbook).
NBHD_CENSUS = {'Annex': (29300, 16330), 'University': (6435, 3245), 'Palmerston-Little Italy': (13120, 6180)}
FLOOR_HEIGHT_M = 3.2
FRONTAGE_M = 45                    # buildings whose centroid is within this of the centreline face Bloor
GRID_M = 25

RESIDENTIAL = {'house', 'semidetached_house', 'apartments', 'detached', 'terrace', 'residential', 'dormitory'}
NON_RESIDENTIAL = {'retail', 'commercial', 'office', 'school', 'church', 'university', 'train_station',
                   'hospital', 'civic', 'garage', 'shed', 'construction'}
FOOD = {'restaurant', 'fast_food', 'cafe', 'pub', 'bar', 'ice_cream', 'food_court'}
SERVICES = {'bank', 'pharmacy', 'dentist', 'doctors', 'clinic', 'post_office', 'theatre', 'cinema', 'library',
            'place_of_worship', 'community_centre', 'bureau_de_change', 'veterinary', 'childcare', 'arts_centre',
            'nightclub', 'school', 'college', 'university', 'language_school', 'music_school'}


def r1(v):
    return round(v, 1)


def load(path):
    with open(path) as f:
        return json.load(f)


def cross_streets(osm_highways):
    """Cross streets meeting Bloor between Bathurst and Spadina, from shared OSM nodes."""
    ways = osm_highways['elements']
    bloor_nodes = {n for w in ways if w['tags'].get('name', '').startswith('Bloor') for n in w['nodes']}
    hits = collections.defaultdict(set)
    for w in ways:
        t = w['tags']
        if t.get('name', '').startswith('Bloor') or t.get('highway') in ('footway', 'service', 'corridor', 'steps', 'pedestrian'):
            continue
        for n, g in zip(w['nodes'], w['geometry']):
            if n in bloor_nodes:
                x, y = to_local(g['lat'], g['lon'])
                side = 'north' if _leaves_north(w, n) else 'south'
                hits[(n, r1(x))].add((t.get('name'), t.get('highway'), side))
    nodes = []
    for (osm_id, x), streets in sorted(hits.items(), key=lambda kv: kv[0][1]):
        if -5 <= x <= SECTION_LENGTH_M + 5:
            nodes.append({'osm_node': osm_id, 'x': x, 'streets': sorted({s[0] for s in streets}),
                          'legs': sorted({f'{s[0]}|{s[1]}|{s[2]}' for s in streets})})
    return nodes


def _leaves_north(way, node):
    i = way['nodes'].index(node)
    other = way['geometry'][i + 1] if i + 1 < len(way['geometry']) else way['geometry'][i - 1]
    return to_local(other['lat'], other['lon'])[1] > 0


def bloor_attributes(osm_highways):
    segs = []
    for w in osm_highways['elements']:
        t = w['tags']
        if not t.get('name', '').startswith('Bloor'):
            continue
        xs = [to_local(g['lat'], g['lon'])[0] for g in w['geometry']]
        if max(xs) < 0 or min(xs) > SECTION_LENGTH_M:
            continue
        segs.append({'osm_way': w['id'], 'x_from': r1(min(xs)), 'x_to': r1(max(xs)),
                     **{k: t[k] for k in ('lanes', 'lanes:forward', 'lanes:backward', 'maxspeed', 'cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both') if k in t}})
    return sorted(segs, key=lambda s: s['x_from'])


def signals(raw):
    out = []
    for f in load(f'{raw}/signals.geojson')['features']:
        lon, lat = f['geometry']['coordinates'][0][:2]
        if not in_bbox(lat, lon):
            continue
        p = f['properties']
        x, y = to_local(lat, lon)
        out.append({'px': int(p['PX']), 'name': ' / '.join(s for s in (p['MAIN_STREET'], p['SIDE1_STREET'], p['SIDE2_STREET']) if s and s != 'None'),
                    'lat': round(lat, 7), 'lon': round(lon, 7), 'x': x, 'y': y, 'on_bloor': abs(y) < 25 and -10 <= x <= SECTION_LENGTH_M + 10,
                    'private_access': p['SIDE2_STREET'] == 'PRIVATE ACCESS', 'control_mode': p['CONTROL_MODE'],
                    'ped_walk_speed': p['PEDWALKSPEED'], 'bicycle_signal': p['BICYCLE_SIGNAL'], 'transit_preempt': p['TRANSIT_PREEMPT'],
                    'approaches': p['NUMBEROFAPPROACHES'], 'activated': (p['ACTIVATIONDATE'] or '')[:10]})
    return sorted(out, key=lambda s: (not s['on_bloor'], s['x']))


def phases_observed(raw, pxs):
    seen = collections.defaultdict(lambda: collections.defaultdict(set))
    with open(f'{raw}/timing/traffic-signals-timing.csv') as f:
        for r in csv.DictReader(f):
            if int(r['TCS']) in pxs:
                seen[int(r['TCS'])][int(r['PHASE'])].add(r['PHASE_PED_STATUS_TEXT'] or '')
    return {px: {'phases': sorted(ph), 'pedestrian_phases': sorted(p for p, st in ph.items() if any('Walk' in s for s in st))} for px, ph in seen.items()}


def crosswalks(raw):
    out = []
    for f in load(f'{raw}/pednet.geojson')['features']:
        p = f['properties']
        if not p['CROSSWALK'] or not f['geometry']:
            continue
        line = f['geometry']['coordinates'][0]
        if not any(in_bbox(pt[1], pt[0]) for pt in line):
            continue
        a, b = to_local(line[0][1], line[0][0]), to_local(line[-1][1], line[-1][0])
        crosses_bloor = (a[1] > 0) != (b[1] > 0) and -25 <= (a[0] + b[0]) / 2 <= SECTION_LENGTH_M + 25
        out.append({'id': p['OBJECTID'], 'type': {'ts': 'signalized', 'pc': 'pedestrian_crossover', 'ns': 'unsignalized'}.get(p['CROSSWALK_TYPE'], p['CROSSWALK_TYPE']),
                    'px': int(p['PX']) if str(p['PX']).strip() else None, 'length_m': r1(p['LENGTH']),
                    'a': a, 'b': b, 'crosses_bloor': crosses_bloor})
    return out


def walk_network(raw):
    """Pedestrian network segments (centreline-based) clipped to the box, in local metres."""
    out = []
    for f in load(f'{raw}/pednet.geojson')['features']:
        if not f['geometry']:
            continue
        line = f['geometry']['coordinates'][0]
        if not any(in_bbox(pt[1], pt[0]) for pt in line):
            continue
        p = f['properties']
        out.append({'id': p['OBJECTID'], 'road_type': p['ROAD_TYPE'], 'sidewalk': (p['SIDEWALK_DESCRIPTION'] or '').strip() or None,
                    'crosswalk': bool(p['CROSSWALK']), 'length_m': r1(p['LENGTH']),
                    'path': [to_local(pt[1], pt[0]) for pt in line]})
    return out


def cycling(raw):
    out = []
    for f in load(f'{raw}/cycling.geojson')['features']:
        g = f['geometry']
        lines = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        if not any(in_bbox(pt[1], pt[0]) for l in lines for pt in l):
            continue
        p = f['properties']
        out.append({'segment_id': p['SEGMENT_ID'], 'street': p['STREET_NAME'], 'from': p['FROM_STREET'], 'to': p['TO_STREET'],
                    'infrastructure': p['INFRA_HIGHORDER'], 'installed': p['INSTALLED'],
                    'paths': [[to_local(pt[1], pt[0]) for pt in l] for l in lines]})
    return out


APPROACHES = ('n', 's', 'e', 'w')


def counts(raw):
    out = []
    for px, label in ((321, 'Bathurst St / Bloor St W'), (281, 'Spadina Ave / Bloor St W / Spadina Rd'), (2083, 'Bloor St W / Walmer Rd / Robert St')):
        recs = load(f'{raw}/tmc_px{px}.json')['result']['records']
        dates = sorted({r['count_date'] for r in recs})
        date = COUNT_DATE if COUNT_DATE in dates else dates[-1]
        rows = sorted((r for r in recs if r['count_date'] == date), key=lambda r: r['start_time'])
        intervals = []
        for r in rows:
            iv = {'start': r['start_time'][11:16]}
            for a in APPROACHES:
                for m in ('cars', 'truck', 'bus'):
                    for turn in ('l', 't', 'r'):
                        iv[f'{a}_{m}_{turn}'] = r[f'{a}_appr_{m}_{turn}']
                iv[f'{a}_peds'] = r[f'{a}_appr_peds']
                iv[f'{a}_bike'] = r[f'{a}_appr_bike']
            intervals.append(iv)
        totals = collections.Counter()
        for iv in intervals:
            for k, v in iv.items():
                if k != 'start':
                    kind = k.split('_')[1]
                    totals['vehicles' if kind in ('cars', 'truck', 'bus') else kind] += v or 0
        r0 = rows[0]
        out.append({'px': px, 'location': label, 'count_date': date, 'count_id': r0['count_id'],
                    'lat': round(r0['latitude'], 7), 'lon': round(r0['longitude'], 7), 'x': to_local(r0['latitude'], r0['longitude'])[0],
                    'interval_minutes': 15, 'intervals': intervals,
                    'totals': {'vehicles': totals['vehicles'], 'pedestrians': totals['peds'], 'bicycles': totals['bike']},
                    'other_dates_available': [d for d in dates if d != date]})
    return out


def section_flows(cnts):
    """Flows entering the section, per 15 minutes, derived from the two end counts.

    TMC approach letters name where traffic comes from: w_appr at Bathurst is eastbound
    traffic heading into the section; e_appr at Spadina is westbound traffic heading in.
    """
    by = {c['px']: c for c in cnts}
    bath, spad = by[321], by[281]
    if bath['count_date'] != spad['count_date']:
        raise SystemExit('end counts are from different dates')
    flows = []
    for b, s in zip(bath['intervals'], spad['intervals']):
        assert b['start'] == s['start']
        def veh(iv, appr, turn):
            return sum(iv[f'{appr}_{m}_{turn}'] or 0 for m in ('cars', 'truck'))
        def bus(iv, appr, turn):
            return iv[f'{appr}_bus_{turn}'] or 0
        flows.append({
            'start': b['start'],
            # Into the section eastbound at Bathurst: through from the west, left from the north, right from the south.
            'eb_vehicles_in': veh(b, 'w', 't') + veh(b, 'n', 'l') + veh(b, 's', 'r'),
            'wb_vehicles_in': veh(s, 'e', 't') + veh(s, 'n', 'r') + veh(s, 's', 'l'),
            'eb_buses_in': bus(b, 'w', 't') + bus(b, 'n', 'l') + bus(b, 's', 'r'),
            'wb_buses_in': bus(s, 'e', 't') + bus(s, 'n', 'r') + bus(s, 's', 'l'),
            'eb_bikes_approach_bathurst': b['w_bike'] or 0,
            'wb_bikes_approach_spadina': s['e_bike'] or 0,
            # Calibration targets: what arrives at the far end of the section.
            'eb_vehicles_arrive_spadina': sum(veh(s, 'w', t) for t in 'ltr'),
            'wb_vehicles_arrive_bathurst': sum(veh(b, 'e', t) for t in 'ltr'),
            'eb_bikes_arrive_spadina': s['w_bike'] or 0,
            'wb_bikes_arrive_bathurst': b['e_bike'] or 0,
            'peds_crossing_bloor_bathurst': (b['e_peds'] or 0) + (b['w_peds'] or 0),
            'peds_crossing_bloor_spadina': (s['e_peds'] or 0) + (s['w_peds'] or 0),
            'peds_along_bloor_bathurst': (b['n_peds'] or 0) + (b['s_peds'] or 0),
            'peds_along_bloor_spadina': (s['n_peds'] or 0) + (s['s_peds'] or 0),
        })
    return flows


def neighbourhood_polygons(raw):
    polys = {}
    for f in load(f'{raw}/nbhd.geojson')['features']:
        code = f['properties']['AREA_SHORT_CODE']
        if code in NEIGHBOURHOODS:
            g = f['geometry']
            rings = [poly[0] for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']])]
            polys[NEIGHBOURHOODS[code]] = rings
    return polys


def nbhd_of(lon, lat, polys):
    for name, rings in polys.items():
        if any(point_in_ring(lon, lat, ring) for ring in rings):
            return name
    return None


def buildings(raw, polys):
    """Massing footprints in the box, plus total floor area per neighbourhood for the population estimate."""
    sf = shapefile.Reader(f'{raw}/massing/3DMassingShapefile_2025_WGS84')
    w, s, e, n = BBOX
    nb_box = {name: (min(p[0] for r in rings for p in r), min(p[1] for r in rings for p in r),
                     max(p[0] for r in rings for p in r), max(p[1] for r in rings for p in r)) for name, rings in polys.items()}
    floor_total = collections.Counter()
    clipped = []
    for i, sr in enumerate(sf.iterShapeRecords()):
        rec = sr.record
        lon, lat = rec['LONGITUDE'], rec['LATITUDE']
        height = rec['AVG_HEIGHT'] or rec['MAX_HEIGHT'] or 0
        if height < 2:
            continue
        shp = sr.shape
        parts = list(shp.parts) + [len(shp.points)]
        outer = [mercator_to_wgs84(*pt) for pt in shp.points[parts[0]:parts[1]]]
        local = [to_local(la, lo) for la, lo in outer]
        floors = max(1, round(height / FLOOR_HEIGHT_M))
        floor_area = ring_area(local) * floors
        for name, (bw, bs, be, bn) in nb_box.items():
            if bw <= lon <= be and bs <= lat <= bn and any(point_in_ring(lon, lat, r) for r in polys[name]):
                floor_total[name] += floor_area
                break
        if w <= lon <= e and s <= lat <= n:
            clipped.append({'id': f'b{i}', 'lat': round(lat, 7), 'lon': round(lon, 7), 'centroid': to_local(lat, lon),
                            'footprint': local, 'height_m': r1(height), 'floors_est': floors,
                            'floor_area_m2_est': round(floor_area), 'height_source': rec['HEIGHT_SRC'],
                            'neighbourhood': nbhd_of(lon, lat, polys)})
    return clipped, floor_total


def osm_building_use(blds, osm_b):
    tagged = []
    for el in osm_b['elements']:
        c = el.get('center')
        if c:
            tagged.append((to_local(c['lat'], c['lon']), el['tags'].get('building'), el['tags'].get('addr:housenumber'), el['tags'].get('addr:street')))
    for b in blds:
        hit = [t for t in tagged if point_in_ring(t[0][0], t[0][1], b['footprint'])]
        tag = hit[0][1] if hit else None
        b['osm_building'] = tag
        b['address'] = f'{hit[0][2]} {hit[0][3]}' if hit and hit[0][2] and hit[0][3] else None
        b['use'] = 'residential' if tag in RESIDENTIAL else 'non_residential' if tag in NON_RESIDENTIAL else 'unknown'


def businesses(osm_poi, blds):
    out, bike_parking, bike_share, parking = [], [], [], []
    for el in osm_poi['elements']:
        t = el['tags']
        lat, lon = (el['lat'], el['lon']) if 'lat' in el else (el['center']['lat'], el['center']['lon'])
        x, y = to_local(lat, lon)
        a, shop = t.get('amenity'), t.get('shop')
        if a == 'bicycle_parking':
            bike_parking.append({'x': x, 'y': y, 'capacity': int(t['capacity']) if t.get('capacity', '').isdigit() else None})
            continue
        if a == 'bicycle_rental':
            bike_share.append({'name': t.get('name'), 'x': x, 'y': y, 'capacity': t.get('capacity'), 'operator': t.get('operator')})
            continue
        if a == 'parking':
            parking.append({'x': x, 'y': y, 'capacity': t.get('capacity'), 'access': t.get('access'), 'kind': t.get('parking')})
            continue
        if shop:
            cat = 'vacant' if shop == 'vacant' else 'food_retail' if shop in ('bakery', 'convenience', 'supermarket', 'greengrocer', 'butcher', 'deli', 'alcohol', 'wine', 'beverages', 'confectionery') else 'retail'
            kind = shop
        elif a in FOOD:
            cat, kind = 'food_service', a
        elif a in SERVICES:
            cat, kind = 'service', a
        elif t.get('office'):
            cat, kind = 'office', t['office']
        else:
            continue
        home = next((b for b in blds if point_in_ring(x, y, b['footprint'])), None)
        if home is None:
            near = min(blds, key=lambda b: math.dist(b['centroid'], (x, y)))
            home = near if math.dist(near['centroid'], (x, y)) < 20 else None
        out.append({'id': f"osm_{el['type'][0]}{el['id']}", 'name': t.get('name'), 'category': cat, 'kind': kind,
                    'x': x, 'y': y, 'side': 'north' if y > 0 else 'south',
                    'on_bloor': abs(y) <= FRONTAGE_M and -10 <= x <= SECTION_LENGTH_M + 10,
                    'building_id': home['id'] if home else None,
                    'address': ' '.join(v for v in (t.get('addr:housenumber'), t.get('addr:street')) if v) or None})
    for b in blds:
        b['business_ids'] = [o['id'] for o in out if o['building_id'] == b['id']]
        if b['use'] == 'unknown' and b['business_ids']:
            b['use'] = 'mixed'
    return out, bike_parking, bike_share, parking


def population(blds, floor_total):
    """Dasymetric estimate: neighbourhood census population spread over building floor area."""
    density = {n: NBHD_CENSUS[n][0] / floor_total[n] for n in NBHD_CENSUS if floor_total.get(n)}
    weight = {'residential': 1.0, 'unknown': 1.0, 'mixed': 0.5, 'non_residential': 0.0}
    for b in blds:
        d = density.get(b['neighbourhood'])
        b['residents_est'] = round(b['floor_area_m2_est'] * d * weight[b['use']], 1) if d else None
    xs = [p[0] for b in blds for p in b['footprint']]
    ys = [p[1] for b in blds for p in b['footprint']]
    x0, y0 = math.floor(min(xs) / GRID_M) * GRID_M, math.floor(min(ys) / GRID_M) * GRID_M
    cells = collections.Counter()
    for b in blds:
        if b['residents_est']:
            cx, cy = b['centroid']
            cells[(int((cx - x0) // GRID_M), int((cy - y0) // GRID_M))] += b['residents_est']
    return {
        'status': 'derived_estimate',
        'method': 'Each 2021 neighbourhood population is divided by the total massing floor area in that neighbourhood (all buildings), then assigned to buildings in the section by floor area x use weight (residential/unknown 1, mixed 0.5, non-residential 0). Floors = average height / 3.2 m.',
        'use_weights': weight, 'floor_height_m': FLOOR_HEIGHT_M,
        'people_per_floor_m2': {n: round(v, 5) for n, v in density.items()},
        'neighbourhood_census': {n: {'population_2021_25pct_sample': p, 'private_households': h} for n, p, h in ((k, *v) for k, v in NBHD_CENSUS.items())},
        'grid': {'cell_m': GRID_M, 'origin': [x0, y0], 'cells': [{'i': i, 'j': j, 'residents_est': round(v, 1)} for (i, j), v in sorted(cells.items())]},
        'section_residents_est': round(sum(cells.values())),
        'limits': ['Residential population only; no daytime, worker, student or visitor population',
                   'Building use is from OSM tags where present; untagged buildings are assumed residential',
                   'University neighbourhood includes the U of T campus, which lowers its per-floor density',
                   'Do not present cell values as census counts'],
    }


def stations(gtfs, raw):
    poi = load(f'{raw}/osm.json')['elements']
    entrances = [{'name': e['tags'].get('name'), 'lat': e['lat'], 'lon': e['lon'], 'x': to_local(e['lat'], e['lon'])[0], 'y': to_local(e['lat'], e['lon'])[1]}
                 for e in poi if e['tags'].get('railway') == 'subway_entrance']
    plat = {d['stop_name']: d for d in gtfs['departures'] if d['route'] in ('1', '2')}
    out = []
    for key, name in (('bathurst', 'Bathurst Station'), ('spadina', 'Spadina Station')):
        ps = [d for n, d in plat.items() if n.startswith(name)]
        out.append({'id': key, 'name': name,
                    'entrances': [e for e in entrances if (e['x'] < SECTION_LENGTH_M / 2) == (key == 'bathurst')],
                    'platforms': [{'stop_id': d['stop_id'], 'name': d['stop_name'], 'route': d['route'], 'x': to_local(d['lat'], d['lon'])[0], 'y': to_local(d['lat'], d['lon'])[1],
                                   'weekday_trips': d['weekday_trips'], 'trips_by_hour': d['trips_by_hour']} for d in ps]})
    return out


def main(raw, out_path):
    osm_h = load(f'{raw}/osm_highways.json')
    sig = signals(raw)
    ph = phases_observed(raw, {s['px'] for s in sig})
    for s in sig:
        s['observed_phases'] = ph.get(s['px'])
    cnts = counts(raw)
    flows = section_flows(cnts)
    polys = neighbourhood_polygons(raw)
    blds, floor_total = buildings(raw, polys)
    osm_building_use(blds, load(f'{raw}/osm_buildings.json'))
    biz, bike_parking, bike_share, parking = businesses(load(f'{raw}/osm.json'), blds)
    pop = population(blds, floor_total)
    gtfs = load(f'{raw}/gtfs_section.json')
    nodes = cross_streets(osm_h)
    for n in nodes:
        s = next((s for s in sig if s['on_bloor'] and not s['private_access'] and abs(s['x'] - n['x']) < 20), None)
        n['signal_px'] = s['px'] if s else None
    world = {
        'schema_version': 'world.v0',
        'id': 'bloor-spadina-bathurst',
        'title': 'Bloor St W, Bathurst St to Spadina Ave',
        'built_from': 'world/build/build_world.py',
        'frame': {'kind': 'street_aligned_metres', 'origin': 'Bloor/Bathurst centreline intersection (OSM node)',
                  'x': 'metres east along Bloor', 'y': 'metres north of the Bloor centreline',
                  'bloor_bearing_deg_ccw_from_east': round(math.degrees(THETA), 2), 'section_length_m': r1(SECTION_LENGTH_M),
                  'clip_bbox_wgs84': BBOX, 'origin_wgs84': from_local(0, 0)},
        'sources': SOURCES,
        'bloor': {'status': 'observed', 'source_id': 'osm', 'segments': bloor_attributes(osm_h), 'intersections': nodes},
        'signals': {'status': 'observed', 'source_id': 'signals', 'items': sig},
        'crosswalks': {'status': 'observed', 'source_id': 'pednet', 'items': crosswalks(raw)},
        'walk_network': {'status': 'observed', 'source_id': 'pednet', 'note': 'Centreline-based; sidewalk presence is an attribute of each street segment', 'segments': walk_network(raw)},
        'cycling_network': {'status': 'observed', 'source_id': 'cycling', 'segments': cycling(raw)},
        'counts': {'status': 'observed', 'source_id': 'tmc', 'intersections': cnts},
        'section_flows': {'status': 'derived', 'source_id': 'tmc', 'count_date': COUNT_DATE, 'interval_minutes': 15,
                          'note': 'Entry flows drive background traffic; arrive_* fields are the baseline calibration targets', 'intervals': flows},
        'transit': {'status': 'observed', 'source_id': 'gtfs', 'service_date': gtfs['service_date'], 'line2_run_seconds': gtfs['line2_run_seconds'],
                    'stations': stations(gtfs, raw), 'surface_departures': [d for d in gtfs['departures'] if d['route'] not in ('1', '2')]},
        'buildings': {'status': 'observed_geometry_with_derived_fields', 'source_id': 'massing',
                      'derived_fields': ['floors_est', 'floor_area_m2_est', 'use (from OSM tag join)', 'residents_est'], 'items': blds},
        'businesses': {'status': 'observed_presence', 'source_id': 'osm', 'note': 'OSM presence only: no sales, staffing or opening-hours data', 'items': biz},
        'bike_parking': {'status': 'observed', 'source_id': 'osm', 'items': bike_parking},
        'bike_share_stations': {'status': 'observed', 'source_id': 'osm', 'items': bike_share},
        'car_parking': {'status': 'observed', 'source_id': 'osm', 'items': parking},
        'population': pop,
        'signal_timing': SIGNAL_TIMING,
        'rules': RULES,
        'policy_levers': LEVERS,
        'assumptions': ASSUMPTIONS,
        'limits': LIMITS,
    }
    with open(out_path, 'w') as f:
        json.dump(world, f, separators=(',', ':'))
    print(f'buildings {len(blds)}, businesses {len(biz)} ({sum(b["on_bloor"] for b in biz)} on Bloor), signals {len(sig)}, '
          f'intersections {len(nodes)}, residents_est {pop["section_residents_est"]}, flows {len(flows)} intervals')


SOURCES = {
    'tmc': {'name': 'Traffic Volumes at Intersections for All Modes (raw 15-minute, 2020-2029)', 'url': 'https://open.toronto.ca/dataset/traffic-volumes-at-intersections-for-all-modes/', 'resource_id': '262469c2-abfe-4756-9068-4ea5c7ba1af7', 'licence': 'Open Government Licence - Toronto'},
    'signals': {'name': 'Traffic Signals Tabular', 'url': 'https://open.toronto.ca/dataset/traffic-signals-tabular/', 'licence': 'Open Government Licence - Toronto'},
    'signal_timing': {'name': 'Traffic Signal Timing (TransSuite phase status snapshot, 2024-06-20)', 'url': 'https://open.toronto.ca/dataset/traffic-signal-timing/', 'licence': 'Open Government Licence - Toronto'},
    'pednet': {'name': 'Pedestrian Network', 'url': 'https://open.toronto.ca/dataset/pedestrian-network/', 'licence': 'Open Government Licence - Toronto'},
    'cycling': {'name': 'Cycling Network', 'url': 'https://open.toronto.ca/dataset/cycling-network/', 'licence': 'Open Government Licence - Toronto'},
    'massing': {'name': '3D Massing 2025 (footprints and heights)', 'url': 'https://open.toronto.ca/dataset/3d-massing/', 'licence': 'Open Government Licence - Toronto'},
    'neighbourhoods': {'name': 'Neighbourhoods (158) boundaries and 2021 Neighbourhood Profiles', 'url': 'https://open.toronto.ca/dataset/neighbourhood-profiles/', 'licence': 'Open Government Licence - Toronto'},
    'gtfs': {'name': 'TTC Routes and Schedules (GTFS, calendar 2026-09-30 to 2026-10-31)', 'url': 'https://open.toronto.ca/dataset/ttc-routes-and-schedules/', 'licence': 'Open Government Licence - Toronto'},
    'osm': {'name': 'OpenStreetMap via Overpass API (streets, building tags, shops, amenities, subway entrances)', 'url': 'https://www.openstreetmap.org/copyright', 'licence': 'ODbL 1.0, (c) OpenStreetMap contributors', 'retrieved': '2026-10-17'},
}

SIGNAL_TIMING = {
    'status': 'assumption',
    'why': 'The City timing dataset is a phase-status snapshot without phase durations, so cycle and split lengths are not observed. It does confirm phase 2/6 (Bloor) and 4/8 (cross street) with pedestrian phases at the Bloor signals.',
    'cycle_s': 90, 'offset_s_by_px': {'321': 0, '509': 20, '2083': 40, '281': 55},
    'phases': [
        {'id': 'bloor_green', 'start_s': 0, 'duration_s': 50, 'vehicle_moves': ['bloor_eb', 'bloor_wb'], 'pedestrian_walk': ['along_bloor'], 'pedestrian_walk_s': 20},
        {'id': 'bloor_clearance', 'start_s': 50, 'duration_s': 6},
        {'id': 'cross_green', 'start_s': 56, 'duration_s': 28, 'vehicle_moves': ['cross_nb', 'cross_sb'], 'pedestrian_walk': ['across_bloor'], 'pedestrian_walk_s': 12},
        {'id': 'cross_clearance', 'start_s': 84, 'duration_s': 6},
    ],
    'pedestrian_speed_m_s': 1.0,
    'pedestrian_speed_source': 'Observed PEDWALKSPEED attribute on each signal: 1.0 m/s (flashing do-not-walk based on 1.2 m/s)',
}

RULES = [
    {'id': 'mode_edges', 'rule': 'An agent moves only along edges that permit its current mode: walk on sidewalks and crosswalks, bike in the cycle track (or a car lane where no track exists), drive in car lanes, ride transit between stops of a scheduled vehicle.'},
    {'id': 'no_teleport', 'rule': 'Position changes only by traversing edges at the mode speed, capped by congestion; no jumps.'},
    {'id': 'cross_at_crosswalks', 'rule': 'Changing side of Bloor is allowed only on a crosswalk that crosses Bloor. Signalized crosswalks may be entered only during the walk interval of the matching phase. Mid-block crossing is rejected.'},
    {'id': 'signals_for_vehicles', 'rule': 'Cars, buses and cyclists stop at a red for their movement and proceed in arrival order on green.'},
    {'id': 'board_scheduled_only', 'rule': 'Transit is boarded only at a station platform or stop when a scheduled departure (GTFS) arrives; the fare is charged by the fare rules in data/ttc_fare_context.json.'},
    {'id': 'enter_open_buildings', 'rule': 'A purchase or visit happens only after the agent reaches the building door and the business is open. No sales by narration.'},
    {'id': 'budgets', 'rule': 'Each agent has a money budget and a schedule; a late arrival to a fixed appointment is recorded as a cost.'},
    {'id': 'local_knowledge', 'rule': 'Agents observe their own edge, the next signal state, and transit arrival predictions, but never global state.'},
    {'id': 'fixed_actions', 'rule': 'Actions come from a fixed menu (walk_to, bike_to, drive_to, take_transit, wait, enter, purchase, skip_trip). The Game Master validates every action; invalid actions fall back to a default rule and are logged.'},
    {'id': 'same_seed', 'rule': 'Baseline and policy runs start from the same seed, people, schedule, weather and background flow.'},
]

LEVERS = [
    {'id': 'bloor_cycle_track', 'type': 'enum', 'values': ['protected', 'painted', 'none'], 'baseline': 'protected', 'effect': 'none removes the cycle-track edges; cyclists then share the car lane edges'},
    {'id': 'bloor_car_lanes_per_direction', 'type': 'int', 'values': [1, 2], 'baseline': 1, 'effect': 'capacity of the Bloor car-lane edges'},
    {'id': 'on_street_parking', 'type': 'bool', 'baseline': True, 'effect': 'curbside stopping for pickups and deliveries'},
    {'id': 'signal_cycle_s', 'type': 'int', 'range': [60, 120], 'baseline': 90},
    {'id': 'bloor_green_share', 'type': 'float', 'range': [0.4, 0.7], 'baseline': 0.56},
    {'id': 'adult_fare_cad', 'type': 'float', 'baseline': 3.30},
    {'id': 'line2_headway_multiplier', 'type': 'float', 'range': [0.5, 2.0], 'baseline': 1.0},
]

ASSUMPTIONS = [
    {'id': 'signal_timing', 'note': 'Cycle, splits and offsets are assumed (see signal_timing).'},
    {'id': 'bloor_cross_section', 'note': 'Schematic offsets: car lanes at y = +/-3 m, cycle tracks at +/-7 m, sidewalks at +/-12 m. Lane counts and cycleway types come from OSM tags.'},
    {'id': 'speeds', 'note': 'Walk 1.2 m/s (signal crossing 1.0 m/s observed), bike 4.5 m/s, car free-flow 40 km/h posted limit.'},
    {'id': 'building_use', 'note': 'Untagged OSM buildings count as residential; with a business inside they count as mixed.'},
    {'id': 'population', 'note': 'Residents per building are a dasymetric estimate (see population.method).'},
]

LIMITS = [
    'Counts are one weekday (2025-06-25), 14 hours; not an annual average',
    'Background flow reproduces observed counts by construction; only agent behaviour and the policy run are simulated',
    'Business presence from OSM; no revenue, staffing, or closure data',
    'Scheduled transit, not observed reliability or crowding',
    'This world is a 619 m section; do not scale its outputs to the corridor or the city',
]

if __name__ == '__main__':
    main(*sys.argv[1:])
