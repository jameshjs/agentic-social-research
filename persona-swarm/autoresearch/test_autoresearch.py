# Offline self-check of the frozen scorer (PLAN.md Task 3), and of the round review gate (ADR 0003), on synthetic
# fixtures in a temporary folder. It never reads data/twin, the real round record or ~/.cache/persona-swarm, and makes
# no model calls.
# Usage: python3 autoresearch/test_autoresearch.py      (prints "ok"; pytest also collects test_all and test_review_gate)
import hashlib, importlib.util, json, random, tempfile
from pathlib import Path

import evaluate as ev

SCALE = ["Strongly oppose", "Somewhat oppose", "Neither", "Somewhat support", "Strongly support"]
ITEMS = ([{"id": f"policy_{k:02d}", "family": "policy", "block": "False consensus", "condition": "False consensus",
           "type": "Matrix", "text": f"Do you support policy {k}?", "row": f"Policy {k}", "options": SCALE,
           "ordinal": True} for k in range(1, 5)] +
         [{"id": f"price_{k:02d}", "family": "pricing", "block": "Product Preferences - Pricing",
           "condition": "Product Preferences - Pricing", "type": "MC", "text": f"Would you buy product {k}?",
           "options": ["Yes", "No"], "ordinal": False} for k in range(1, 5)])

def write_fixture(root):
    """twin_loader.py's file layout under root: 12 tuning, 20 check, 20 final made-up respondents. -> {pid: answers}"""
    rng, twin, locked = random.Random(7), root / "data" / "twin", root / "locked"
    for d in (twin / "exam", twin / "given", locked):
        d.mkdir(parents=True)
    people, sheets, keys = [], {}, {}
    for set_name, n in (("tuning", 12), ("check", 20), ("final", 20)):
        for i in range(n):
            pid, young = f"{set_name}{i:02d}", i % 2 == 0   # young Democrats support and buy; old Republicans mostly don't
            people.append({"pid": pid, "set": set_name, "age": "18-29" if young else "65+",
                           "sex": "Female" if i // 2 % 2 else "Male", "income": "",
                           "income_band": "100k_plus" if i // 4 % 2 else "under_50k", "region": "South",
                           "party": "Democrat" if young else "Republican", "seed": 7})
            sheets[pid] = {it["id"]: rng.choice([4, 5] if young else [1, 2]) if it["ordinal"]
                           else 1 if (rng.random() < 0.8) == young else 2 for it in ITEMS}
            # human consistency is exactly 0.75: every 4th earlier answer is mirrored (2+ scale steps, or the other option)
            keys[pid] = {it["id"]: len(it["options"]) + 1 - sheets[pid][it["id"]] if (i + k) % 4 == 0
                         else sheets[pid][it["id"]] for k, it in enumerate(ITEMS)}
            given = [{"QuestionID": f"QID{q}", "QuestionType": "MC",
                      "Answers": {"SelectedByPosition": (1 if young else 2) if rng.random() < 0.8 else 3}}
                     for q in range(6)]
            (twin / "given" / f"{pid}.json").write_text(json.dumps([{"BlockName": "Personality", "Questions": given}]))
            (twin / "exam" / f"{pid}.json").write_text(json.dumps(ITEMS))
    write = lambda path, rows: path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    write(twin / "respondents.jsonl", people)
    for name, sheet in (("answers", sheets), ("consistency", keys)):
        write(twin / f"tuning_{name}.jsonl", [{"pid": r["pid"], "answers": sheet[r["pid"]]}
                                             for r in people if r["set"] == "tuning"])
        write(locked / f"{name}.jsonl", [{"pid": r["pid"], "set": r["set"], "answers": sheet[r["pid"]]}
                                         for r in people if r["set"] != "tuning"])
    return sheets

