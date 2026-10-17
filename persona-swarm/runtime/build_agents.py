# Builds data/city/agents.json: 100 locked agent bundles shared by both policies (RUNTIME.md). Each bundle is a
# Twin-anchored resident or Bloor shop worker: one Twin respondent's given answers rendered by autoresearch/formats.py
# (full_relative, as tuned; reused, not copied) without party and ideology, plus a "Your situation in Toronto" block.
#   Roles: mode mix from the Bloor world's observed counts; shop owners and workers from its Bloor businesses.
#   Neighbourhood, low income (so Fair Pass and the income band), car and bike: separate census marginals in data/,
#   each drawn on its own (no joint distribution), labelled synthetic.
#   Donors: matched on income band from the 240 loaded respondents' given answers (never answer sheets), seeded.
# 40 bundles are world deciders, stratified by role. Usage: python3 runtime/build_agents.py [--seed 42]
import argparse, hashlib, json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                          # persona-swarm/
REPO = ROOT.parent
OUT = ROOT / "data" / "city" / "agents.json"
sys.path.insert(0, str(ROOT / "autoresearch"))
import formats  # noqa: E402

N_AGENTS, N_DECIDERS, N_OWNERS, N_WORKERS = 100, 40, 4, 8   # shop roles: a stated assumption, not a census count
BUNDLE_VERSION, ROUND = "agents-v1", "009"
MODEL = {"agent": {"model": "claude-haiku-5-5", "effort": "low"}, "orchestrator": {"model": "claude-opus-5-5", "effort": "medium"}}
ATTRIBUTION = ("Persona sheets use Twin-2K-500 (LLM-Digital-Twin/Twin-2K-500, https://huggingface.co/datasets/LLM-Digital-Twin/"
               "Twin-2K-500), CC BY 4.0: given answers of US survey respondents, party and ideology removed.")
NOTE = "US survey respondent's attitudes placed in a synthetic Toronto role"
# US party and ideology are left out of city calls: they say nothing about a Toronto trip and would import US partisanship.
POLITICS = ("In politics today, do you consider yourself a", "In general, would you describe your political views as")
BANDS = ["Less than $30,000", "$30,000-$50,000", "$50,000-$75,000", "$75,000-$100,000", "$100,000 or more"]
BAND_WEEKLY = {BANDS[0]: 423, BANDS[1]: 769, BANDS[2]: 1202, BANDS[3]: 1683, BANDS[4]: 2404}  # band midpoint / 52, CAD at par
MODES = ("driver", "cyclist", "pedestrian", "transit_rider")
PREFERENCE = {"driver": {"drive": 5, "bus": 2}, "cyclist": {"bike_bloor": 4.5, "bike_detour": 1.5, "bus": 2},
              "pedestrian": {"walk": 5, "bus": 1.5}, "transit_rider": {"bus": 5, "walk": 1.5}}
MODE_TEXT = {"driver": "You usually drive.", "cyclist": "You usually cycle.", "pedestrian": "You walk almost everywhere.",
             "transit_rider": "You usually take the TTC (Line 2 or the 510/511 streetcars)."}
NAMES = ["Alex", "Avery", "Blake", "Cameron", "Casey", "Charlie", "Dakota", "Drew", "Elliot", "Emerson", "Finley", "Frankie",
         "Harper", "Hayden", "Jamie", "Jesse", "Jordan", "Jules", "Kai", "Kendall", "Lee", "Logan", "Marley", "Morgan", "Noel",
         "Parker", "Peyton", "Quinn", "Reese", "Riley", "River", "Robin", "Rowan", "Sage", "Sam", "Shay", "Skyler", "Taylor"]


def u(seed, *parts):
    """A seeded uniform draw in [0, 1) from sha256, so every draw is reproducible and independent of order."""
    return int(hashlib.sha256("|".join(map(str, (seed,) + parts)).encode()).hexdigest()[:13], 16) / 16 ** 13


def allocate(n, weights):
    """Largest-remainder allocation of n slots to weighted keys."""
    total = sum(weights.values())
    raw = {k: n * w / total for k, w in weights.items()}
    out = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[: n - sum(out.values())]:
        out[k] += 1
    return out


