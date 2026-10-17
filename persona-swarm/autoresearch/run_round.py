# Runs one tuning round (PLAN.md Task 5): every respondent in the chosen sets gets one persona-agent call that sees the
# shared instructions plus that respondent's given answers, and answers their exam. Writes autoresearch/rounds/NNN-<slug>/
# with the instructions used, answers, scores and timing/cost. The researcher adds sources.json and decision.json.
# Usage: python3 autoresearch/run_round.py --slug start --sets tuning,check [--format full_relative] [--steady] [--dry-run]
import argparse, asyncio, json, random, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path[:0] = [str(HERE), str(ROOT / "scripts")]
import formats  # noqa: E402
from run_swarm import EFFORT, MODEL, claude_json  # noqa: E402

DATA = ROOT / "data" / "twin"
ROUNDS = HERE / "rounds"
MAX_WORDS, CONCURRENCY = 600, 8
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["answers"],
          "properties": {"answers": {"type": "array", "items": {
              "type": "object", "additionalProperties": False, "required": ["id", "answer"],
              "properties": {"id": {"type": "string"}, "answer": {"type": "integer"}}}}}}
PRODUCT = re.compile(r"in that category: (.*?)\. The product is priced at")
NO_PERSONA = "You are an adult living in the United States. Answer every question as yourself, with your best guess."

def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def respondents(sets):
    rows = [json.loads(line) for line in (DATA / "respondents.jsonl").read_text().splitlines()]
    return [r for r in rows if r["set"] in sets]

def exam(pid, families):
    return [i for i in json.loads((DATA / "exam" / f"{pid}.json").read_text()) if i["family"] in families]

def norm(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9$% ]+", " ", str(t).lower())).strip()

def scan(instructions, pids):
    """Refuse instructions that could smuggle exam content: too long, sharing any 8-word run with an exam item,
    or naming a pricing product (its first two words)."""
    words = norm(instructions).split()
    if len(words) > MAX_WORDS:
        return f"instructions are {len(words)} words; the cap is {MAX_WORDS}"
    runs, text = {" ".join(words[i:i + 8]) for i in range(len(words) - 7)}, f" {' '.join(words)} "
    for pid in pids:
        for it in json.loads((DATA / "exam" / f"{pid}.json").read_text()):
            w = norm(it.get("row") or it["text"]).split()
            if runs & {" ".join(w[i:i + 8]) for i in range(len(w) - 7)}:
                return f"instructions repeat exam text from item {it['id']}"
            product = PRODUCT.search(it["text"]) if it["family"] == "pricing" else None
            brand = product and " ".join(norm(product.group(1)).split()[:2])  # "bud light", "oscar mayer"
            if brand and f" {brand} " in text:
                return f"instructions name a pricing product ({brand!r}, item {it['id']})"
    return None

def question_text(items, steady=None):
    lines = ["Answer each question below as this person would. Reply only with the JSON answers, one per question id, "
             "where answer is the number of the option chosen.", ""]
    for it in items:
        text = it["text"]
        if steady and it["id"] in steady and it.get("row"):
            text = text.replace(it["row"], steady[it["id"]])  # same question stem, reworded statement
        lines.append(f"[{it['id']}] {text}")
        lines += [f"  {k}) {o}" for k, o in enumerate(it["options"], 1)]
    return "\n".join(lines)

def valid(items, out):
    """Keep only answers for asked ids whose value is a real option number."""
    sizes = {it["id"]: len(it["options"]) for it in items}
    got = {}
    for a in (out or {}).get("answers", []):
        if a.get("id") in sizes and isinstance(a.get("answer"), int) and 1 <= a["answer"] <= sizes[a["id"]]:
            got[a["id"]] = a["answer"]
    return got

async def ask(system, items, steady, sem, dry):
    """One respondent: ask, retry once for anything missing; return (answers, cost, calls, failed)."""
    if dry:
        return {it["id"]: random.randint(1, len(it["options"])) for it in items}, 0.0, 0, 0
    got, cost, calls, failed, todo = {}, 0.0, 0, 0, items
    for _ in range(2):
        async with sem:
            out, meta = await claude_json(system, question_text(todo, steady), SCHEMA, MODEL, EFFORT)
        calls += 1
        cost += meta.get("cost_usd") or 0
        failed += out is None
        got |= valid(todo, out)
        todo = [it for it in items if it["id"] not in got]
        if not todo:
            break
    return got, cost, calls, failed

def score_round(out_dir, baseline_file):
    """Score a round folder's answers.jsonl with the frozen scorer and write score.json (also used to re-score)."""
    import evaluate
    meta = json.loads((out_dir / "meta.json").read_text())
    rows = [json.loads(line) for line in (out_dir / "answers.jsonl").read_text().splitlines()]
    no_persona = {}  # {set: {pid: answers}} from the stored no-persona run (Task 9)
    if not meta["no_persona"] and baseline_file.exists():
        for r in map(json.loads, baseline_file.read_text().splitlines()):
            no_persona.setdefault(r["set"], {})[r["pid"]] = r["answers"]
    families = ("policy", "pricing", "puzzle") if meta.get("all_families") else ("policy", "pricing")
    scores = {}
    for s in meta["sets"]:
        if meta["no_persona"] and s == "final":
            continue  # the baseline is an input to the one final scoring, never a scoring of its own
        ans = {r["pid"]: r["answers"] for r in rows if r["set"] == s}
        steady = {r["pid"]: r["steady_answers"] for r in rows if r["set"] == s and "steady_answers" in r} or None
        scores[s] = evaluate.score(ans, s, families=families, steady_answers=steady, no_persona=no_persona.get(s))
    (out_dir / "score.json").write_text(json.dumps(scores, indent=1))
    print(json.dumps({"meta": meta, "scores": {s: {k: v for k, v in sc.items() if k in (
        "right_person", "right_spread", "right_group_gaps", "steady", "marks_passed", "missing_share", "invalid")}
        for s, sc in scores.items()}}, indent=1))
    return scores

