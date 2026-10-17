# Builds the evaluation set for the persona tuning loop from Twin-2K-500 `wave_split` (CC BY 4.0).
# Picks 240 eligible respondents with a fixed seed, splits them 40 tuning / 100 check / 100 final balanced by age band,
# sex, income band and region, writes given answers and exams (no answers) into the repo, and writes the check and final
# answer sheets and consistency keys OUTSIDE the repo (ADR 0002). Exits non-zero if any exam question leaks into a
# respondent's given answers.
# Usage: python3 autoresearch/twin_loader.py      (needs the parquet files in ~/.cache/persona-swarm/twin/)
import collections, glob, json, os, random, re, sys, unicodedata
from pathlib import Path
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent              # persona-swarm/
DATA = ROOT / "data" / "twin"
CACHE = Path(os.path.expanduser("~/.cache/persona-swarm"))
RAW, LOCKED = CACHE / "twin", CACHE / "locked"
SEED, SIZES = 17, {"tuning": 40, "check": 100, "final": 100}
PATTERN = ["tuning"] * 2 + ["check"] * 5 + ["final"] * 5   # 2:5:5 per 12 = 40/100/100 over 240
ORDINAL_WORDS = ("agree", "likely", "favor", "favour", "support", "oppose", "definitely", "probably", "strongly",
                 "somewhat", "extremely", "very", "risk", "benefi")

