# A freeform hypothesis in, persona reactions out. The Anthropic prototype is kept for comparison;
# --provider vultr runs its planner and reactions on Vultr Serverless Inference instead.
# Usage: python scripts/plan.py --provider vultr "Raising TTC fares by 50 cents"
#   -> data/reactions/<group>/<run>.json with the planner's choice under "plan"
import argparse, asyncio, json, sys
from react import MAX_POLICY_CHARS, react, slug
from run_swarm import ROOT, api_json, read_env
from vultr_api import vultr_json

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

async def plan_and_react(hypothesis, provider="anthropic"):
    hypothesis = " ".join(hypothesis.split())
    if not hypothesis or len(hypothesis) > MAX_HYPOTHESIS_CHARS:
        raise ValueError(f"hypothesis must be 1–{MAX_HYPOTHESIS_CHARS} characters")
    env = read_env()
    if provider == "vultr":
        call = vultr_json
        planner_model = env.get("VULTR_ORCHESTRATOR_MODEL", "glm-5.3")
        persona_model = env.get("VULTR_PERSONA_MODEL", "glm-5.3-flash")
    elif provider == "anthropic":
        call = api_json
        planner_model = env.get("ORCHESTRATOR_MODEL", "claude-opus-5-5")
        persona_model = env.get("PERSONA_MODEL", "claude-haiku-5-5")
    else:
        raise ValueError(f"unknown provider {provider!r}")
    groups = json.loads((ROOT / "data" / "groups.json").read_text())["groups"]
    menu = "\n".join(f"- {g['id']}: {g['label']} ({g['size']} people)" for g in groups)
    plan, meta = await call(PLANNER_PROMPT, f"Hypothesis: {hypothesis}\n\nGroups:\n{menu}", planner_schema(groups),
                            planner_model, "medium")
    if plan is None:
        raise RuntimeError(f"planner failed: {meta.get('error')}")
    out, result = await react(plan["group"], plan["policy"], run=f"{slug(hypothesis)}-{provider}", call=call,
                              model=persona_model)
    result["plan"] = {"hypothesis": hypothesis, **plan, **meta}
    out.write_text(json.dumps(result, indent=1))
    return out, result

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["anthropic", "vultr"], default="anthropic")
    ap.add_argument("hypothesis", nargs="+")
    args = ap.parse_args()
    out, result = asyncio.run(plan_and_react(" ".join(args.hypothesis), provider=args.provider))
    s = result["summary"]
    print(f"{out}\nplanner: {result['plan']['group']}: {result['plan']['policy']}\n"
          f"{s['responded']}/{result['group']['size']} responded, {s['failed']} failed; stance {s['stance']}")
    sys.exit(1 if s["failed"] else 0)