async def run(args):
    sets = args.sets.split(",")
    if args.dry_run and "final" in sets:
        sys.exit("dry runs never touch the final set: it is scored once, after round 10")
    people = respondents(sets)
    instructions = NO_PERSONA if args.no_persona else Path(args.instructions).read_text()
    problem = None if args.no_persona else scan(instructions, [r["pid"] for r in people])
    if problem:
        sys.exit(f"refused before any model call: {problem}")
    if not args.dry_run:
        import record_round
        if wait := record_round.needs_review():                 # a coach reviews every round before the next (ADR 0003)
            sys.exit(f"refused before any model call: {wait}")
    ROUNDS.mkdir(exist_ok=True)
    n = args.number if args.number is not None else 1 + max([int(p.name[:3]) for p in ROUNDS.glob("[0-9][0-9][0-9]-*")], default=-1)
    out_dir = ROUNDS / (f"dry-{args.slug}" if args.dry_run else f"{n:03d}-{args.slug}")  # dry runs stay unnumbered
    out_dir.mkdir(exist_ok=args.dry_run)
    (out_dir / "instructions.md").write_text(instructions)
    if not args.dry_run and (ROUNDS / "sources-pending.json").exists():  # the Papiers lookup made before this round
        (ROUNDS / "sources-pending.json").rename(out_dir / "sources.json")
    rewordings = {r["id"]: r["reworded"] for r in json.loads((HERE / "rewordings.json").read_text())}
    sem, started, t0 = asyncio.Semaphore(args.concurrency), now(), time.time()
    families = ("policy", "pricing", "puzzle") if args.all_families else ("policy", "pricing")

    async def one(r):
        items = exam(r["pid"], families)
        persona = "" if args.no_persona else formats.render(r["pid"], args.format, args.given_size)
        system = instructions if args.no_persona else f"{instructions}\n\n{persona}"
        ans, cost, calls, failed = await ask(system, items, None, sem, args.dry_run)
        row = {"pid": r["pid"], "set": r["set"], "answers": ans, "missing": len(items) - len(ans)}
        if args.steady and r["set"] != "tuning":
            st_items = [it for it in items if it["id"] in rewordings]
            st, c2, k2, f2 = await ask(system, st_items, rewordings, sem, args.dry_run)
            row["steady_answers"], cost, calls, failed = st, cost + c2, calls + k2, failed + f2
        return row, cost, calls, failed

    results = await asyncio.gather(*(one(r) for r in people))
    rows = [x[0] for x in results]
    (out_dir / "answers.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    meta = {"round": f"{n:03d}", "slug": args.slug, "started_at": started, "ended_at": now(),
            "seconds": round(time.time() - t0, 1), "sets": sets, "format": args.format, "given_size": args.given_size,
            "no_persona": args.no_persona, "all_families": args.all_families, "model": MODEL, "effort": EFFORT, "dry_run": args.dry_run,
            "respondents": len(rows), "calls": sum(x[2] for x in results), "failed_calls": sum(x[3] for x in results),
            "missing_items": sum(r["missing"] for r in rows), "cost_usd": round(sum(x[1] for x in results), 4)}
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1))
    try:
        import evaluate  # noqa: F401
    except ImportError:
        print("evaluate.py not built yet: answers saved, no score")
        print(json.dumps(meta, indent=1))
        return out_dir
    score_round(out_dir, args.no_persona_answers)
    return out_dir

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--sets", default="tuning,check")
    ap.add_argument("--format", default="full_relative", choices=formats.FORMATS)  # the kept round 9's format (ADR 0004)
    ap.add_argument("--given-size", type=int)
    ap.add_argument("--instructions", default=str(HERE / "instructions.md"))
    ap.add_argument("--number", type=int, help="round number; default is the next free one")
    ap.add_argument("--steady", action="store_true", help="also ask the reworded policy items (check and final sets)")
    ap.add_argument("--no-persona", action="store_true", help="baseline: agents get no given answers")
    ap.add_argument("--no-persona-answers", type=Path, default=ROUNDS / "000-no-persona" / "answers.jsonl",
                    help="answers.jsonl of the stored no-persona baseline run")
    ap.add_argument("--all-families", action="store_true", help="also ask decision puzzles (final set only)")
    ap.add_argument("--concurrency", type=int, default=CONCURRENCY)
    ap.add_argument("--dry-run", action="store_true", help="random valid answers, no model calls")
    ap.add_argument("--rescore", type=Path, help="re-score an existing round folder; no model calls")
    a = ap.parse_args()
    score_round(a.rescore, a.no_persona_answers) if a.rescore else asyncio.run(run(a))
