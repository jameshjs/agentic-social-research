# Records one tuning round (program.md steps 5-6): applies the keep rule against the last kept round with the
# re-benchmarked noise (round 0's before it), checks the triggers, writes decision.json, appends the results.tsv row
# (and the previous row's commit hash), restores instructions.md after a discard, and prints the commit message. Also
# records a coach's typed review of a round (which run_round.py waits for) and a sign-off.
# Usage: python3 autoresearch/record_round.py autoresearch/rounds/001-<slug> --targeted right_person \
#            --label "<short change>" --change "<what changed>" --hypothesis "<why>"
#        python3 autoresearch/record_round.py --review 007 --by Steven --verdict continue --comment "..." --improvement "..."
#        python3 autoresearch/record_round.py --sign-off 001 --by Steven
import argparse, csv, json, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import evaluate  # noqa: E402

TSV, ROUNDS = HERE / "results.tsv", HERE / "rounds"
REVIEW_FROM = 7  # rounds before 7 predate the typed review rule (Steven, 17 Oct; ADR 0003)
COLUMNS = ["round", "started_at", "ended_at", "check_targeted", "hypothesis", "change", "papiers_ids", "coach_notes",
           "right_person", "right_spread", "right_group_gaps", "steady", "marks_passed", "delta_vs_prev", "cost_usd",
           "kept", "signed_off_by", "signed_off_at", "commit"]

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def read():
    with TSV.open(newline="") as f:
        return list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))

def write(table):
    for r in table:
        assert not any("\t" in str(v) or "\n" in str(v) for v in r.values()), r["round"]
    TSV.write_text("\t".join(COLUMNS) + "\n" + "".join("\t".join(str(r.get(c, "")) for c in COLUMNS) + "\n" for r in table))

def runs(rnd):
    """A round's scored runs: the round itself and any re-measure, never the no-persona baseline."""
    return [p for p in sorted(ROUNDS.glob(f"{rnd}-*")) if not json.loads((p / "meta.json").read_text())["no_persona"]]

def folder(rnd):
    """A round's own folder: its first run."""
    return runs(rnd)[0]

def kept_score(rnd):
    """The bar a new round must beat: the mean check score over the kept round's runs, with the marks recomputed from
    that mean (Steven, trigger 1 after round 6). A round with one run is just that run."""
    scores = [json.loads((p / "score.json").read_text())["check"] for p in runs(rnd)]
    mean = {c: sum(s[c] for s in scores) / len(scores) if all(s.get(c) is not None for s in scores) else None
            for c in evaluate.CHECKS}
    marks = {c: mean[c] is not None and mean[c] >= m for c, m in evaluate.MARKS.items()}
    beaten = [b for b in scores[0]["baselines"].values() if b is not None]
    marks["beats_baselines"] = mean["right_person"] is not None and bool(beaten) and all(mean["right_person"] > b for b in beaten)
    return mean | {"marks": marks, "marks_passed": sum(marks.values()), "runs": [p.name for p in runs(rnd)]}

def commit_of(rnd):
    out = subprocess.run(["git", "log", "-1", "--format=%h", "--", str(folder(rnd))], capture_output=True, text=True)
    return out.stdout.strip()

def sign_off(rnd, by):
    table = read()
    row = next(r for r in table if r["round"] == rnd)
    if row["kept"] != "yes":
        sys.exit(f"round {rnd} was not kept ({row['kept']}), so there is nothing to sign off")
    row["signed_off_by"], row["signed_off_at"] = by, now()
    write(table)
    d = folder(rnd) / "decision.json"
    decision = json.loads(d.read_text())
    decision |= {"on_trial": False, "signed_off_by": by, "signed_off_at": row["signed_off_at"]}
    d.write_text(json.dumps(decision, indent=1))
    print(f"round {int(rnd):02d} signed off: {by}")

def current_noise():
    """Per-check noise: the re-benchmark's (2 x the sd of round 3's 5 runs, ADR 0004) when present, else round 0's pair."""
    bench = ROUNDS / "rebench" / "bar.json"
    return json.loads((bench if bench.exists() else ROUNDS / "000-start" / "decision.json").read_text())["noise"]

