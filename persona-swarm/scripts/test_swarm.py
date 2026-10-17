# python scripts/test_swarm.py — offline checks of the pipeline's own logic, no model calls
import asyncio
from make_groups import labelled, matches, parse_where
from react import question, quote_check, react, slug
from run_swarm import persona_prompt, persona_sheet

p = {"uuid": "u1", "age": 28, "sex": "Female", "occupation": "fast_food_or_counter_worker", "city": "Madison",
     "state": "WI", "persona": "Mary is a routine‑obsessed bullet‑journal fan.", "bachelors_field": "",
     "situation": "You don't own a car."}

# prompt: empty fields are dropped, scenario context is on the sheet, the v3 restraint rule is there
prompt = persona_prompt(p)
assert "- age: 28" in prompt and "bachelors field" not in prompt and "- situation: You don't own a car." in prompt
assert "rather not say" in prompt

# quote check: plain hyphen matches the sheet's non-breaking one; context counts as part of the sheet
sheet = persona_sheet(p)
assert quote_check(sheet, "routine-obsessed bullet-journal fan") == "grounded"
assert quote_check(sheet, "don't own a car") == "grounded"
assert quote_check(sheet, "I love my dog Max") == "not_on_sheet" and quote_check(sheet, " ") == "empty"

# group labels: exact, any-of, age range, derived region and degree
q = labelled({"age": 70, "sex": "Female", "state": "TX", "education_level": "graduate", "marital_status": "widowed"})
assert q["region"] == "South" and q["degree"] == "yes"
assert matches(q, {}) and matches(q, {"sex": "Female", "age": [65, 120]})
assert matches(q, {"marital_status": ["divorced", "widowed"]}) and not matches(q, {"region": "West"})
assert not matches(q, {"age": [18, 29]})
assert labelled({**q, "state": "PR"})["region"] == "Other"
assert parse_where(["sex=Female", "age=65-120", "marital_status=divorced,widowed", "age=30"]) == {
    "sex": "Female", "age": [30, 120], "marital_status": ["divorced", "widowed"]}

# reactions: policy text is validated before any model call
assert slug("Adult fares rise by $0.50!") == "adult-fares-rise-by-0-50" and slug("!!!") == "policy"
assert "bus fares double" in question("bus fares double")
for bad in ("", " ", "x" * 501):
    try:
        asyncio.run(react("all_adults", bad))
        raise AssertionError("accepted bad policy text")
    except ValueError:
        pass
print("ok")
