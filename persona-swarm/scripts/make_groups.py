# Builds the demographic groups experiments run on: a fixed sample of up to 20 adult personas per group, drawn from
# the cached Nemotron pool, plus a display card for every member. Groups are defined by labels in group_defs.json.
# Usage: python scripts/make_groups.py                                         -> data/groups.json
#        python scripts/make_groups.py --add women_south "Women, South US" sex=Female region=South age=18-64
import json, random, re, sys
from collections import Counter
from fetch_personas import DEGREE
from run_swarm import ROOT, load_jsonl

SEED, SIZE = 7, 20
DEFS = ROOT / "scripts" / "group_defs.json"
REGIONS = {  # US Census Bureau regions; Puerto Rico sits outside them
    "Northeast": "CT ME MA NH RI VT NJ NY PA", "Midwest": "IL IN MI OH WI IA KS MN MO NE ND SD",
    "South": "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX", "West": "AZ CO ID MT NV NM UT WY AK CA HI OR WA"}
REGION_OF = {s: r for r, states in REGIONS.items() for s in states.split()}

def labelled(p):
    """The persona plus the derived labels a group definition can use."""
    return {**p, "region": REGION_OF.get(p["state"], "Other"),
            "degree": "yes" if p["education_level"] in DEGREE else "no"}

def matches(p, where):
    for key, want in where.items():
        v = p.get(key)
        if key == "age":
            if not want[0] <= v <= want[1]:
                return False
        elif isinstance(want, list):
            if v not in want:
                return False
        elif v != want:
            return False
    return True

def parse_where(pairs):
    """CLI form: sex=Female  marital_status=divorced,widowed  age=65-120."""
    where = {}
    for pair in pairs:
        key, _, value = pair.partition("=")
        if not value:
            sys.exit(f"bad filter {pair!r}: use key=value")
        if key == "age":
            lo, _, hi = value.partition("-")
            where[key] = [int(lo), int(hi or 120)]
        else:
            where[key] = value.split(",") if "," in value else value
    return where

def card(p):
    """What the frontend shows for one persona. Nemotron has no name field, but every narrative field names the
    person, sometimes after an opening phrase ("An avid hiker, William Black…") or by first name only."""
    fields = [p.get(f) or "" for f in ("sports_persona", "professional_persona", "arts_persona", "persona")]
    full = Counter(n for f in fields for n in set(re.findall(r"\b([A-Z][a-z'’-]+ [A-Z][\w'’-]+)\b", f)))
    starts = Counter(f.split(" ", 1)[0] for f in fields if f)
    # shortcut: a place named in 2+ fields could still win; the name is display-only, so only the home city is excluded
    name = next((n for n, c in full.most_common() if c >= 2 and n != p["city"]), None) or next(
        (w for w, c in starts.most_common(1) if c >= 3 and w[:1].isupper()), None)
    first = re.split(r"(?<=[.!?])\s", p["persona"], maxsplit=1)[0]
    return {"uuid": p["uuid"], "name": name, "age": p["age"], "sex": p["sex"],
            "education_level": p["education_level"], "marital_status": p["marital_status"],
            "occupation": p["occupation"].replace("_", " "), "city": p["city"], "state": p["state"],
            "region": p["region"], "summary": first}

def build(defs):
    pool = [labelled(p) for p in load_jsonl(ROOT / "data" / "personas" / "pool_2000.jsonl") if p["age"] >= 18]
    groups = []
    for d in defs:
        eligible = [p for p in pool if matches(p, d["where"])]
        if not eligible:
            sys.exit(f"group {d['id']!r} matches no adult persona: {d['where']}")
        # the same group id always gets the same people, so reruns compare like with like
        members = random.Random(f"{SEED}:{d['id']}").sample(eligible, min(SIZE, len(eligible)))
        groups.append({"id": d["id"], "label": d["label"], "where": d["where"], "size": len(members),
                       "eligible": len(eligible), "members": [card(p) for p in members]})
    return groups

def main():
    spec = json.loads(DEFS.read_text())
    if sys.argv[1:2] == ["--add"]:
        if len(sys.argv) < 5:
            sys.exit('usage: make_groups.py --add <id> "<label>" key=value [key=value ...]')
        gid, label = sys.argv[2], sys.argv[3]
        spec["groups"] = [g for g in spec["groups"] if g["id"] != gid] + [
            {"id": gid, "label": label, "where": parse_where(sys.argv[4:])}]
        build(spec["groups"][-1:])  # fail before saving a definition that matches nobody
        DEFS.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    groups = build(spec["groups"])
    out = ROOT / "data" / "groups.json"
    out.write_text(json.dumps({"source": "nvidia/Nemotron-Personas-USA (CC BY 4.0), synthetic personas",
                               "groups": groups}, indent=1))
    print(f"{out}:")
    for g in groups:
        print(f"  {g['id']:22s} {g['size']:2d} of {g['eligible']:4d} eligible  {g['label']}")

if __name__ == "__main__":
    main()
