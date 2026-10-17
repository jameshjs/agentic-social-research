# Every persona in a demographic group reacts to a policy change in character: one low-effort Haiku call each.
# This is what the frontend calls: pick a group from data/groups.json, type a policy change, get one response per person.
# Usage: python scripts/react.py age_65_plus "Adult transit fares rise by 50 cents next year"
#   -> data/reactions/<group>/<policy slug>.json   (prints a stance count)
import argparse, asyncio, json, re, sys, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from run_swarm import (CONCURRENCY, EFFORT, MODEL, PROMPT_VERSION, ROOT, claude_json, load_jsonl, persona_prompt,
                       persona_sheet)

MAX_POLICY_CHARS = 500
STANCES = ["support", "oppose", "mixed", "not_affected"]
SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["stance", "action", "response", "sheet_quote"],
    "properties": {
        "stance": {"type": "string", "enum": STANCES},
        "action": {"type": "string", "description": "what you would do differently because of this, in one short "
                                                   "sentence; \"nothing\" if it wouldn't change what you do"},
        "response": {"type": "string", "description": "your reaction in one or two sentences, in your own voice"},
        # first run: personas quoted the proposal itself, because "the description above" was ambiguous
        "sheet_quote": {"type": "string", "description": "a short phrase copied word for word from YOUR PERSONA "
                        "DESCRIPTION (not from the proposal) that drives your reaction; empty if nothing in it does"}}}

def question(policy):
    # run 1: personas claimed routines their description never states ("I ride the bus every day").
    # run 2: "say you're not sure" made every answer open with "my description doesn't say…" and all hedge to mixed.
    return (f"A change is being proposed where you live: {policy}\n\n"
            "Do you support it? How would it affect you, and what, if anything, would you do differently?\n"
            "Answer as yourself, never mentioning a description or profile. Where your life doesn't settle whether "
            "this touches you directly, weigh what's likely for someone with your work, age, habits and community, "
            "without claiming specific routines you don't have. Take a clear side if your values point one way.")

def norm(text):
    """Lowercase, NFKC, one kind of dash and quote, single spaces: the sheet uses non-breaking hyphens."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = re.sub(r"[‐-―−]", "-", t).replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", t).strip(" .\"'")

def quote_check(sheet, quote):
    """Free check that the agent reasoned from its own persona: is the phrase it cites really on its sheet?"""
    if not quote or not quote.strip():
        return "empty"
    return "grounded" if norm(quote) in norm(sheet) else "not_on_sheet"

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "policy"

async def react(group_id, policy, contexts=None, run=None):
    """contexts: optional {uuid: {"label": ..., "text": ...}}, scenario facts added to that persona's sheet as its
    current situation (e.g. transit use, car access). run: optional output name instead of the policy slug."""
    contexts = contexts or {}
    policy = " ".join(policy.split())
    if not policy or len(policy) > MAX_POLICY_CHARS:
        raise ValueError(f"policy text must be 1–{MAX_POLICY_CHARS} characters")
    groups = {g["id"]: g for g in json.loads((ROOT / "data" / "groups.json").read_text())["groups"]}
    if group_id not in groups:
        raise ValueError(f"unknown group {group_id!r}; choose one of {', '.join(groups)}")
    pool = {p["uuid"]: p for p in load_jsonl(ROOT / "data" / "personas" / "pool_2000.jsonl")}
    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(card):
        ctx = contexts.get(card["uuid"])
        p = {**pool[card["uuid"]], "situation": ctx["text"]} if ctx else pool[card["uuid"]]
        base = {"persona": card, "context": ctx}
        async with sem:
            answer, meta = await claude_json(persona_prompt(p), question(policy), SCHEMA)
        if answer is None:  # one failed persona must not sink the group; the frontend shows it as missing
            return {**base, "error": meta.get("error")}
        return {**base, **answer, "quote_check": quote_check(persona_sheet(p), answer.get("sheet_quote", ""))}

    responses = await asyncio.gather(*(one(c) for c in groups[group_id]["members"]))
    ok = [r for r in responses if "error" not in r]
    result = {
        "group": {k: groups[group_id][k] for k in ("id", "label", "size")}, "policy": policy, "run": run,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": MODEL, "effort": EFFORT, "prompt_version": PROMPT_VERSION,
        "summary": {"responded": len(ok), "failed": len(responses) - len(ok),
                    "stance": {s: sum(r["stance"] == s for r in ok) for s in STANCES},
                    "quote_grounded": sum(r["quote_check"] == "grounded" for r in ok)},
        "responses": responses}
    out = ROOT / "data" / "reactions" / group_id / f"{slug(run or policy)}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=1))
    return out, result

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("group")
    ap.add_argument("policy", nargs="+")
    ap.add_argument("--context", help="JSON file: {uuid: {label, text}} scenario facts per persona")
    ap.add_argument("--run", help="output name, default is the policy text")
    a = ap.parse_args()
    ctx = json.loads(Path(a.context).read_text()) if a.context else None
    out, result = asyncio.run(react(a.group, " ".join(a.policy), ctx, a.run))
    s = result["summary"]
    print(f"{out}\n{s['responded']}/{result['group']['size']} responded, {s['failed']} failed; stance {s['stance']}; "
          f"quote on sheet {s['quote_grounded']}/{s['responded']}")
    sys.exit(1 if s["failed"] else 0)
