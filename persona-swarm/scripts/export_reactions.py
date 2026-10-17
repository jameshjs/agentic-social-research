# Flattens every policy-reaction run into one row per (group, run, persona) for the agent review dashboard.
# Usage: python scripts/export_reactions.py   -> data/dashboard/reactions.csv
import csv, json
from make_groups import card, labelled
from run_swarm import ROOT, load_jsonl

COLUMNS = ["row_id", "group", "group_label", "run", "policy", "generated_at", "persona", "name", "age", "sex",
           "education_level", "marital_status", "occupation", "city", "state", "region", "context", "situation",
           "stance", "action", "response", "sheet_quote", "quote_check", "error"]

def rows():
    # demographics come from the full persona, so runs saved before a card field existed still get every column
    pool = {p["uuid"]: card(labelled(p)) for p in load_jsonl(ROOT / "data" / "personas" / "pool_2000.jsonl")}
    for f in sorted((ROOT / "data" / "reactions").glob("*/*.json")):
        d = json.loads(f.read_text())
        for r in d["responses"]:
            p, ctx = pool[r["persona"]["uuid"]], r.get("context") or {}
            yield {"row_id": f"{d['group']['id']}:{f.stem}:{p['uuid'][:8]}", "group": d["group"]["id"],
                   "group_label": d["group"]["label"], "run": f.stem, "policy": d["policy"],
                   "generated_at": d["generated_at"], "persona": p["uuid"][:8],
                   **{k: p.get(k, "") for k in ("name", "age", "sex", "education_level", "marital_status",
                                                 "occupation", "city", "state", "region")},
                   "context": ctx.get("label", "none"), "situation": ctx.get("text", ""),
                   **{k: r.get(k, "") for k in ("stance", "action", "response", "sheet_quote", "quote_check", "error")}}

def main():
    data = list(rows())  # load everything first, so a failed load can't truncate an existing CSV
    out = ROOT / "data" / "dashboard" / "reactions.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(data)
    print(f"{out}: {len(data)} rows")

if __name__ == "__main__":
    main()
