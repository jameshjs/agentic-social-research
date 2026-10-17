# Persona formats (PLAN.md Task 2): how a respondent's given answers are written out for a persona agent.
# full = Twin's own text · compact = Q&A without unchosen options · profile = compact grouped by topic ·
# short_card = demographics + three tendencies (price sensitivity is left out: Twin's given answers don't measure it).
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GIVEN = ROOT / "data" / "twin" / "given"
FORMATS = ("full", "compact", "profile", "short_card")
TOPICS = {"Demographics": "About me", "Personality": "My personality and values",
          "Economic preferences": "Money, risk and fairness choices", "Cognitive tests": "Puzzles and knowledge"}
OPENNESS = {"original": 1, "curious": 1, "ingenious": 1, "imagination": 1, "inventive": 1, "values artistic": 1,
            "reflect": 1, "sophisticated in art": 1, "routine": -1, "few artistic": -1}

def blocks(pid):
    return json.loads((GIVEN / f"{pid}.json").read_text())

def answered(bl):
    """(block name, question, answer text) for every answered question, in survey order."""
    for b in bl:
        name = (b.get("BlockName") or "").strip()
        for q in b.get("Questions") or []:
            t, a = q.get("QuestionType"), q.get("Answers") or {}
            text = " ".join(str(q.get("QuestionText", "")).split())
            if t == "MC" and isinstance(a.get("SelectedText"), str):
                yield name, text, a["SelectedText"]
            elif t == "Matrix" and isinstance(a.get("SelectedText"), list) and q.get("Rows"):
                yield name, text, "; ".join(f"{r}: {s}" for r, s in zip(q["Rows"], a["SelectedText"]))
            elif t == "TE" and a.get("Text"):
                yield name, text, " ".join(str(a["Text"]).split()) if not isinstance(a["Text"], dict) else json.dumps(a["Text"])
            elif t == "Slider" and a.get("Values") is not None:
                yield name, text, json.dumps(a["Values"])

def _qa(items):
    return "\n".join(f"Q: {q}\nA: {a}" for _, q, a in items)

def tendencies(bl):
    """Three tendencies scored 0..1 from fixed given blocks; None when a respondent lacks the questions."""
    risk, give, open_ = [], None, []
    for b in bl:
        for q in b.get("Questions") or []:
            text, a = str(q.get("QuestionText", "")), (q.get("Answers") or {})
            pos = a.get("SelectedByPosition")
            if q.get("QuestionType") == "Matrix" and "LOTTERY is a 50% chance of winning" in text and isinstance(pos, list):
                risk.append(sum(p == 1 for p in pos) / len(pos))  # column 1 = keep the lottery over the sure amount
            elif q.get("QuestionType") == "MC" and "had to offer to another (anonymous) person" in text and isinstance(pos, int):
                give = (6 - pos) / 5  # option 1 = give all $5 away, option 6 = keep all
            elif q.get("QuestionType") == "Matrix" and "characteristics that may or may not apply" in text and isinstance(pos, list):
                for row, p in zip(q.get("Rows") or [], pos):
                    sign = next((s for k, s in OPENNESS.items() if k in row.lower()), 0)
                    if sign and isinstance(p, int):
                        v = (p - 1) / 4
                        open_.append(v if sign > 0 else 1 - v)
    mean = lambda xs: sum(xs) / len(xs) if xs else None
    return {"risk tolerance": mean(risk), "concern for others": give, "openness to change": mean(open_)}

def _level(x):
    return "unknown" if x is None else "low" if x < 1 / 3 else "medium" if x < 2 / 3 else "high"

def render(pid, fmt, given_size=None):
    if fmt not in FORMATS:
        raise ValueError(f"unknown persona format {fmt!r}; choose one of {FORMATS}")
    bl = blocks(pid)
    items = list(answered(bl))
    if given_size is not None:
        items, fmt = items[:given_size], ("compact" if fmt == "full" else fmt)
    if fmt == "full":
        return (GIVEN / f"{pid}.txt").read_text()
    if fmt == "compact":
        return _qa(items)
    if fmt == "profile":
        out = []
        for heading in dict.fromkeys(TOPICS.get(n, "Other answers") for n, _, _ in items):
            out.append(f"## {heading}\n" + _qa([i for i in items if TOPICS.get(i[0], "Other answers") == heading]))
        return "\n\n".join(out)
    demo = {q: a for n, q, a in items if n == "Demographics"}
    lines = [f"- {q.rstrip('?:')}: {a}" for q, a in demo.items()]
    lines += [f"- {k}: {_level(v)}" for k, v in tendencies(bl).items()]
    return "About this person:\n" + "\n".join(lines)
