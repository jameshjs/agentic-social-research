# Re-benchmark (ADR 0004): the bar and noise from all runs of the kept round, and each borderline round re-judged on
# the mean of its runs with the same keep rule and marks. Writes rounds/rebench/bar.json and rejudged.json; never
# touches decision.json or results.tsv. Usage: python3 autoresearch/rebench.py
import json, statistics, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import evaluate, record_round as rr  # noqa: E402

KEPT, REJUDGE = "003", ("004", "007", "008", "009")

def main():
    out = rr.ROUNDS / "rebench"
    out.mkdir(exist_ok=True)
    runs = [json.loads((p / "score.json").read_text())["check"] for p in rr.runs(KEPT)]
    bar = rr.kept_score(KEPT)                            # mean per check over every run, marks recomputed on the mean
    noise = {c: 2 * statistics.stdev(r[c] for r in runs) for c in evaluate.CHECKS}  # sample sd of the runs
    old_noise = json.loads((rr.ROUNDS / "000-start" / "decision.json").read_text())["noise"]
    (out / "bar.json").write_text(json.dumps({
        "method": f"mean of round {KEPT}'s {len(runs)} check-set runs; noise = 2 x their sample standard deviation",
        "runs": bar["runs"], "per_run": [{c: r[c] for c in evaluate.CHECKS} | {"marks_passed": r["marks_passed"]} for r in runs],
        "bar": {c: bar[c] for c in evaluate.CHECKS} | {"marks": bar["marks"], "marks_passed": bar["marks_passed"]},
        "noise": noise, "old_noise_round_0": old_noise}, indent=1))

    table, rejudged = {r["round"]: r for r in rr.read()}, []
    for rnd in REJUDGE:
        new = rr.kept_score(rnd)                         # the same mean-and-marks rule, over this round's runs
        kept, reason = evaluate.keep(bar, new, noise)
        decision = json.loads((rr.folder(rnd) / "decision.json").read_text())
        rejudged.append({"round": rnd, "change": table[rnd]["change"], "runs": new["runs"],
                         "original": {"kept": table[rnd]["kept"], "reason": decision["reason"],
                                      "check": {c: decision["check"][c] for c in ("right_person", "right_spread", "right_group_gaps", "steady", "marks_passed")}},
                         "mean": {c: new[c] for c in evaluate.CHECKS} | {"marks_passed": new["marks_passed"]},
                         "deltas": {c: new[c] - bar[c] for c in evaluate.CHECKS},
                         "new": {"kept": kept, "reason": reason}})
    (out / "rejudged.json").write_text(json.dumps(rejudged, indent=1))
    print(json.dumps({"bar": {c: round(bar[c], 4) for c in evaluate.CHECKS} | {"marks": bar["marks_passed"]},
                      "noise": {c: round(v, 4) for c, v in noise.items()},
                      "rejudged": {r["round"]: r["new"]["reason"] for r in rejudged}}, indent=1))

if __name__ == "__main__":
    main()
