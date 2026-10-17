# A freeform hypothesis in, persona reactions out, through the Anthropic API: one Opus planner call picks the most
# affected group and restates the hypothesis as a concrete proposal, then every persona in that group reacts
# (react.py, one Haiku call each). Needs ANTHROPIC_API_KEY in persona-swarm/.env and `pip install anthropic`.
# Usage: python scripts/plan.py "Raising TTC fares by 50 cents will push low-income riders to drive"
#   -> data/reactions/<group>/<run>.json with the planner's choice under "plan"
import argparse, asyncio, json, sys
from react import MAX_POLICY_CHARS, react, slug
from run_swarm import ROOT, api_json, read_env

MAX_HYPOTHESIS_CHARS = 2000
PLANNER_PROMPT = (
    "You set up a simulated survey. Given a hypothesis about a policy, pick the one listed group of residents it most "
    "directly affects, and restate the policy as a concrete proposal a resident would hear about where they live: "
    "what changes, for whom, and when. State only the change, not its expected effects, so residents react to the "
    "proposal rather than to the hypothesis.")

def planner_schema(groups):
    return {"type": "object", "additionalProperties": False, "required": ["group", "policy", "why"], "properties": {
        "group": {"type": "string", "enum": [g["id"] for g in groups]},
        "policy": {"type": "string", "description": f"the proposal, one or two sentences, under {MAX_POLICY_CHARS} "
                                                   "characters"},
        "why": {"type": "string", "description": "one sentence on why this group"}}}

async def plan_and_react(hypothesis):
    hypothesis = " ".join(hypothesis.split())
    if not hypothesis or len(hypothesis) > MAX_HYPOTHESIS_CHARS:
        raise ValueError(f"hypothesis must be 1–{MAX_HYPOTHESIS_CHARS} characters")
    env = read_env()
    groups = json.loads((ROOT / "data" / "groups.json").read_text())["groups"]
    menu = "\n".join(f"- {g['id']}: {g['label']} ({g['size']} people)" for g in groups)
    plan, meta = await api_json(PLANNER_PROMPT, f"Hypothesis: {hypothesis}\n\nGroups:\n{menu}", planner_schema(groups),
                                env.get("ORCHESTRATOR_MODEL", "claude-opus-5-5"), "medium")
    if plan is None:
        raise RuntimeError(f"planner failed: {meta.get('error')}")
    out, result = await react(plan["group"], plan["policy"], run=slug(hypothesis), call=api_json,
                              model=env.get("PERSONA_MODEL", "claude-haiku-5-5"))
    result["plan"] = {"hypothesis": hypothesis, **plan, **meta}
    out.write_text(json.dumps(result, indent=1))
    return out, result

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("hypothesis", nargs="+")
    out, result = asyncio.run(plan_and_react(" ".join(ap.parse_args().hypothesis)))
    s = result["summary"]
    print(f"{out}\nplanner: {result['plan']['group']}: {result['plan']['policy']}\n"
          f"{s['responded']}/{result['group']['size']} responded, {s['failed']} failed; stance {s['stance']}")
    sys.exit(1 if s["failed"] else 0)
