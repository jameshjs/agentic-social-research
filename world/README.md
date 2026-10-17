# Bloor section sandbox world

A rule-enforcing street environment for **one 619 m section of Bloor St W, from Bathurst St to Spadina Ave**. It holds subway stations at both ends, the 510 Spadina and 511 Bathurst streetcars crossing it, the protected cycle track installed in 2016, and a continuous shopping strip. Agents act inside it, and the Game Master rejects any action that breaks a rule. Both prepared questions can run here: removing the bike lane, and changing the fare.

**Status: candidate.** This does not change `experiment.v1` or any frozen contract. See the [PRD §17 entry](../prd.md#17-locked-decisions-and-implementation-gaps).

**Current founder target:** Integrate this candidate map/rule layer into the existing [`/experience/`](../experience/README.md) website so the TTC fare and cycle-track policies both run in this same 619 m world. The preview below is for development, not a new public site. Its local observations may ground scene geometry and background counts; persona demographics, spending, fare response and shop outcomes still need explicit source or assumption labels. Preserve existing inspector and chart features while moving them onto one event/result pipeline.

```sh
node --test world/test-sandbox.js          # 11 rule and data checks, offline
python3 -m http.server 4173                # from the repository root
open http://127.0.0.1:4173/world/preview.html
```

## What is in `data/world/bloor_spadina_bathurst.json`

| Layer | Source | Status |
| --- | --- | --- |
| Bloor lanes, cycleway type, speed limit, 8 cross-street intersections | OpenStreetMap | observed |
| 4 Bloor signals (PX 321, 509, 2083, 281), plus 7 nearby, pedestrian walk speed 1.0 m/s | City Traffic Signals | observed |
| Signal cycle, splits and offsets (90 s, Bloor green 50 s) | none published | **assumption** |
| Crosswalks across Bloor and side streets, sidewalk presence by street segment | City Pedestrian Network | observed |
| Cycle tracks and nearby routes | City Cycling Network | observed |
| Car, bike and pedestrian counts per 15 minutes, 06:00 to 20:00, Bathurst and Spadina on **25 Jun 2025**, Walmer/Robert on 15 Oct 2025 | City turning-movement counts | observed |
| Flows entering each end, and far-end arrivals as calibration targets | the same counts | derived |
| Line 2 departures per hour on both platforms, 81 to 90 s run time, plus surface routes | TTC GTFS, Wed 14 Oct 2026 | observed (scheduled) |
| 925 building footprints with heights | City 3D Massing 2025 | observed |
| Building use, from OSM tags joined to footprints | OpenStreetMap | derived (559 are untagged) |
| 243 businesses (140 facing Bloor), vacant storefronts, bike parking, Bike Share, parking lots | OpenStreetMap | observed presence only |
| Residents per building and a 25 m heat-map grid (about 3,400 people) | 2021 neighbourhood population spread over floor area | **derived estimate** |

## Rules the Game Master enforces (`sandbox.js`)

1. Each mode uses its own edges: walkers use sidewalks and crosswalks, cyclists the cycle track, drivers the car lanes, and transit riders station stairs and Line 2.
2. No teleporting: a move must start where the agent is.
3. Bloor can be crossed only on a mapped crosswalk. At a signal, the agent may step off only during the walk interval.
4. Vehicles and cyclists wait at the stop line for green.
5. Riders board the subway only at a scheduled departure. One fare is charged per trip.
6. A visit or purchase is recorded only at a business's door.
7. Unknown policy levers are refused, and the same seed replays the same events.

Every accepted move commits a `moved` event with its wait, travel time, fare and crosswalk. Every refused move commits an `action_rejected` event with its reason.

**Policy levers:**
- `bloor_cycle_track`: `protected`, `painted` or `none`. With `none`, the track edges are removed and cyclists share the car lanes; that distance is recorded as `shared_with_cars_m`.
- `bloor_car_lanes_per_direction`
- `on_street_parking`
- `signal_cycle_s`
- `bloor_green_share`
- `adult_fare_cad`
- `line2_headway_multiplier`

## Known gaps

- **Background traffic is entry flow only.** Car travel time uses a volume-delay function on the observed entering flow. Between the two ends, eastbound cars gain 3.3% and westbound cars lose 7.8% through the six minor cross streets. A routed background model should reproduce that exchange (`calibrationReport`) before any policy runs are compared.
- **Cyclists in car lanes get no penalty yet.** They move at bike speed. Removing the track changes exposure and the persona's comfort, not travel time. No injury, conflict or speed effect is modelled.
- **Shops have presence data only.** There are no sales, opening hours or staffing figures; any shop response needs an explicit synthetic rule.
- **Residents are an estimate.** The figures cover residential population only. Untagged buildings are counted as residential, and the University neighbourhood includes the campus.
- **The cross-section is schematic.** Car lanes sit at ±3 m, cycle tracks at ±7 m and sidewalks at ±12 m.

## Rebuilding

```sh
world/build/download.sh /tmp/bloor-raw                  # about 250 MB, outside the repo
python3 world/build/extract_gtfs.py /tmp/bloor-raw/gtfs /tmp/bloor-raw/gtfs_section.json
pip install --target /tmp/pylib pyshp
PYTHONPATH=/tmp/pylib python3 world/build/build_world.py /tmp/bloor-raw data/world/bloor_spadina_bathurst.json
```

**Licences:**
- City of Toronto data: Open Government Licence – Toronto.
- Map data: © OpenStreetMap contributors, ODbL 1.0.
