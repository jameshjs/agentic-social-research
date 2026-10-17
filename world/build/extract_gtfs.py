"""Scheduled TTC service at stops inside the Bloor section, from the TTC GTFS feed.

Usage: python3 world/build/extract_gtfs.py <unzipped_gtfs_dir> <out.json> [YYYYMMDD]
Output: departures per stop/route/direction by hour, plus the scheduled Line 2
run time between Bathurst and Spadina platforms. Scheduled trips, not ridership.
"""
import collections
import csv
import json
import statistics
import sys

from section import BBOX

W, S, E, N = BBOX
LINE2_PLATFORMS = {'13760': 'bathurst_eb', '13759': 'bathurst_wb', '13852': 'spadina_eb', '13851': 'spadina_wb'}


def hms(t):
    h, m, s = (int(x) for x in t.zfill(8).split(':'))
    return h * 3600 + m * 60 + s


def main(g, out, date='20261014'):
    active = set()
    weekday = 'wednesday'
    for r in csv.DictReader(open(f'{g}/calendar.txt')):
        if r['start_date'] <= date <= r['end_date'] and r[weekday] == '1':
            active.add(r['service_id'])
    for r in csv.DictReader(open(f'{g}/calendar_dates.txt')):
        if r['date'] == date:
            (active.add if r['exception_type'] == '1' else active.discard)(r['service_id'])
    routes = {r['route_id']: r for r in csv.DictReader(open(f'{g}/routes.txt'))}
    trips = {r['trip_id']: r for r in csv.DictReader(open(f'{g}/trips.txt')) if r['service_id'] in active}
    stops = {r['stop_id']: r for r in csv.DictReader(open(f'{g}/stops.txt'))
             if W <= float(r['stop_lon']) <= E and S <= float(r['stop_lat']) <= N}
    by_hour = collections.defaultdict(collections.Counter)
    platform_times = collections.defaultdict(dict)
    for r in csv.DictReader(open(f'{g}/stop_times.txt')):
        sid, tid = r['stop_id'], r['trip_id']
        if sid not in stops or tid not in trips:
            continue
        t = trips[tid]
        sec = hms(r['departure_time'])
        by_hour[(sid, t['route_id'], t['direction_id'], t['trip_headsign'])][sec // 3600] += 1
        if sid in LINE2_PLATFORMS:
            platform_times[tid][LINE2_PLATFORMS[sid]] = sec
    deps = []
    for (sid, rid, d, head), hc in by_hour.items():
        s, rt = stops[sid], routes[rid]
        deps.append({
            'stop_id': sid, 'stop_name': s['stop_name'], 'lat': float(s['stop_lat']), 'lon': float(s['stop_lon']),
            'route': rt['route_short_name'], 'route_name': rt['route_long_name'], 'route_type': int(rt['route_type']),
            'direction_id': d, 'headsign': head, 'weekday_trips': sum(hc.values()),
            'trips_by_hour': {str(h): c for h, c in sorted(hc.items())},
        })
    deps.sort(key=lambda x: (x['route'], x['stop_name'], x['direction_id'], x['headsign']))
    eb = [v['spadina_eb'] - v['bathurst_eb'] for v in platform_times.values() if {'spadina_eb', 'bathurst_eb'} <= v.keys() and v['spadina_eb'] > v['bathurst_eb']]
    wb = [v['bathurst_wb'] - v['spadina_wb'] for v in platform_times.values() if {'spadina_wb', 'bathurst_wb'} <= v.keys() and v['bathurst_wb'] > v['spadina_wb']]
    json.dump({
        'service_date': date, 'service_day': weekday,
        'line2_run_seconds': {'eastbound_bathurst_to_spadina_median': statistics.median(eb), 'westbound_spadina_to_bathurst_median': statistics.median(wb), 'trips_measured': len(eb) + len(wb)},
        'departures': deps,
    }, open(out, 'w'), indent=1)
    print(f'{len(deps)} stop/route/direction rows; line 2 run s: eb {statistics.median(eb)}, wb {statistics.median(wb)}')


if __name__ == '__main__':
    main(*sys.argv[1:])