def marginals():
    world = json.loads((REPO / "data" / "world" / "bloor_spadina_bathurst.json").read_text())
    hoods = {r["name"]: r for r in json.loads((REPO / "data" / "bloor_bike_lane_baseline.json").read_text())["neighbourhoods"]}
    census = world["population"]["neighbourhood_census"]
    counts = {"vehicles": 0, "pedestrians": 0, "bicycles": 0}
    for it in world["counts"]["intersections"]:
        if it["count_date"] != "2025-06-25":                # the two section ends, counted the same day
            continue
        for iv in it["intervals"]:
            for k, v in iv.items():
                if "_cars_" in k or "_truck_" in k: counts["vehicles"] += v
                elif k.endswith("_peds"): counts["pedestrians"] += v
                elif k.endswith("_bike"): counts["bicycles"] += v
    transit = sum(hoods[h]["public_transit_commuters"] for h in census)
    walk = sum(hoods[h]["walk_commuters"] for h in census)
    weights = {"driver": counts["vehicles"], "cyclist": counts["bicycles"],
               "pedestrian": counts["pedestrians"] * walk / (transit + walk),       # pedestrians include people walking to Line 2,
               "transit_rider": counts["pedestrians"] * transit / (transit + walk)} # split by the census transit:walk commute ratio
    neighbourhoods = [{"name": h, "population": census[h]["population_2021_25pct_sample"],
                       "low_income": hoods[h]["low_income_lim_at_prevalence_pct"] / 100,
                       "car": hoods[h]["car_truck_van_commuters"] / hoods[h]["all_mode_commuters"],
                       "bike": hoods[h]["bicycle_commuters"] / hoods[h]["all_mode_commuters"],
                       "median": hoods[h]["median_after_tax_household_income_cad"]} for h in census]
    shops = [b for b in world["businesses"]["items"] if b["on_bloor"] and b["category"] != "vacant"]
    return counts, weights, neighbourhoods, shops


def city_sheet(pid):
    blocks = formats.render(pid, "full_relative").split("\n\n")
    kept = [b for b in blocks if not b.startswith(POLITICS)]
    assert len(blocks) - len(kept) == 2, f"respondent {pid}: expected exactly the party and ideology questions"
    return "\n\n".join(kept)


def fallback_parameters(pid, low_income):
    """The runner's fixture rule needs numbers; take them from the donor's own answers (spending, risk)."""
    m = formats.relative_measures(formats.blocks(pid))
    spend, risk = m["spend"] or 6, m["risk_averse"] if m["risk_averse"] is not None else 0.5
    cost = round(min(1.6, max(0.6, 1 + (6 - spend) * 0.08 + (0.3 if low_income else 0))), 2)
    safety = round(min(1.8, max(0.3, 0.5 + risk * 1.5)), 2)
    return cost, safety


