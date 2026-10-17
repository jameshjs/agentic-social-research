# Frozen scorer for the persona tuning loop (PLAN.md Task 3). Grades persona-agent answers against real Twin-2K-500
# respondents on four checks (right person, right spread, right group gaps, steady), against the baselines, and against
# the benchmark marks. Check and final answer sheets and consistency keys are read from outside the repo (ADR 0002);
# only aggregate numbers leave this module. Nobody edits this file during the loop: every score records its SHA-256.
# Usage: python3 autoresearch/evaluate.py --set check answers.json      (answers.json = {pid: {item_id: int}})
import argparse, collections, hashlib, itertools, json, math, re
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

SELF = Path(__file__).resolve()
ROOT = SELF.parent.parent                                   # persona-swarm/
LOCKED = Path("~/.cache/persona-swarm/locked").expanduser()
SETS, FAMILIES = ("tuning", "check", "final"), ("policy", "pricing")
CHECKS = ("right_person", "right_spread", "right_group_gaps", "steady")
MARKS = {"right_person": 0.70, "right_spread": 0.80, "right_group_gaps": 0.80}
SPLITS = {"age": ("18-29", "65+"), "sex": ("Male", "Female"), "income_band": ("under_50k", "100k_plus"),
          "party": ("Democrat", "Republican")}
MIN_GROUP, MIN_GAP, MAX_MISSING, MIN_NOISE = 5, Fraction(1, 10), 0.05, 0.01
EXPERIMENTS = {  # randomised decision-puzzle experiments: each respondent saw one condition (wave-4 block names)
    "absolute_vs_relative": ("Absolute vs. relative - calculator", "Absolute vs. relative - jacket"),
    "allais": ("Allais Form 1", "Allais Form 2"),
    "anchoring_africa": ("Anchoring - African countries high", "Anchoring - African countries low"),
    "anchoring_redwood": ("Anchoring - redwood high", "Anchoring - redwood low"),
    "disease_framing": ("Disease - gain", "Disease-loss"),
    "less_is_more": ("Less is More Gamble A", "Less is More Gamble B", "Less is More Gamble C"),
    "linda": ("Linda -no conjunction", "Linda-conjunction"),
    "myside": ("Myside Ford", "Myside German"),
    "outcome_bias": ("Outcome bias - failure", "Outcome bias - success"),
    "probability_matching": ("Probability matching vs. maximizing - Problem 1",
                             "Probability matching vs. maximizing - Problem 2"),
    "proportion_dominance_1": ("Proportion dominance 1A", "Proportion dominance 1B", "Proportion dominance 1C"),
    "proportion_dominance_2": ("Proportion dominance 2A", "Proportion dominance 2B", "Proportion dominance 2C"),
    "wta_wtp": ("WTA/WTP Thaler - WTP noncertainty", "WTA/WTP Thaler problem - WTA certainty",
                "WTA/WTP Thaler problem - WTP certainty"),
}
EXPERIMENT_OF = {c: e for e, conditions in EXPERIMENTS.items() for c in conditions}

def _jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]

def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def load_set(set_name, root=None, locked=None):
    """-> {respondents, exams, answers, consistency}. Tuning reads the repo; check and final read the locked files."""
    if set_name not in SETS:
        raise ValueError(f"unknown set {set_name!r}, expected one of {SETS}")
    twin, locked = Path(root or ROOT) / "data" / "twin", Path(locked or LOCKED)
    respondents = [r for r in _jsonl(twin / "respondents.jsonl") if r["set"] == set_name]
    if set_name == "tuning":
        sheets = [_jsonl(twin / "tuning_answers.jsonl"), _jsonl(twin / "tuning_consistency.jsonl")]
    else:
        sheets = [[row for row in _jsonl(locked / f) if row["set"] == set_name]
                  for f in ("answers.jsonl", "consistency.jsonl")]
    answers, consistency = [{row["pid"]: row["answers"] for row in rows} for rows in sheets]
    return {"respondents": respondents, "answers": answers, "consistency": consistency,
            "exams": {r["pid"]: json.loads((twin / "exam" / f"{r['pid']}.json").read_text()) for r in respondents}}