def needs_review():
    """Why the next round can't start, or None: the last numbered round needs a coach's typed review (ADR 0003)."""
    nums = sorted({int(p.name[:3]) for p in ROUNDS.glob("[0-9][0-9][0-9]-*")})
    if not nums or nums[-1] < REVIEW_FROM:
        return None
    last = f"{nums[-1]:03d}"
    if any("human_review" in json.loads(d.read_text()) for d in ROUNDS.glob(f"{last}-*/decision.json")):
        return None
    return (f"round {last} has no human review; a coach types one with: record_round.py --review {last} --by <name> "
            '--verdict <sign-off|reject|continue> --comment "..." --improvement "..."')

def review(rnd, by, verdict, comment, improvement):
    """A coach's typed review of a finished round: into its decision.json, and onto its results.tsv coach_notes."""
    by, comment, improvement = (" ".join(str(t).split()) for t in (by, comment, improvement))  # no tabs or newlines in the tsv
    if not (by and comment and improvement):
        sys.exit("a review needs --by, and a --comment and --improvement typed by the coach")
    table = read()
    row = next((r for r in table if r["round"] == rnd), None)
    if row is None:
        sys.exit(f"round {rnd} is not in results.tsv: record it first")
    d = folder(rnd) / "decision.json"
    decision = json.loads(d.read_text())
    if "human_review" in decision:
        sys.exit(f"round {rnd} already has a human review")
    decision["human_review"] = {"by": by, "at": now(), "verdict": verdict, "comment": comment, "improvement": improvement}
    d.write_text(json.dumps(decision, indent=1))
    row["coach_notes"] = " ".join(filter(None, [row["coach_notes"], f"{by}: {comment} Next: {improvement}"]))
    write(table)
    print(f"round {int(rnd):02d} reviewed by {by}: {verdict}")
    if verdict == "sign-off" and row["kept"] == "yes":
        sign_off(rnd, by)
    elif verdict == "reject" and row["kept"] == "yes":
        print("record the rejection by hand, as program.md's Sign-off section says")