def build(seed=42):
    counts, weights, hoods, shops = marginals()
    pool = [json.loads(l) for l in (ROOT / "data" / "twin" / "respondents.jsonl").read_text().splitlines()]
    resident_modes = allocate(N_AGENTS - N_OWNERS - N_WORKERS, weights)
    shop_modes = allocate(N_OWNERS + N_WORKERS, weights)
    shuffle = lambda xs, tag: [x for _, x in sorted(enumerate(xs), key=lambda ix: u(seed, tag, ix[0]))]
    business = shuffle([m for m in MODES for _ in range(shop_modes[m])], "shop-mode")
    slots = [("resident", m) for m in MODES for _ in range(resident_modes[m])]
    slots = shuffle(slots + [("shop_owner" if i < N_OWNERS else "shop_worker", m) for i, m in enumerate(business)], "slot")
    all_names = [f"{n} {chr(65 + k)}." for n in NAMES for k in range(26)]
    used, names, agents = set(), set(), []
    shop_pick = sorted(shops, key=lambda b: u(seed, "shop", b["id"]))
    for i, (kind, mode) in enumerate(slots):
        aid = f"a{i + 1:03d}"
        hood = next(h for h, x in zip(hoods, _cumulative([h["population"] for h in hoods])) if u(seed, aid, "hood") * x[1] < x[0])
        low_income = u(seed, aid, "low_income") < hood["low_income"]
        band = BANDS[0] if low_income else (BANDS[1 + int(u(seed, aid, "band") * 2)] if u(seed, aid, "median") < 0.5
                                           else BANDS[3 + int(u(seed, aid, "band") * 2)])
        has_car = mode == "driver" or u(seed, aid, "car") < hood["car"]
        has_bike = mode == "cyclist" or u(seed, aid, "bike") < hood["bike"]
        fare = "fair_pass" if low_income else "adult"
        ok = [r for r in pool if r["income"] == band and r["pid"] not in used and not (fare == "fair_pass" and r["age"] == "65+")]
        donor = min(ok, key=lambda r: u(seed, aid, "donor", r["pid"]))
        used.add(donor["pid"])
        name = min((n for n in all_names if n not in names), key=lambda n: u(seed, aid, "name", n))
        names.add(name)
        cost, safety = fallback_parameters(donor["pid"], low_income)
        weekly = BAND_WEEKLY[band]
        pref = dict(PREFERENCE[mode])
        if has_car and mode != "driver": pref["drive"] = 2
        if has_bike and mode != "cyclist": pref.update({"bike_bloor": 2, "bike_detour": 1})
        shop = shop_pick.pop(0) if kind != "resident" else None
        work = {"id": "work", "purpose": "commute", "destination": "local_shop" if shop else "workplace",
                "distance_km": round(1.5 + u(seed, aid, "commute") * 5.5, 1)}
        errand = {"id": "shop", "purpose": "errand", "destination": "local_shop", "distance_km": round(1 + u(seed, aid, "errand") * 4, 1),
                  "shop": "local", "basket_cad": round(10 + u(seed, aid, "basket") * 15), **({"time_window": "late"} if u(seed, aid, "late") < 0.3 else {}),
                  **({"detour_destination": "plaza"} if has_bike else {})}
        role = kind if shop else mode
        person = {"id": aid, "name": name, "role": role, "home": f"home_{aid}", "weekly_income_cad": weekly,
                  "disposable_cash_weekly_cad": round(weekly * 0.07), "fare_category": fare, "has_car": has_car, "has_bike": has_bike,
                  "max_walk_km": 6 if mode == "pedestrian" else 3, "cost_sensitivity": cost, "time_sensitivity": 1,
                  "bike_safety_sensitivity": safety, "purchase_chance": 1, "mode_preference": pref, "routine": [work, errand],
                  "mode": mode, "neighbourhood": hood["name"], "low_income": low_income, "persona_source": "twin_anchored_v1",
                  "synthetic": True, "note": NOTE}
        if shop:
            person["shop"] = {"kind": shop["kind"], "category": shop["category"], "side": shop["side"], "osm_id": shop["id"]}
        situation = [
            f"You live in {hood['name']}, near Bloor St W between Bathurst St and Spadina Ave.",
            (f"You {'own' if kind == 'shop_owner' else 'work at'} a {shop['kind'].replace('_', ' ')} on Bloor St W. " if shop else "") + MODE_TEXT[mode],
            f"Your income is about ${weekly} a week. After rent and essentials you have about ${person['disposable_cash_weekly_cad']} a week for everything else.",
            f"You {'have' if has_car else 'do not have'} a car. You {'own' if has_bike else 'do not own'} a bike.",
            f"You pay the {'Fair Pass discount' if fare == 'fair_pass' else 'full adult'} TTC fare.",
            f"You walk up to about {person['max_walk_km']} km.",
            f"Your regular trips: {'to the shop where you work' if shop else 'to work'}, {work['distance_km']} km; shopping at a neighbourhood shop, "
            f"{errand['distance_km']} km{', usually late in the day' if errand.get('time_window') else ''}, about ${errand['basket_cad']} a visit.",
        ]
        sheet = (city_sheet(donor["pid"]) + "\n\nYour situation in Toronto (where you live now; it replaces the location and money "
                 "details above):\n" + "\n".join(f"- {s}" for s in situation))
        agents.append({**person, "bundle_version": BUNDLE_VERSION, "instructions_round": ROUND, "model": MODEL, "attribution": ATTRIBUTION,
                       "match_keys": {"income_band": band, "age_band": donor["age"], "sex": donor["sex"], "donor_pid": donor["pid"], "donor_set": donor["set"]},
                       "situation": situation, "persona_sheet": sheet})
    deciders, edge = choose_deciders(agents, seed)
    for a in agents:
        a["decider"] = a["id"] in deciders
    return {
        "schema": "persona-swarm.agents.v1", "bundle_version": BUNDLE_VERSION, "instructions_round": ROUND, "model": MODEL,
        "attribution": ATTRIBUTION, "note": NOTE, "seed": seed, "agents_count": len(agents), "deciders": sorted(deciders), "edge_cases": edge,
        "roster": {
            "mode_weights": {k: round(v / sum(weights.values()), 3) for k, v in weights.items()},
            "counts": {**counts, "source": "data/world/bloor_spadina_bathurst.json counts, Bathurst and Spadina, 25 Jun 2025, 06:00-20:00"},
            "residents_by_mode": resident_modes, "shop_roles": {"shop_owner": N_OWNERS, "shop_worker": N_WORKERS, "modes": shop_modes},
            "rules": [
                "Mode weights: vehicles, bicycles and pedestrians counted at both section ends; pedestrians split into walkers and TTC riders by the "
                "Annex, University and Palmerston-Little Italy census transit:walk commute ratio. Counts include through traffic, so drivers outweigh "
                "the residents' census car commute share.",
                "Shop owners (4) and workers (8): an assumption; each is placed at a distinct non-vacant Bloor-facing OSM business, named by type only.",
                "Neighbourhood by 2021 population; low income by that neighbourhood's LIM-AT prevalence; car and bike by its car and bicycle commute shares. "
                "Each is drawn on its own. Drivers have a car and cyclists a bike by role.",
                "Low income gives the Fair Pass fare and the 'Less than $30,000' band (Fair Pass uses 75% of LIM-AT and take-up is unpublished, so this "
                "overstates Fair Pass use). Otherwise the band is split at the neighbourhood median: $30-50k or $50-75k below, $75-100k or $100k+ above.",
                "Weekly income: the band midpoint / 52, CAD at par with Twin's USD family-income bands; cash after essentials 7% of it, as in the fixtures.",
                "Donors: an unused Twin respondent in the same income band (under 65 for Fair Pass), lowest seeded hash; age band and sex are the donor's.",
                "Fallback-rule numbers: cost sensitivity from the donor's spending answer (plus 0.3 if low income), bike safety sensitivity from the "
                "donor's lottery risk aversion; mode preference from the role.",
            ],
        },
        "agents": agents,
    }