def match(item, a, b):
    """Exact, or within one step on an ordered scale. A missing answer (None) never matches."""
    if a is None or b is None:
        return False
    return abs(a - b) <= 1 if item.get("ordinal") else a == b

def _answer(answers, pid, item):
    """A valid 1-based option position from {pid: {item_id: int}}, else None (missing, malformed or out of range)."""
    a = ((answers or {}).get(pid) or {}).get(item["id"])
    return a if type(a) is int and 1 <= a <= len(item["options"]) else None

def _mode(values):
    counts = collections.Counter(values)
    return min(counts, key=lambda v: (-counts[v], v))       # ties go to the lowest option position

def _entropy(values):
    return -sum(k / len(values) * math.log(k / len(values)) for k in collections.Counter(values).values())

def _given_mc(root, pid):
    blocks = json.loads((Path(root) / "data" / "twin" / "given" / f"{pid}.json").read_text())
    return {q["QuestionID"]: q["Answers"]["SelectedByPosition"] for b in blocks for q in b.get("Questions") or []
            if q.get("QuestionType") == "MC" and (q.get("Answers") or {}).get("SelectedByPosition")}  # answered only

def baseline_answers(target, tuning, root=None):
    """The three code baselines' answers for a target set, {name: {pid: {item_id: int}}}. Both sets from load_set()."""
    root = Path(root or ROOT)
    pooled, cells = collections.defaultdict(list), collections.defaultdict(lambda: collections.defaultdict(list))
    for r in tuning["respondents"]:
        for iid, a in tuning["answers"].get(r["pid"], {}).items():
            pooled[iid].append(a)
            cells[r["age"], r["income_band"]][iid].append(a)
    common = {iid: _mode(v) for iid, v in pooled.items()}
    given = {r["pid"]: _given_mc(root, r["pid"]) for r in tuning["respondents"]}

    def agreement(g, h):
        shared = g.keys() & h.keys()
        return sum(g[k] == h[k] for k in shared) / len(shared) if shared else 0.0

    out = {"most_common": {}, "demographic": {}, "most_similar": {}}
    for r in target["respondents"]:
        pid, cell = r["pid"], cells[r["age"], r["income_band"]]
        items, mine = target["exams"][pid], _given_mc(root, pid)
        nearest = max((p for p in given if p != pid), key=lambda p: agreement(mine, given[p]), default=None)
        copied = tuning["answers"].get(nearest, {})
        out["most_common"][pid] = {it["id"]: common.get(it["id"]) for it in items}
        out["demographic"][pid] = {it["id"]: _mode(cell[it["id"]]) if len(cell[it["id"]]) >= 3 else common.get(it["id"])
                                   for it in items}
        out["most_similar"][pid] = {it["id"]: copied.get(it["id"], common.get(it["id"])) for it in items}
    return out

def _scaled(it, a):
    return Fraction(a - 1, max(len(it["options"]) - 1, 1))   # 0-1, exact: a 0.10 gap is not lost to rounding

def _mean(xs):
    return sum(xs) / len(xs)

def _group_gaps(universe, got):
    """Share of item x split real gaps (>= 0.10 on a 0-1 scale, >= 5 per group) whose agent gap has the same sign."""
    scaled, mean = _scaled, _mean
    rows = collections.defaultdict(list)                    # item id -> [(respondent, real 0-1, agent 0-1 or None)]
    for g, (r, it, a, _) in zip(got, universe):
        rows[it["id"]].append((r, scaled(it, a), None if g is None else scaled(it, g)))
    considered = correct = 0
    for item_rows in rows.values():
        for key, (group_a, group_b) in SPLITS.items():
            ga, gb = ([x for x in item_rows if x[0].get(key) == v] for v in (group_a, group_b))
            if len(ga) < MIN_GROUP or len(gb) < MIN_GROUP:
                continue
            real_gap = mean([x[1] for x in ga]) - mean([x[1] for x in gb])
            if abs(real_gap) < MIN_GAP:
                continue
            considered += 1
            aa, ab = [x[2] for x in ga if x[2] is not None], [x[2] for x in gb if x[2] is not None]
            correct += bool(aa and ab) and (mean(aa) - mean(ab)) * real_gap > 0   # an agent gap of 0 is wrong
    return (correct / considered if considered else None), considered

