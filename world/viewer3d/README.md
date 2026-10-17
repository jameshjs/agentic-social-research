# Bloor 3D viewer

An interactive three.js view of the Bloor St W sandbox world (Bathurst St to Spadina Ave). It is **read-only**: it loads `data/world/bloor_spadina_bathurst.json`, deep-clones and freezes it, and never writes to it. It also loads `world/sandbox.js` unchanged to replay a seeded run.

![Bloor 3D viewer](screenshot.png)

```sh
python -m http.server 4173          # from the repository root
# open http://127.0.0.1:4173/world/viewer3d/
```

`standalone.html` is the same page with the world JSON, `sandbox.js` and `viewer.js` inlined, for sharing as one file. It opens straight from disk. three.js (`0.160.0`, pinned) still loads from cdn.jsdelivr.net, so it needs a network connection. Rebuild it after changing the viewer or the world:

```sh
node world/viewer3d/build-standalone.mjs
```

## What you see, and where it comes from

| Layer | Data | Status |
| --- | --- | --- |
| Buildings | 925 footprints extruded to `height_m` (City 3D Massing 2025), coloured by `use` | observed geometry, derived use |
| Residents | `residents_est` per building and the 25 m `population.grid` | derived estimate |
| Streets | Bloor curb at ±8.8 m (from the crosswalks across Bloor), side streets from intersection legs and nearby signals, sidewalks, laneways and walkways from `walk_network` | observed, simplified |
| Crosswalks | `crosswalks.items` endpoints, drawn as ladder bars | observed |
| Cycling | Bloor cycle-track paint from `cycling_network` Bloor St W "Cycle Track" segments, other routes, Bike Share docks, bike parking | observed |
| Transit | Line 2 entrances at their OSM positions, platforms and tunnel drawn faintly underground, surface stops from `surface_departures` | observed |
| Businesses | 243 businesses: awnings on Bloor frontages, pins above buildings elsewhere, tinted by category | observed presence |
| Signals | Poles at the 4 Bloor signals, with heads showing `signalAt(px, t)` from the sandbox; the 7 other signals are drawn unlit | observed location, **assumed** timing |
| Agents | Walkers, transit riders, cyclists and cars from a seeded `createSandbox` run | simulated |
| Streetcars and trains | 510 and 511 streetcars, Line 2 trains | scheduled (GTFS) |

Click anything to open the inspector. Each value carries an observed, derived, assumed or simulated tag.

## What is animated

- **Agents run in the sandbox.** For the chosen 30 minutes (08:00, 12:30 or 17:00), the viewer spawns agents from the observed 15-minute `section_flows`, scaled to 15–100%. It spawns cars and cyclists entering each end, walkers along Bloor (60% walk to a business door and `enter` it), walkers crossing at Bathurst and Spadina, and some transit riders. Each one calls `sb.travel()`, and the viewer animates the resulting `moved` events along the sandbox graph edges. Pedestrians wait at the walk signal, and vehicles queue at the stop line, exactly as long as the events say. Transit riders vanish down the station stairs and ride Line 2 at the sandbox's scheduled departure. The seed is fixed (7), so every replay is identical.
- **Policy rerun.** Changing the cycle-track select reruns the sandbox with `bloor_cycle_track` set to `protected`, `painted` or `none`, using the same seed and spawn plan. It also runs the baseline, and the dashboard shows the mean trip minutes for both, plus metres cycled in car lanes. The street drops the posts or paint to match.
- **Streetcars and Line 2 come from GTFS, not the sandbox.** Departure times are spaced evenly within each hour from `trips_by_hour`. This is the same rule `sandbox.js` uses for boarding, so trains leave just as riders board. Line 2 speed comes from the observed median run time between platforms. Streetcars use an assumed 6 m/s with no dwell, and the 510 descends into the Spadina Station loop.
- **Signals** change colour from `sandbox.signalAt()`, which uses the assumed 90 s plan.

Hash parameters set the view, which is useful for links and screenshots: `#preset=flyover&t=08:12&night=1&pause=1&track=none`, or a camera as `cam=x,y,h,targetX,targetY,targetH` in world metres.

## Coordinates

The world's own frame is used throughout: x is metres east along Bloor from the Bathurst centreline, and y is metres north of the Bloor centreline. In three.js these map to `X = x`, `Y = height` and `Z = -y`. GTFS stop latitudes and longitudes are converted with the same transform as `world/build/section.py`. The sandbox cross-section is schematic: car lanes at ±3 m, the cycle track at ±7 m and sidewalks at ±12 m. For display only, the viewer maps those offsets to ±1.7, ±7.5 and ±10.9 m, so agents sit inside the drawn 17.6 m curb-to-curb street. Side-street agents run straight along each intersection's x.

## Not used, or used only partly

- `counts.intersections` (raw turning movements) are not drawn. The viewer uses the derived `section_flows` instead.
- `bloor.segments` lane tags are not drawn lane by lane. The street shows one lane each way plus the cycle track.
- `car_parking` is drawn as signs only, because lots have points but no polygons.
- `walk_network` sidewalk lines are drawn, but road widths come from OSM road class, not from measurements.
- The positions of entrances and stations in the sandbox graph are schematic. Agents use the stairs at the sidewalk, while the pavilions sit at their real OSM points.
- At night, lit windows and the glow on the pavement are decorative, not data.
