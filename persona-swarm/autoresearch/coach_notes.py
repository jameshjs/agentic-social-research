# Reads coach knowledge from Papiers at the start of a round (PLAN.md Task 8) and writes rounds/sources-pending.json:
# the queries run, their request ids, what came back, and the time. run_round.py moves it into the new round folder as
# sources.json. The token comes from persona-swarm/.env and is never printed or saved.
# Usage: python3 autoresearch/coach_notes.py ["search terms" ...]
import json, os, shutil, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def papiers(args, env):
    out = subprocess.run(["papiers", *args, "--json"], capture_output=True, text=True, env=env, timeout=60)
    try:
        return json.loads(out.stdout)
    except ValueError:
        return {"error": f"exit {out.returncode}: {(out.stderr or out.stdout).strip()[:300]}"}

def main(terms, out=ROOT / "autoresearch" / "rounds" / "sources-pending.json"):
    env = dict(os.environ)
    if (ROOT / ".env").exists():
        env |= {k.strip(): v.strip().strip("'\"") for k, _, v in (l.partition("=") for l in (ROOT / ".env").read_text().splitlines())
                if k.strip() and not k.lstrip().startswith("#")}
    queries = [["list", "--kind", "note", "--limit", "50"], ["list", "--kind", "highlight", "--since", "1d", "--limit", "50"],
               ["list", "--kind", "document", "--filter", "annotated=true", "--limit", "50"]]
    queries += [["search", t, "--limit", "10"] for t in terms]
    record = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "queries": [], "notes_used": []}
    if not shutil.which("papiers") or not env.get("PAPIERS_TOKEN"):
        record["status"] = "no live Papiers notes: CLI or token missing"
    else:
        for q in queries:
            res = papiers(q, env)
            items = res.get("results") or []
            record["queries"].append({"command": "papiers " + " ".join(q), "request_id": res.get("requestId"),
                                      "error": res.get("error"), "count": len(items),
                                      "items": [{k: i.get(k) for k in ("id", "kind", "title", "text", "snippet") if i.get(k)}
                                                for i in items]})
        found, failed = sum(q["count"] for q in record["queries"]), [q for q in record["queries"] if q["error"]]
        record["status"] = (f"Papiers failed on {len(failed)} of {len(queries)} queries" if failed else
                            f"{found} items found" if found else "Papiers library has no notes, highlights or annotated papers yet")
    Path(out).write_text(json.dumps(record, indent=1, ensure_ascii=False))
    print(record["status"])

if __name__ == "__main__":
    main(sys.argv[1:])