def _card(universe, agent_answers, baselines):
    """Right person, right spread and right group gaps over (respondent, item, real, consistency) entries, with the
    baselines' right person and the benchmark marks."""
    n = len(universe)
    human = sum(match(it, c, a) for _, it, a, c in universe)
    hits = lambda answers: sum(match(it, _answer(answers, r["pid"], it), a) for r, it, a, _ in universe)
    ratio = lambda answers: hits(answers) / human if human and answers is not None else None
    got = [_answer(agent_answers, r["pid"], it) for r, it, _, _ in universe]
    real_by, agent_by = collections.defaultdict(list), collections.defaultdict(list)
    for g, (_, it, a, _) in zip(got, universe):
        real_by[it["id"]].append(a)
        if g is not None:
            agent_by[it["id"]].append(g)
    # more varied than people earns no extra credit, so the keep rule never rewards scatter
    spreads = [min(_entropy(agent_by[iid]) / h, 1.0) for iid, v in real_by.items() if (h := _entropy(v)) > 0]
    right_spread = sum(spreads) / len(spreads) if spreads else None
    right_group_gaps, considered = _group_gaps(universe, got)
    base = {name: ratio(answers) for name, answers in baselines.items()}
    right_person = ratio(agent_answers)
    checks = {"right_person": right_person, "right_spread": right_spread, "right_group_gaps": right_group_gaps}
    marks = {c: checks[c] is not None and checks[c] >= m for c, m in MARKS.items()}
    available = [b for b in base.values() if b is not None]
    marks["beats_baselines"] = right_person is not None and bool(available) and all(right_person > b for b in available)
    return {"n_items": n, "right_person": right_person, "agent_match_rate": hits(agent_answers) / n if n else None,
            "human_consistency": human / n if n else None,
            "missing_share": sum(g is None for g in got) / n if n else None,
            "right_spread": right_spread, "spread_items": len(spreads),
            "right_group_gaps": right_group_gaps, "group_gaps_considered": considered,
            "baselines": base, "marks": marks, "marks_passed": sum(marks.values())}

def _effects(universe, got):
    """Randomised condition effects on puzzle choice and scale items: for each pair of conditions of one experiment,
    the real mean difference (0-1 scale) beside the agents', and the share of real effects >= 0.10 the agents
    reproduce in sign. Items pair up across conditions by their position in the block."""
    cells = collections.defaultdict(lambda: collections.defaultdict(lambda: ([], [])))
    for g, (_, it, a, _) in zip(got, universe):
        experiment = EXPERIMENT_OF.get(it["condition"].strip())
        if experiment is None or (len(it["options"]) > 2 and not it.get("ordinal")):
            continue                                        # unordered choices with 3+ options have no mean
        position = re.search(r"_(\d+(?:_r\d+)?)$", it["id"]).group(1)
        real, agent = cells[experiment, position][it["condition"].strip()]
        real.append(_scaled(it, a))
        if g is not None:
            agent.append(_scaled(it, g))
    rows = []
    for (experiment, position), by_condition in sorted(cells.items()):
        for c1, c2 in itertools.combinations(sorted(by_condition), 2):
            (r1, a1), (r2, a2) = by_condition[c1], by_condition[c2]
            if min(len(r1), len(r2)) < MIN_GROUP:
                continue
            real = _mean(r1) - _mean(r2)
            agent = _mean(a1) - _mean(a2) if a1 and a2 else None
            rows.append({"experiment": experiment, "position": position, "conditions": [c1, c2],
                         "n": [len(r1), len(r2)], "real_effect": float(real),
                         "agent_effect": None if agent is None else float(agent),
                         "reproduced": agent is not None and agent * real > 0})
    big = [r for r in rows if abs(r["real_effect"]) >= MIN_GAP]
    return {"pairs": rows, "effects_considered": len(big),
            "effects_reproduced": sum(r["reproduced"] for r in big) / len(big) if big else None}

