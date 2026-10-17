# Reads coach knowledge from Papiers at the start of a round (PLAN.md Task 8) and writes rounds/sources-pending.json:
# every paper in the library, every highlight and note in full (with its paper), any searches, their request ids and
# the time. run_round.py moves it into the new round folder as sources.json, so each round records the context it had.
# The token comes from persona-swarm/.env and is never printed or saved.
# Usage: python3 autoresearch/coach_notes.py ["search terms" ...]
import json, os, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST = {"papers": "document", "highlights": "highlight", "notes": "note"}

def papiers(args, env):
    out = subprocess.run(["papiers", *args, "--json"], capture_output=True, text=True, env=env, timeout=60)
    try:
        return json.loads(out.stdout)
    except ValueError:
        return {"error": f"exit {out.returncode}: {(out.stderr or out.stdout).strip()[:300]}"}

def full_text(item_id, env):
    item = (papiers(["read", item_id], env).get("items") or [{}])[0]
    return " ".join(str(item.get("content") or item.get("text") or "").split())

def main(terms, out=ROOT / "autoresearch" / "rounds" / "sources-pending.json"):
    env = dict(os.environ)
    if (ROOT / ".env").exists():
        env |= {k.strip(): v.strip().strip("'\"") for k, _, v in (l.partition("=") for l in (ROOT / ".env").read_text().splitlines())
                if k.strip() and not k.lstrip().startswith("#")}
    record = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "queries": [], "papers": [],
              "highlights": [], "notes": [], "notes_used": []}
    if not shutil.which("papiers") or not env.get("PAPIERS_TOKEN"):
        record["status"] = "no live Papiers notes: CLI or token missing"
    else:
        # shortcut: the first 50 of each kind; page with --cursor once the library grows past that
        queries = {name: ["list", "--kind", kind, "--limit", "50"] for name, kind in LIST.items()}
        queries |= {f"search {t}": ["search", t, "--limit", "10"] for t in terms}
        found = {}
        for name, q in queries.items():
            res = papiers(q, env)
            found[name] = res.get("results") or res.get("items") or []  # search: "results", list: "items"
            record["queries"].append({"command": "papiers " + " ".join(q), "request_id": res.get("requestId"),
                                      "error": res.get("error"), "count": len(found[name]),
                                      "ids": [i.get("id") for i in found[name]]})
        titles = {d["id"]: d.get("title") for d in found["papers"]}
        record["papers"] = [{"id": k, "title": v} for k, v in titles.items()]
        for name in ("highlights", "notes"):
            # notes keep their paper under metadata; a note's own title is its first line, never the paper's
            record[name] = [{"id": i["id"], "paper": titles.get(doc := i.get("documentId") or (i.get("metadata") or {}).get("documentId"),
                                                               (i.get("metadata") or {}).get("attachedTitle") or i.get("title")),
                             "document_id": doc, "updated_at": i.get("updatedAt"),
                             "text": full_text(i["id"], env)} for i in found[name]]
        failed = [q for q in record["queries"] if q["error"]]
        record["status"] = (f"Papiers failed on {len(failed)} of {len(queries)} queries" if failed else
                            f"{len(record['papers'])} papers, {len(record['highlights'])} highlights, "
                            f"{len(record['notes'])} notes")
    Path(out).write_text(json.dumps(record, indent=1, ensure_ascii=False))
    print(record["status"])

if __name__ == "__main__":
    main(sys.argv[1:])
