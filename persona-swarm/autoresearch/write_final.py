# Writes autoresearch/final/final.json (PLAN.md Task 11) from the one final scoring and the extras, for export_record.py:
# the scorecard (final set by family, and policy + pricing pooled to compare with the check set), baselines, experiment
# effects on the held-out puzzles, the 10 / 30 / all given-answers comparison on the check set, and one respondent
# followed through. Reads only round folders and repo data; the final set is never re-scored here.
# Usage: python3 autoresearch/write_final.py
import json, random, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import evaluate, formats, record_round as rr  # noqa: E402

FINAL, DATA, KEPT = HERE / "final", HERE.parent / "data" / "twin", "009"
CHECKS = ("right_person", "right_spread", "right_group_gaps")

def pooled(cards):
    """Policy + pricing pooled exactly from family cards: right person and baselines from match counts, spread over
    items, gaps over comparisons."""
    human = [c["human_consistency"] * c["n_items"] for c in cards]
    out = {"n_items": sum(c["n_items"] for c in cards),
           "right_person": sum(c["agent_match_rate"] * c["n_items"] for c in cards) / sum(human),
           "right_spread": sum(c["right_spread"] * c["spread_items"] for c in cards) / sum(c["spread_items"] for c in cards),
           "right_group_gaps": sum(c["right_group_gaps"] * c["group_gaps_considered"] for c in cards)
           / sum(c["group_gaps_considered"] for c in cards)}
    base = {b: sum(c["baselines"][b] * h for c, h in zip(cards, human)) / sum(human) for b in cards[0]["baselines"]}
    marks = {c: out[c] >= m for c, m in evaluate.MARKS.items()} | {"beats_baselines": all(out["right_person"] > v for v in base.values())}
    return out | {"baselines": base, "marks_passed": sum(marks.values())}

def row(scope, family, card, steady=None):
    return {"scope": scope, "family": family, "n_items": card.get("n_items"), **{c: card[c] for c in CHECKS},
            "steady": steady, "marks_passed": card.get("marks_passed")}

def main():
    final = json.loads((FINAL / "scoring" / "score.json").read_text())["final"]
    fam, pp = final["by_family"], pooled([final["by_family"]["policy"], final["by_family"]["pricing"]])
    check = rr.kept_score(KEPT)                              # round 9's runs on the check set (the bar it was kept on)
    check_runs = [json.loads((p / "score.json").read_text())["check"] for p in rr.runs(KEPT)]
    check_fam = {f: {c: sum(r["by_family"][f][c] for r in check_runs) / len(check_runs) for c in CHECKS} for f in ("policy", "pricing")}

    scorecard = [row("final", "all, with puzzles", final, final["steady"]), row("final", "policy + pricing", pp, final["steady"]),
                 *(row("final", f, fam[f]) for f in ("policy", "pricing", "puzzle")),
                 row(f"check, round {KEPT} ({len(check_runs)} runs)", "policy + pricing", check, check["steady"]),
                 *(row(f"check, round {KEPT} ({len(check_runs)} runs)", f, check_fam[f]) for f in ("policy", "pricing"))]
    baselines = [{"scope": "final", "family": f, "agents": c["right_person"], **c["baselines"]}
                 for f, c in [("all, with puzzles", final), ("policy + pricing", pp), *((f, fam[f]) for f in ("policy", "pricing", "puzzle"))]]
    effects = final["experiment_effects"]

    given = []
    for n, runs in (("10", [FINAL / "given-10"]), ("30", [FINAL / "given-30"]), ("all", rr.runs(KEPT))):
        cards = [json.loads((p / "score.json").read_text())["check"] for p in runs]
        mean = lambda get: sum(get(c) for c in cards) / len(cards)
        given.append({"given_answers": n, "runs": len(cards), **{c: mean(lambda x: x[c]) for c in CHECKS + ("steady",)},
                      **{f"{f}_{c}": mean(lambda x: x["by_family"][f][c]) for f in ("policy", "pricing") for c in CHECKS}})

    # one respondent: check and final answer sheets are locked (ADR 0002), so a tuning respondent drawn with the seed
    people = [json.loads(l) for l in (DATA / "respondents.jsonl").read_text().splitlines()]
    pid = random.Random(17).choice(sorted(p["pid"] for p in people if p["set"] == "tuning"))
    me = next(p for p in people if p["pid"] == pid)
    real = next(json.loads(l)["answers"] for l in (DATA / "tuning_answers.jsonl").read_text().splitlines() if json.loads(l)["pid"] == pid)
    answers = lambda rnd: next(json.loads(l)["answers"] for l in (rr.folder(rnd) / "answers.jsonl").read_text().splitlines()
                               if json.loads(l)["pid"] == pid)
    agent, start = answers(KEPT), answers("000")             # round 9's agent, and round 0's starting instructions
    items = [it for it in json.loads((DATA / "exam" / f"{pid}.json").read_text()) if it["family"] in ("policy", "pricing")]
    label = lambda it, a: it["options"][a - 1] if a else None
    follow = [{"pid": pid, "family": it["family"], "item": it["id"],
               "question": it.get("row") or re.sub(r"^.*?you see the following product in that category: ", "", it["text"])[:160],
               "real": label(it, real.get(it["id"])), "agent": label(it, agent.get(it["id"])),
               "match": evaluate.match(it, agent.get(it["id"]), real.get(it["id"])),
               "round_0": label(it, start.get(it["id"])), "round_0_match": evaluate.match(it, start.get(it["id"]), real.get(it["id"]))}
              for it in items]
    profile = formats.relative_profile(formats.blocks(pid))

    FINAL.joinpath("final.json").write_text(json.dumps({
        "meta": [{"instructions_round": KEPT, "format": "full_relative", "signed_off_by": "Team", "model": "claude-haiku-5-5",
                  "final_respondents": final["n_respondents"], "scored_once": True, "steady_status": final["steady_status"],
                  "scorer_sha256": final["scorer_sha256"], "invalid": final["invalid"], "missing_share": final["missing_share"]}],
        "scorecard": scorecard, "baselines": baselines,
        "experiment_summary": [{"effects_considered": effects["effects_considered"], "effects_reproduced": effects["effects_reproduced"],
                                "pairs": len(effects["pairs"])}],
        "experiment_effects": effects["pairs"], "given_answers": given,
        "follow_one_profile": [{"pid": pid, "set": "tuning", **{k: me[k] for k in ("age", "sex", "income", "party", "region")},
                                "relative_profile": profile, "matches": sum(f["match"] for f in follow),
                                "round_0_matches": sum(f["round_0_match"] for f in follow), "items": len(follow)}],
        "follow_one": follow}, indent=1, ensure_ascii=False))
    print(json.dumps({"final policy+pricing": {c: round(pp[c], 3) for c in CHECKS} | {"marks": pp["marks_passed"]},
                      "baselines policy+pricing": {b: round(v, 3) for b, v in pp["baselines"].items()},
                      "follow_one": [pid, sum(f["match"] for f in follow), len(follow)]}, indent=1))

if __name__ == "__main__":
    main()