def score(agent_answers, set_name, families=FAMILIES, steady_answers=None, no_persona=None, root=None, locked=None):
    """Scorecard for {pid: {item_id: int}} on one set: the four checks, baselines, marks and hashes (aggregates only)."""
    root, locked = Path(root or ROOT), Path(locked or LOCKED)
    marker = locked / "final_scored.json"
    if set_name == "final" and marker.exists():
        raise RuntimeError(f"the final set is scored exactly once and already was: {marker}")
    data = load_set(set_name, root, locked)
    universe = []                                           # (respondent, item, real answer, consistency answer)
    for r in data["respondents"]:
        real, con = data["answers"].get(r["pid"], {}), data["consistency"].get(r["pid"], {})
        universe += [(r, it, real[it["id"]], con[it["id"]]) for it in data["exams"][r["pid"]]
                     if it["family"] in families and it["id"] in real and it["id"] in con]
    tuning = data if set_name == "tuning" else load_set("tuning", root, locked)
    baselines = baseline_answers(data, tuning, root) | {"no_persona": no_persona}
    card = _card(universe, agent_answers, baselines)

    rewordings_path = root / "autoresearch" / "rewordings.json"
    steady, steady_status = None, "not_run"
    if steady_answers is not None:
        steady_status = "rewordings_not_approved"
        rewordings = json.loads(rewordings_path.read_text()) if rewordings_path.exists() else []
        if rewordings and all(e.get("approved_by") for e in rewordings):
            ids = {e["id"] for e in rewordings}
            pairs = [(r["pid"], it) for r in data["respondents"] for it in data["exams"][r["pid"]] if it["id"] in ids]
            same = sum(match(it, _answer(steady_answers, pid, it), _answer(agent_answers, pid, it))
                       for pid, it in pairs)
            steady, steady_status = (same / len(pairs) if pairs else None), "ok"

    result = {
        "set_name": set_name, "families": list(families), "n_respondents": len(data["respondents"]), **card,
        "steady": steady, "steady_status": steady_status,
        "invalid": not card["n_items"] or card["missing_share"] > MAX_MISSING,
        "by_family": {f: _card([u for u in universe if u[1]["family"] == f], agent_answers, baselines) for f in families},
        "experiment_effects": _effects(universe, [_answer(agent_answers, r["pid"], it) for r, it, _, _ in universe])
        if "puzzle" in families else None,
        "scorer_sha256": _sha(SELF), "rewordings_sha256": _sha(rewordings_path) if rewordings_path.exists() else None,
    }
    if set_name == "final":
        scored_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with open(marker, "x") as f:                        # "x": a concurrent second final scoring fails here too
            json.dump({"scored_at": scored_at, "score": result}, f, indent=1)
    return result

def noise_from(score_a, score_b):
    """Noise per check: the difference between two runs of the same instructions, at least 0.01."""
    return {c: max(abs(score_a[c] - score_b[c]), MIN_NOISE) for c in CHECKS
            if score_a.get(c) is not None and score_b.get(c) is not None}

def keep(prev, new, noise):
    """Keep rule: a check gains more than its noise, none falls more than its noise, and marks passed never fall."""
    deltas = {c: new[c] - prev[c] for c in CHECKS if prev.get(c) is not None and new.get(c) is not None}
    if unmeasured := [c for c in deltas if c not in noise]:
        raise ValueError(f"no noise measured for {unmeasured}: re-score both round 0 runs and recompute the noise")
    say = lambda c: f"{c} {deltas[c]:+.3f} (noise {noise[c]:.3f})"
    up, down = [say(c) for c in deltas if deltas[c] > noise[c]], [say(c) for c in deltas if deltas[c] < -noise[c]]
    marks_held = new["marks_passed"] >= prev["marks_passed"]
    reasons = ["fell beyond noise: " + ", ".join(down)] if down else []
    if not marks_held:
        reasons.append(f"marks passed fell {prev['marks_passed']} -> {new['marks_passed']}")
    reasons.append("improved beyond noise: " + ", ".join(up) if up else
                   "no check improved beyond noise: " + ", ".join(map(say, deltas)))
    kept = bool(up) and not down and marks_held
    return kept, ("keep: " if kept else "discard: ") + "; ".join(reasons)

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Score persona-agent answers on one set; prints aggregates only.")
    p.add_argument("--set", required=True, choices=SETS, dest="set_name")
    p.add_argument("answers", help="JSON file of agent answers: {pid: {item_id: int}}")
    args = p.parse_args()
    print(json.dumps(score(json.loads(Path(args.answers).read_text()), args.set_name), indent=2))