def _cumulative(xs):
    total, run, out = sum(xs), 0, []
    for x in xs:
        run += x
        out.append((run, total))
    return out


def choose_deciders(agents, seed):
    """40 deciders stratified by role (at least one per role), plus edge cases: a Fair Pass TTC rider, a carless shop worker."""
    by_role = {}
    for a in agents:
        by_role.setdefault(a["role"], []).append(a)
    quota = allocate(N_DECIDERS, {r: len(v) for r, v in by_role.items()})
    for r in quota:
        quota[r] = max(1, quota[r])
    edge = {}
    for label, test in (("fair_pass_transit_rider", lambda a: a["role"] == "transit_rider" and a["fare_category"] == "fair_pass"),
                        ("carless_shop_worker", lambda a: a["role"] == "shop_worker" and not a["has_car"])):
        hit = sorted((a for a in agents if test(a)), key=lambda a: u(seed, "edge", a["id"]))
        if not hit:
            raise SystemExit(f"no agent fits the edge case {label}; change the seed")
        edge[label] = hit[0]["id"]
    chosen = set(edge.values())
    for role, members in by_role.items():
        have = sum(1 for a in members if a["id"] in chosen)
        for a in sorted(members, key=lambda a: u(seed, "decider", a["id"])):
            if have >= quota[role]:
                break
            if a["id"] not in chosen:
                chosen.add(a["id"])
                have += 1
    while len(chosen) > N_DECIDERS:                                 # edge cases may push a role over quota: trim the largest
        role = max(by_role, key=lambda r: sum(1 for a in by_role[r] if a["id"] in chosen))
        drop = next(a["id"] for a in sorted(by_role[role], key=lambda a: -u(seed, "decider", a["id"])) if a["id"] in chosen and a["id"] not in edge.values())
        chosen.discard(drop)
    return chosen, edge


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    data = build(ap.parse_args().seed)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    from collections import Counter
    print(f"{OUT.relative_to(REPO)}: {data['agents_count']} agents, {len(data['deciders'])} deciders, "
          f"{OUT.stat().st_size / 1e6:.1f} MB")
    print("roles", dict(Counter(a["role"] for a in data["agents"])), "deciders", dict(Counter(a["role"] for a in data["agents"] if a["decider"])))
    print("fare", dict(Counter(a["fare_category"] for a in data["agents"])), "car", sum(a["has_car"] for a in data["agents"]),
          "bike", sum(a["has_bike"] for a in data["agents"]), "bands", dict(Counter(a["match_keys"]["income_band"] for a in data["agents"])))
    print("edge cases", data["edge_cases"], "mode weights", data["roster"]["mode_weights"])