def record(a):
    out, table = a.folder.resolve(), read()
    rnd = out.name[:3]
    if any(r["round"] == rnd for r in table):
        sys.exit(f"round {rnd} is already in results.tsv")
    base = [r for r in table if r["kept"] in ("yes", "baseline")][-1]
    prev_dir = folder(base["round"])
    prev = kept_score(base["round"])
    scores, meta = json.loads((out / "score.json").read_text()), json.loads((out / "meta.json").read_text())
    new, noise = scores["check"], current_noise()
    kept, reason = (False, "discard: invalid round, over 5% of check items missing") if new["invalid"] \
        else evaluate.keep(prev, new, noise)
    deltas = {c: new[c] - prev[c] for c in evaluate.CHECKS if new.get(c) is not None and prev.get(c) is not None}

    fired, history = [], [r["kept"] for r in table if r["round"] != "000"] + ["yes" if kept else "no"]
    if len(history) >= 3 and "yes" not in history[-3:]:
        fired.append("1: three rounds in a row kept nothing")
    if jumps := [c for c, d in deltas.items() if abs(d) > 3 * noise[c] + evaluate.EPS]:
        fired.append("2: moved more than 3x its noise: " + ", ".join(f"{c} {deltas[c]:+.3f}" for c in jumps))
    up = [c for c, d in deltas.items() if d > noise[c] + evaluate.EPS]
    down = [c for c, d in deltas.items() if d < -noise[c] - evaluate.EPS]
    if up and down:
        fired.append(f"3: {', '.join(up)} rose past its noise while {', '.join(down)} fell past its noise")
    if kept and new["marks_passed"] == 4 and all(float(r["marks_passed"] or 0) < 4 for r in table if r["kept"] in ("yes", "baseline")):
        fired.append("5: the kept instructions now pass the benchmark")
    spend = sum(json.loads(m.read_text())["cost_usd"] for m in ROUNDS.glob("[0-9][0-9][0-9]-*/meta.json"))  # logged only: no spend trigger since 17 Oct

    pick = lambda s: {k: s[k] for k in ("right_person", "right_spread", "right_group_gaps", "steady", "marks_passed",
                                        "missing_share")} | {"by_family": {f: {k: v[k] for k in (
                                            "right_person", "right_spread", "right_group_gaps")} for f, v in s["by_family"].items()}}
    decision = {"round": rnd, "decided_at": now(), "check_targeted": a.targeted, "hypothesis": a.hypothesis,
                "change": a.change, "compared_with": {"runs": prev["runs"], "mean": {c: prev[c] for c in evaluate.CHECKS},
                                                      "marks_passed": prev["marks_passed"]}, "kept": kept, "on_trial": kept, "reason": reason,
                "deltas": deltas, "noise": noise, "check": pick(new), "tuning": pick(scores["tuning"]) if "tuning" in scores else None,
                "triggers_fired": fired, "question": None, "reply": None, "spend_total_usd": round(spend, 2),
                "format": meta["format"]}
    (out / "decision.json").write_text(json.dumps(decision, indent=1))

    if table and not table[-1]["commit"]:
        table[-1]["commit"] = commit_of(table[-1]["round"])
    main_delta = deltas.get(a.targeted)
    r4 = lambda x: "" if x is None else f"{x:.4f}"
    table.append({"round": rnd, "started_at": meta["started_at"], "ended_at": meta["ended_at"],
                  "check_targeted": a.targeted, "hypothesis": a.hypothesis, "change": a.change,
                  "papiers_ids": a.papiers_ids, "coach_notes": a.coach_notes, "right_person": r4(new["right_person"]),
                  "right_spread": r4(new["right_spread"]), "right_group_gaps": r4(new["right_group_gaps"]),
                  "steady": r4(new["steady"]), "marks_passed": new["marks_passed"], "delta_vs_prev": r4(main_delta),
                  "cost_usd": f"{meta['cost_usd']:.2f}", "kept": "yes" if kept else "no",
                  "signed_off_by": "", "signed_off_at": "", "commit": ""})
    write(table)
    if not kept:                                            # the next round starts from the last kept instructions
        shutil.copy(prev_dir / "instructions.md", HERE / "instructions.md")

    on_trial = [r["round"] for r in table if r["kept"] == "yes" and not r["signed_off_by"]]
    best = max(up, key=lambda c: deltas[c] / noise[c]) if up else a.targeted
    subject = (f"round {int(rnd):02d} keep (on trial): {a.label} — {best} {deltas[best]:+.3f}" if kept else
               f"round {int(rnd):02d} discard: {a.label} — " +
               (f"{', '.join(down)} fell past noise" if down else "within noise"))
    print(json.dumps({"kept": kept, "reason": reason, "triggers_fired": fired, "on_trial": on_trial,
                      "spend_total_usd": round(spend, 2), "commit_subject": subject}, indent=1))
    if len(on_trial) >= 2:
        print("2 changes are on trial: wait for a sign-off; until then try ideas on the tuning set only")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path, nargs="?")
    ap.add_argument("--targeted", choices=evaluate.CHECKS)
    ap.add_argument("--label")
    ap.add_argument("--change")
    ap.add_argument("--hypothesis")
    ap.add_argument("--papiers-ids", default="")
    ap.add_argument("--coach-notes", default="")
    ap.add_argument("--sign-off", metavar="NNN")
    ap.add_argument("--review", metavar="NNN", help="record a coach's typed review of a finished round")
    ap.add_argument("--verdict", choices=("sign-off", "reject", "continue"))
    ap.add_argument("--comment", default="")
    ap.add_argument("--improvement", default="")
    ap.add_argument("--by")
    a = ap.parse_args()
    if a.review:
        review(a.review, a.by or sys.exit("--by <coach> is required"), a.verdict or sys.exit("--verdict is required"),
               a.comment, a.improvement)
    elif a.sign_off:
        sign_off(a.sign_off, a.by or sys.exit("--by <coach> is required"))
    elif not (a.folder and a.targeted and a.label and a.change and a.hypothesis):
        sys.exit("give the round folder, --targeted, --label, --change and --hypothesis")
    else:
        record(a)