def norm(text):
    t = unicodedata.normalize("NFKC", str(text)).lower()
    t = re.sub(r"[‐-―−]", "-", t).replace("’", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9$%' -]+", " ", t)).strip()

PRODUCT = re.compile(r"in that category: (.*?)\. The product is priced at")

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", norm(text)).strip("-")  # untruncated: "...Problem 1" and "...Problem 2" differ

def is_ordinal(options):
    """Within-one-step matching applies only to ordered scales of 5+ points (PLAN.md, settled decision 5)."""
    if not options or len(options) < 5:
        return False
    amounts = [re.sub(r"[^0-9.]", "", str(o)) for o in options]
    if all(amounts) and [float(a) for a in amounts] == sorted(float(a) for a in amounts):
        return True
    return any(w in norm(" ".join(map(str, options))) for w in ORDINAL_WORDS)

def family(block):
    return "policy" if block == "False consensus" else "pricing" if block.startswith("Product Preferences") else "puzzle"

def exam_items(blocks):
    """Wave-4 blocks -> ([item without answer], {item_id: answer position}). Free text, sliders and text-only skipped."""
    items, answers = [], {}
    for b in blocks:
        name = (b.get("BlockName") or "").strip()
        fam = family(name)
        for qi, q in enumerate(b.get("Questions") or []):
            qtype, ans = q.get("QuestionType"), (q.get("Answers") or {})
            pos = ans.get("SelectedByPosition")
            if qtype == "MC" and isinstance(pos, int) and q.get("Options"):
                if fam == "pricing":  # the block is shuffled per respondent, so items are named by product, not position
                    product = PRODUCT.search(q.get("QuestionText", ""))
                    if not product:
                        sys.exit(f"pricing question without a product name: {q.get('QuestionText', '')[:80]!r}")
                    iid = "price_" + "-".join(slug(product.group(1)).split("-")[:3])
                else:
                    iid = f"puzzle_{slug(name)}_{qi}"
                if fam == "policy":
                    iid = f"policy_q{qi}"
                opts = q["Options"]
                if 1 <= pos <= len(opts):
                    items.append({"id": iid, "family": fam, "block": name, "condition": name, "type": "MC",
                                  "text": q.get("QuestionText", ""), "options": opts, "ordinal": is_ordinal(opts)})
                    answers[iid] = pos
            elif qtype == "Matrix" and isinstance(pos, list) and q.get("Rows") and q.get("Columns"):
                cols, ordinal = q["Columns"], is_ordinal(q["Columns"])
                for k, (row, p) in enumerate(zip(q["Rows"], pos)):
                    iid = f"policy_{k + 1:02d}" if fam == "policy" else f"puzzle_{slug(name)}_{qi}_r{k + 1}"
                    if isinstance(p, int) and 1 <= p <= len(cols):
                        items.append({"id": iid, "family": fam, "block": name, "condition": name, "type": "Matrix",
                                      "text": f"{q.get('QuestionText', '')} {row}", "row": row, "options": cols,
                                      "ordinal": ordinal})
                        answers[iid] = p
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate item ids: {sorted(i for i in ids if ids.count(i) > 1)[:5]}"
    return items, answers

def demographics(given_blocks):
    demo = next((b for b in given_blocks if (b.get("BlockName") or "").strip() == "Demographics"), {"Questions": []})
    found = {}
    for q in demo["Questions"]:
        text, a = norm(q.get("QuestionText", "")), (q.get("Answers") or {}).get("SelectedText")
        for key, cue in (("region", "part of the united states"), ("sex", "sex that you were assigned"),
                         ("age", "how old are you"), ("income", "total family income"), ("party", "in politics today")):
            if cue in text and isinstance(a, str):
                found[key] = a
    inc = found.get("income", "")
    found["income_band"] = ("under_50k" if inc.startswith(("Less than $30", "$30,000")) else
                            "100k_plus" if inc.startswith("$100") or "or more" in inc else "50k_100k" if inc else "")
    return found

def leaks(given_text, items):
    """Exam item text whose content appears in the given answers (exact, or half of its 8-word runs)."""
    g = norm(given_text)
    shingles = lambda t: (lambda w: {" ".join(w[i:i + 8]) for i in range(len(w) - 7)})(t.split())  # split once
    gs, bad = shingles(g), []
    for it in items:
        t = norm(it.get("row") or it["text"])
        s = shingles(t)
        if (len(t) >= 25 and t in g) or (len(s) >= 2 and len(s & gs) / len(s) >= 0.5):
            bad.append(it["id"])
    return bad

def main():
    files = sorted(glob.glob(str(RAW / "*.parquet")))
    if not files:
        sys.exit(f"no parquet files in {RAW}: download Twin-2K-500 wave_split first (see PLAN.md Task 1)")
    # pass 1: demographics + eligibility for everyone (exam must have all 10 policy rows and 40 pricing items, twice)
    pool = []
    for f in files:
        t = pq.read_table(f, columns=["pid", "wave1_3_persona_json", "wave4_Q_wave4_A", "wave4_Q_wave1_3_A"])
        for pid, given, w4, w13 in zip(*(t.column(c).to_pylist() for c in t.column_names)):
            d = demographics(json.loads(given))
            items, ans = exam_items(json.loads(w4))
            _, earlier = exam_items(json.loads(w13))
            n = collections.Counter(i["family"] for i in items)
            ok = (n["policy"] >= 10 and n["pricing"] == 40 and all(k in d and d[k] for k in ("age", "sex", "income_band", "region"))
                  and all(i["id"] in earlier for i in items if i["family"] != "puzzle"))
            if ok:
                pool.append({"pid": str(pid), **{k: d.get(k, "") for k in ("age", "sex", "income", "income_band", "region", "party")}})
    rng = random.Random(SEED)
    rng.shuffle(pool)
    stratum = lambda r: (r["age"], r["sex"], r["income_band"], r["region"])
    # proportional stratified draw of 240, then a 2:5:5 cycle over stratum order spreads every stratum across sets
    by = collections.defaultdict(list)
    for r in pool:
        by[stratum(r)].append(r)
    total = sum(SIZES.values())
    quota = {k: len(v) * total / len(pool) for k, v in by.items()}
    take = {k: int(q) for k, q in quota.items()}
    for k in sorted(quota, key=lambda k: quota[k] - take[k], reverse=True)[: total - sum(take.values())]:
        take[k] += 1
    chosen = [r for k in sorted(by) for r in by[k][: take[k]]]
    def worst_gap(shift):  # largest gap between any set's share and the pool's share, over age/sex/income/region values
        sets = [PATTERN[(i + shift) % len(PATTERN)] for i in range(len(chosen))]
        gaps = [abs(sum(r[key] == v for r, s in zip(chosen, sets) if s == name) / n - sum(r[key] == v for r in chosen) / len(chosen))
                for key in ("age", "sex", "income_band", "region") for v in {r[key] for r in chosen} for name, n in SIZES.items()]
        return max(gaps)
    shift = min(range(len(PATTERN)), key=worst_gap)  # the most balanced rotation of the 2:5:5 cycle (each gives 40/100/100)
    if worst_gap(shift) > 0.10:
        sys.exit(f"no rotation keeps every set within 10 points of the pool (best gap {worst_gap(shift):.2f})")
    for i, r in enumerate(chosen):
        r["set"], r["seed"] = PATTERN[(i + shift) % len(PATTERN)], SEED
    assert collections.Counter(r["set"] for r in chosen) == SIZES, collections.Counter(r["set"] for r in chosen)
    want = {r["pid"]: r for r in chosen}

    # pass 2: write the chosen respondents
    for d in (DATA / "given", DATA / "exam"):
        d.mkdir(parents=True, exist_ok=True)
    LOCKED.mkdir(parents=True, exist_ok=True)
    tuning_ans, tuning_con, locked_ans, locked_con, leak_report, fams = [], [], [], [], {}, collections.Counter()
    for f in files:
        t = pq.read_table(f)
        for row in t.to_pylist():
            pid = str(row["pid"])
            if pid not in want:
                continue
            items, ans = exam_items(json.loads(row["wave4_Q_wave4_A"]))
            _, earlier = exam_items(json.loads(row["wave4_Q_wave1_3_A"]))
            bad = leaks(row["wave1_3_persona_text"], items)
            if bad:
                leak_report[pid] = bad
            fams.update(i["family"] for i in items)
            (DATA / "given" / f"{pid}.json").write_text(row["wave1_3_persona_json"])
            (DATA / "given" / f"{pid}.txt").write_text(row["wave1_3_persona_text"])
            (DATA / "exam" / f"{pid}.json").write_text(json.dumps(items, indent=1))
            con = {k: v for k, v in earlier.items() if k in ans}
            s = want[pid]["set"]
            if s == "tuning":
                tuning_ans.append({"pid": pid, "answers": ans}); tuning_con.append({"pid": pid, "answers": con})
            else:
                locked_ans.append({"pid": pid, "set": s, "answers": ans}); locked_con.append({"pid": pid, "set": s, "answers": con})
    write = lambda p, rows: p.write_text("".join(json.dumps(r) + "\n" for r in rows))
    write(DATA / "respondents.jsonl", chosen)
    write(DATA / "tuning_answers.jsonl", tuning_ans)
    write(DATA / "tuning_consistency.jsonl", tuning_con)
    write(LOCKED / "answers.jsonl", locked_ans)
    write(LOCKED / "consistency.jsonl", locked_con)
    for p in (LOCKED / "answers.jsonl", LOCKED / "consistency.jsonl"):
        p.chmod(0o600)

    print(f"eligible {len(pool)} of 2,058; chosen {len(chosen)}: " + ", ".join(f"{k} {v}" for k, v in SIZES.items()))
    for key in ("age", "sex", "income_band", "region"):
        share = lambda rows: {v: round(c / len(rows), 2) for v, c in sorted(collections.Counter(r[key] for r in rows).items())}
        print(f"  {key:12s} chosen {share(chosen)}")
        for s in SIZES:
            print(f"  {'':12s} {s:7s} {share([r for r in chosen if r['set'] == s])}")
    print(f"exam items written: {dict(fams)}")
    if leak_report:
        for pid, bad in list(leak_report.items())[:10]:
            print(f"LEAK pid {pid}: {bad[:5]}")
        sys.exit(f"leakage check FAILED for {len(leak_report)} respondents")
    print("leakage check passed: no exam item text found in any respondent's given answers")

if __name__ == "__main__":
    main()
