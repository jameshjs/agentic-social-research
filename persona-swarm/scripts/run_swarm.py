# Shared persona-agent pieces: the persona prompt and one structured model call per agent.
# Backend is the logged-in `claude` CLI, so calls bill to your Claude plan and need no API key.
import asyncio, json, tempfile
from asyncio.subprocess import DEVNULL, PIPE
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL, EFFORT, CONCURRENCY = "claude-haiku-5-5", "low", 8
# an empty cwd plus these flags keeps CLAUDE.md, plugins, skills and MCP out of the persona's context (~114k -> ~1.4k tokens)
EMPTY_CWD = Path(tempfile.gettempdir()) / "persona-swarm-empty"
CLI_FLAGS = ["--tools", "", "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config",
             "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands",
             "--exclude-dynamic-system-prompt-sections", "--output-format", "json"]
PERSONA_FIELDS = ["sex", "age", "marital_status", "education_level", "occupation", "city", "state", "persona",
                  "professional_persona", "cultural_background", "skills_and_expertise", "hobbies_and_interests",
                  "career_goals_and_ambitions", "sports_persona", "arts_persona", "travel_persona", "culinary_persona",
                  "situation"]  # situation: scenario facts react.py adds per run; Nemotron rows don't have it

# Prompt "v3", the version that won the fidelity tests recorded in README.md: it declines facts the persona
# lacks (19/19) without dodging opinion questions, which v2 did.
PROMPT_VERSION = "v3"
PERSONA_PROMPT = (
    "You are the person described below. Answer every question as this person would, from their own life, "
    "values and habits. Stay in character and never mention being an AI or a study.\n\n"
    "Stay true to this description:\n"
    "- Facts about your life: use only the ones it contains. Do not invent names, relatives, events, possessions "
    "or numbers. If a question asks for a fact it doesn't give, choose \"I'd rather not say\" when it is offered.\n"
    "- Opinions and choices (how you'd vote, where you'd go, what you'd pick): always decide as this person would, "
    "from their values, work, habits and community. Don't dodge these because the description doesn't mention "
    "the exact topic.\n"
    "- When asked for a supporting phrase, copy it word for word from the description; leave it empty if none fits.")

def persona_sheet(p):
    return "\n".join(f"- {k.replace('_', ' ')}: {p[k]}" for k in PERSONA_FIELDS if p.get(k) not in (None, ""))

def persona_prompt(p):
    return PERSONA_PROMPT + "\n\n" + persona_sheet(p)

async def claude_json(system, prompt, schema, model=MODEL, effort=EFFORT):
    """One structured call through the CLI. Returns (output or None, meta)."""
    EMPTY_CWD.mkdir(exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "claude", "-p", "--model", model, "--effort", effort, *CLI_FLAGS, "--system-prompt", system,
        "--json-schema", json.dumps(schema), prompt, cwd=EMPTY_CWD, stdin=DEVNULL, stdout=PIPE, stderr=PIPE)
    out, err = await proc.communicate()
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        return None, {"error": (err or out).decode(errors="replace")[:300]}
    meta = {"cost_usd": d.get("total_cost_usd"), "duration_ms": d.get("duration_ms")}
    if d.get("is_error") or d.get("structured_output") is None:
        return None, {**meta, "error": str(d.get("result"))[:300]}
    return d["structured_output"], meta

def load_jsonl(path):
    # every caller needs the persona pool; a missing file should fail by name (rerun fetch_personas.py), not as []
    return [json.loads(line) for line in path.read_text().splitlines()]
