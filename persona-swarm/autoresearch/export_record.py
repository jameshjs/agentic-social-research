# Exports the tuning record for dashboard/tuning.html (Task 7). No model calls; standard library only.
# Reads   autoresearch/results.tsv                        one row per tuning round (header only before round 0)
#         autoresearch/rounds/<NNN>-<slug>/instructions.md  the instructions each round used
#         autoresearch/final/final.json                   optional; {section: [row, ...]}, written after the last round
# Writes  data/record/rounds.json  every results.tsv column (numbers as floats, blank as null) plus instructions_before
#                                  (the latest earlier kept or baseline round's instructions), instructions_after, and
#                                  the round's own check-set run per family (policy_/pricing_ right_person, right_spread,
#                                  right_group_gaps; null when not scored)
#         data/record/final.json   the final sections flattened to rows with a `section` and a `row_id` column; [] until then
# Usage: python3 autoresearch/export_record.py [--root DIR]      (DIR defaults to persona-swarm/)
import argparse, csv, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent              # persona-swarm/
COLUMNS = ["round", "started_at", "ended_at", "check_targeted", "hypothesis", "change", "papiers_ids", "coach_notes",
           "right_person", "right_spread", "right_group_gaps", "steady", "marks_passed", "delta_vs_prev", "cost_usd",
           "kept", "signed_off_by", "signed_off_at", "commit"]
NUMBERS = {"right_person", "right_spread", "right_group_gaps", "steady", "marks_passed", "delta_vs_prev", "cost_usd"}
KEPT = ("yes", "baseline")                                  # rounds whose instructions the next round starts from
FAMILY_FIELDS = [(f, c) for f in ("policy", "pricing") for c in ("right_person", "right_spread", "right_group_gaps")]

def number(text, where):
    """Blank, nan and inf give None; any other non-number stops the export and says where."""
    if not text:
        return None
    try:
        n = float(text)
    except ValueError:
        sys.exit(f"{where}: not a number: {text!r}")
    return n if math.isfinite(n) else None

def read_results(path):
    """results.tsv -> row dicts in round order. Raw tab-separated text: quote marks are ordinary characters."""
    if not path.is_file():
        sys.exit(f"{path} not found (is --root the persona-swarm folder?)")
    with path.open(newline="", encoding="utf-8-sig") as fh:
        table = [(n, r) for n, r in enumerate(csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE), 1)
                 if any(c.strip() for c in r)]
    if not table:
        return []
    header = [c.strip() for c in table[0][1]]
    missing = [c for c in COLUMNS if c not in header]
    if missing:
        sys.exit(f"{path}: header lacks {', '.join(missing)}")
    rows = []
    for n, cells in table[1:]:
        if len(cells) > len(header):
            sys.exit(f"{path} line {n}: {len(cells)} cells for {len(header)} columns (a tab inside a text cell?)")
        row = dict(zip(header, [c.strip() for c in cells] + [""] * (len(header) - len(cells))))
        if not row["round"].isdigit():
            sys.exit(f"{path} line {n}: round must be digits such as 000, got {row['round']!r}")
        for col in NUMBERS:
            row[col] = number(row[col], f"{path} line {n} {col}")
        rows.append(row)
    return sorted(rows, key=lambda r: int(r["round"]))

def no_persona(folder):
    """Round 000 also holds the no-persona baseline run, whose one-line instructions are not the round's."""
    try:
        return bool(json.loads((folder / "meta.json").read_text(encoding="utf-8")).get("no_persona"))
    except (OSError, ValueError, AttributeError):
        return False

def instructions(rounds_dir, rnd):
    """The round's own instructions.md, exactly as written; "" when the round folder or file is missing."""
    key = f"{int(rnd):03d}"
    for folder in [*sorted(rounds_dir.glob(f"{key}-*")), rounds_dir / key]:
        if (folder / "instructions.md").is_file() and not no_persona(folder):
            return (folder / "instructions.md").read_text(encoding="utf-8")
    return ""

def by_family(rounds_dir, rnd):
    """The round's own run (not a re-measure) on the check set, per family, as policy_right_person etc."""
    key, fams = f"{int(rnd):03d}", {}
    for folder in sorted(rounds_dir.glob(f"{key}-*")):
        if (folder / "score.json").is_file() and not no_persona(folder):
            fams = json.loads((folder / "score.json").read_text(encoding="utf-8")).get("check", {}).get("by_family", {})
            break
    return {f"{f}_{c}": fams.get(f, {}).get(c) for f, c in FAMILY_FIELDS}

def build_rounds(root):
    rows = read_results(root / "autoresearch" / "results.tsv")
    before = ""                                             # round 000 has nothing earlier to compare with
    for row in rows:
        row["instructions_before"] = before
        row["instructions_after"] = instructions(root / "autoresearch" / "rounds", row["round"])
        row |= by_family(root / "autoresearch" / "rounds", row["round"])
        if row["kept"].lower() in KEPT:
            before = row["instructions_after"]
    return rows

def cell(v):
    """Keeps final.json cells flat: nested values become JSON text, nan and inf become null."""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return None if isinstance(v, float) and not math.isfinite(v) else v

def read_final(path):
    """final.json -> flat rows; one "pending" row until the loop writes it (the dashboard reads no empty file)."""
    if not path.is_file():
        return [{"section": "pending", "row_id": "pending:0", "status": "The final set is scored once, when the team stops the loop."}]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as e:
        sys.exit(f"{path}: {e}")
    if not isinstance(data, dict):
        sys.exit(f"{path}: expected an object of sections, e.g. {{\"scorecard\": [...]}}")
    out = []
    for section, rows in data.items():
        for i, row in enumerate(rows if isinstance(rows, list) else [rows]):
            if not isinstance(row, dict):
                row = {"value": row}
            out.append({"section": section, "row_id": f"{section}:{i}",
                        **{k: cell(v) for k, v in row.items() if k not in ("section", "row_id")}})
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=ROOT, help="the persona-swarm folder (default: this one)")
    root = ap.parse_args().root
    rounds = build_rounds(root)                             # load everything first, so a failure leaves the old export alone
    final = read_final(root / "autoresearch" / "final" / "final.json")
    out = root / "data" / "record"
    out.mkdir(parents=True, exist_ok=True)
    for name, data in (("rounds", rounds), ("final", final)):
        (out / f"{name}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False, allow_nan=False) + "\n",
                                          encoding="utf-8")
    kept = sum(r["kept"].lower() == "yes" for r in rounds)
    dropped = sum(r["kept"].lower() == "no" for r in rounds)
    print(f"{out}: {len(rounds)} rounds ({kept} kept, {dropped} discarded), {len(final)} final rows")

if __name__ == "__main__":
    main()