def test_all():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        sheets = write_fixture(root)
        ev.ROOT, ev.LOCKED = root, root / "locked"         # never the real data or ~/.cache/persona-swarm
        check = {pid: a for pid, a in sheets.items() if pid.startswith("check")}

        # answers equal to the answer sheet score 1 / human consistency, overall and in each family
        s = ev.score(check, "check")
        assert s["human_consistency"] == 0.75 and s["missing_share"] == 0, s
        assert abs(s["right_person"] - 1 / s["human_consistency"]) < 1e-9, s
        assert sum(f["n_items"] for f in s["by_family"].values()) == s["n_items"], s["by_family"]
        assert all(abs(f["right_person"] - 1 / 0.75) < 1e-9 for f in s["by_family"].values()), s["by_family"]

        # agents more varied than people earn no spread above 1
        rng = random.Random(3)
        scatter = {pid: {it["id"]: rng.randint(1, len(it["options"])) for it in ITEMS} for pid in check}
        assert ev.score(scatter, "check")["right_spread"] <= 1.0

        # experiment effects: a condition effect the agents copy is reproduced, a reversed one is not
        gain = {"id": "puzzle_disease_gain_1", "condition": "Disease - gain", "options": SCALE, "ordinal": True}
        loss = {"id": "puzzle_disease_loss_1", "condition": "Disease-loss", "options": SCALE, "ordinal": True}
        universe = [({}, gain, 5, 5)] * 6 + [({}, loss, 1, 1)] * 6
        e = ev._effects(universe, [4] * 6 + [2] * 6)
        assert e["effects_considered"] == 1 and e["effects_reproduced"] == 1 and e["pairs"][0]["real_effect"] == 1.0, e
        assert ev._effects(universe, [2] * 6 + [4] * 6)["effects_reproduced"] == 0

        # everyone giving the most common answer has almost no spread and fails the benchmark
        common = ev.baseline_answers(ev.load_set("check"), ev.load_set("tuning"))["most_common"]
        s = ev.score(common, "check")
        assert s["right_spread"] < 0.2 and s["marks_passed"] < 4, s

        # reversed group gaps score 0
        n_options = {it["id"]: len(it["options"]) for it in ITEMS}
        s = ev.score({pid: {iid: n_options[iid] + 1 - a for iid, a in ans.items()} for pid, ans in check.items()}, "check")
        assert s["group_gaps_considered"] > 0 and s["right_group_gaps"] == 0, s

        # a scale answer one step away matches and two steps away does not; a non-scale answer one step away does not
        assert ev.match({"ordinal": True}, 3, 4) and not ev.match({"ordinal": True}, 3, 5)
        assert not ev.match({"ordinal": False}, 1, 2)

        # keep() rejects a gain within noise and a check falling beyond noise, and accepts a clear gain
        prev = {"right_person": 0.50, "right_spread": 0.60, "right_group_gaps": 0.70, "steady": None, "marks_passed": 0}
        noise = {"right_person": 0.02, "right_spread": 0.02, "right_group_gaps": 0.02}
        assert not ev.keep(prev, {**prev, "right_person": 0.51}, noise)[0]
        assert not ev.keep(prev, {**prev, "right_person": 0.60, "right_spread": 0.55}, noise)[0]
        assert ev.keep(prev, {**prev, "right_person": 0.60}, noise)[0]
        steady = {**prev, "steady": 0.959}                 # 0.969 - 0.959 is a hair above 0.01 in floating point
        assert not ev.keep(steady, {**steady, "steady": 0.969}, {**noise, "steady": 0.01})[0]
        try:                                                # a check with no measured noise must be re-measured
            ev.keep({**prev, "steady": 0.9}, {**prev, "steady": 0.95}, noise)
        except ValueError:
            pass
        else:
            raise AssertionError("keep() compared a check that has no noise")

        # one changed byte in a copy of evaluate.py changes the hash its scores record
        src, copy = Path(ev.__file__).read_bytes(), root / "evaluate_copy.py"
        assert src.endswith(b"\n")
        copy.write_bytes(src[:-1] + b" ")                  # the final newline becomes a space
        spec = importlib.util.spec_from_file_location("evaluate_copy", copy)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.ROOT, mod.LOCKED = ev.ROOT, ev.LOCKED
        a, b = ev.score(check, "check")["scorer_sha256"], mod.score(check, "check")["scorer_sha256"]
        assert a == hashlib.sha256(src).hexdigest() and b == hashlib.sha256(copy.read_bytes()).hexdigest() and a != b

        # the final set is scored once; a second scoring is refused
        final = {pid: a for pid, a in sheets.items() if pid.startswith("final")}
        ev.score(final, "final")
        try:
            ev.score(final, "final")
        except RuntimeError:
            pass
        else:
            raise AssertionError("the final set was scored twice")

        # steady is None while any rewording lacks approval
        (root / "autoresearch").mkdir()
        (root / "autoresearch" / "rewordings.json").write_text(json.dumps([
            {"id": "policy_01", "original": "Policy 1", "reworded": "The first policy", "approved_by": "Steven",
             "approved_at": "2026-10-17T03:00:00+00:00"},
            {"id": "policy_02", "original": "Policy 2", "reworded": "The second policy", "approved_by": "",
             "approved_at": None}]))
        s = ev.score(check, "check", steady_answers=check)
        assert s["steady"] is None and s["steady_status"] == "rewordings_not_approved", s

def test_review_gate():
    import record_round as rr
    with tempfile.TemporaryDirectory() as tmp:
        rr.ROUNDS, rr.TSV = Path(tmp) / "rounds", Path(tmp) / "results.tsv"   # never the real record
        for name in ("006-old", "007-new"):
            (rr.ROUNDS / name).mkdir(parents=True)
            (rr.ROUNDS / name / "meta.json").write_text(json.dumps({"no_persona": False}))
            (rr.ROUNDS / name / "decision.json").write_text(json.dumps({"round": name[:3]}))
        rr.write([{"round": "006", "kept": "no"}, {"round": "007", "kept": "no", "coach_notes": "Steven: redo round 7"}])

        # from round 7 the next round is refused until a coach reviews the last one; round 6 predates the rule
        assert "007" in (rr.needs_review() or ""), rr.needs_review()

        # the coach must type both the comment and the improvement
        try:
            rr.review("007", "Steven", "continue", " ", "Read papers on answer variety.")
        except SystemExit:
            pass
        else:
            raise AssertionError("a review with no comment was recorded")

        rr.review("007", "Steven", "continue", "Spread fell\tagain.", "Read papers on\nanswer variety.")
        got = json.loads((rr.ROUNDS / "007-new" / "decision.json").read_text())["human_review"]
        assert (got["by"], got["verdict"], got["comment"], got["improvement"]) == (
            "Steven", "continue", "Spread fell again.", "Read papers on answer variety."), got
        assert rr.read()[1]["coach_notes"] == (
            "Steven: redo round 7 Steven: Spread fell again. Next: Read papers on answer variety."), rr.read()
        assert rr.needs_review() is None

if __name__ == "__main__":
    test_all()
    test_review_gate()
    print("ok")
