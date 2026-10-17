# Persona swarm

The people in the city and the decisions they make. This is Steven's workstream in [`prd.md`](../prd.md) §14
(persona planner and agent decisions). Run the tuning loop's commands from this folder, and the city runtime's
from the repository root.

## Two parts

| Part | Status | What it is |
|---|---|---|
| **Persona tuning loop** ([`autoresearch/`](./autoresearch/)) | Done. Round 9 is signed off and the final set was scored once. | A researcher agent tuned one shared [`instructions.md`](./autoresearch/instructions.md) so Claude Haiku 5.5 persona agents (low effort, through the logged-in `claude` CLI) answer [Twin-2K-500](https://huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500) survey items the way the real respondents did. Only the instructions changed. The model was never retrained. |
| **City runtime** ([`runtime/`](./runtime/)) | Built and checked live on 17 Oct: polls of all 100 agents, both world runs, replay and remote mode. | 100 agents, each a Twin respondent's real answers packaged exactly as tuned and placed in a synthetic Toronto role, answer polls; 40 of them make the trip decisions in the paired experiment ([`experiment/runner.js`](../experiment/runner.js), unchanged). A local server streams it all to `/console`. Contract, results and handoff: [RUNTIME.md](./RUNTIME.md). |

What was signed off is round 9's `instructions.md` plus the `full_relative` persona format in
[`formats.py`](./autoresearch/formats.py). That format gives each person's full earlier answers (waves 1–3), plus three
percentile lines for spending, trust and risk, measured against the pool of 240 respondents.

## Results

The 240 respondents are split by person: 40 tuning, 100 check and 100 final. The final set was never seen during tuning
and was scored once. Policy and pricing questions:

| Check | What it asks | Final set | Check set, round 9 (2 runs) |
|---|---|---|---|
| Right person | How many of this person's own answers did the agent give, as a share of how consistent the person is with themselves? | **0.808** | 0.820 ± 0.011 |
| Spread | Do 100 agents vary as much as 100 people? (1 = the same) | **0.895** | 0.880 |
| Group gaps | Do real group differences point the same way? | **0.705** | 0.759 |
| Steady | Same answer when a question is reworded? | **0.957** | 0.970 ± 0.009 |

On right person, the agents beat all four baselines: no persona (0.756), the most common answer (0.744), the most
similar tuning person (0.703) and demographic rules (0.683).

**Honest limits:**

- **The gains are small.** Round 9's spread gain cleared its noise by 0.001, on the mean of 2 runs. On the final set,
  right person and steady fall just past the check set's noise.
- **Not every question family holds up.**
  - Pricing holds.
  - Policy right person (0.792) falls below the most common answer (0.810) and no persona (0.808).
  - The held-out decision puzzles, never used in tuning, fall below every baseline (0.834 against 0.848–0.855), with
    a spread of 0.522. Still, the agents reproduced the sign of 11 of 15 real experiment effects.
- **Staples never moved.** Milk and coffee stayed near a certain yes after the edits aimed at them (rounds 7–8).
- **30 given answers get nearly all the benefit.** On the check set, right person is 0.817 with each person's first 30
  answers, 0.820 with all ~158, and 0.757 with 10. The first 30, in survey order, are 14 demographics, 6 personality
  and values scales, and 10 puzzles. They include no money or risk games.
- **This is survey behaviour, not city behaviour.** Twin measures what US respondents *say* on a survey. It has no
  Toronto, transit or cycling questions. City decisions need their own evaluation (`runtime/evaluate.js`).

Every number, every round's diff and the decision trail are on the
[results page](https://claude.ai/artifact/717U6NqZVYDnqCbnRFvRUb). Its data comes from `data/record/`. The 60–90
second pitch walkthrough is [docs/demo.md](./docs/demo.md).

## Teammate quickstart

Node 18+ only; no install, no Python, no Twin data. Run every command from the repo root.

1. `git clone https://github.com/jameshjs/agentic-social-research.git` (or `git pull`), `cd` into it, then
   `cp persona-swarm/.env.example persona-swarm/.env`.
2. In `.env`, set `AGENT_BACKEND=remote`, and set `AGENT_SERVER_URL` and `CONSOLE_ACCESS_KEY` to the values Steven
   gives you. Agents run on his machine and plan.
3. Run `npm --prefix persona-swarm/runtime start`, then open http://127.0.0.1:4174/experience/. The server serves the
   site and the agents from one origin, so no CORS is needed. The browser never holds a key; your server keeps it in
   `.env` and forwards to Steven's.
4. Type a hypothesis or open a demo. `/console` is the developer view of the same agents.
5. With no access: set `AGENT_BACKEND=replay`. The site then shows "agents offline" with its prepared replays, and
   `/console` replays the committed 100-agent sample runs.
6. In any page the server serves: include `/persona-swarm/runtime/agents-client.js`, then call
   `AgentsClient.create().askAgents(question, { onAnswer })` or `.runPolicy('fare')`.

**On Steven's machine,** the agents run with `AGENT_BACKEND=token`, using `CLAUDE_CODE_OAUTH_TOKEN` from
`claude setup-token` (never shared), or `local`. Start with `-- --lan` or `-- --host <tailscale IP>` and set a
`CONSOLE_ACCESS_KEY`. Details: [RUNTIME.md](./RUNTIME.md#run-on-stevens-plan).

Live checks, 17 Oct:
- **Polls:** all 100 agents answered in 19.3 s at 32 in parallel.
- **World runs:** 560 calls each, about 105 s, 0 failed:
  - fare: 7 of 240 decisions changed;
  - Bloor: 44 of 240 changed, with 86% of Bloor riders' trips rerouting or switching.
- **Replay and remote mode** both work.

## Run the tuning loop

**Setup.**
- You need Python 3 and the logged-in `claude` CLI. Calls bill to the Claude plan, not an API key.
- Put the 7 Twin `wave_split` parquet files in `~/.cache/persona-swarm/twin/`. The URLs are in [PLAN.md](./PLAN.md).
- Run `pip install pyarrow`, then `python3 autoresearch/twin_loader.py`. This writes `data/twin/` (git-ignored) and
  the locked check and final answer sheets in `~/.cache/persona-swarm/locked/`, outside the repo.
- For Papiers coaching, run `cp .env.example .env` and fill in `PAPIERS_TOKEN`. [`coach_notes.py`](./autoresearch/coach_notes.py)
  reads `.env` itself. **Don't source `.env` into your shell** if it holds `ANTHROPIC_API_KEY`: an exported key moves
  every `claude -p` call to API billing.

**The loop.** A researcher agent (Claude Code) follows [program.md](./autoresearch/program.md). Each round runs these
steps, and a coach types a review before the next round can start ([ADR 0003](./docs/adr/0003-typed-coach-review-and-failure-driven-paper-research.md)):

```bash
python3 autoresearch/coach_notes.py "<problem>"                     # Papiers papers, highlights and notes for this round
python3 autoresearch/run_round.py --slug <name> --sets tuning,check --steady
python3 autoresearch/record_round.py autoresearch/rounds/NNN-<name> --targeted <check> \
    --label "<short change>" --change "<what changed>" --hypothesis "<why>"
python3 autoresearch/record_round.py --review NNN --by <name> --verdict sign-off --comment "..."
python3 autoresearch/export_record.py                               # data/record/*.json for the results page
```

The loop is stopped ([ADR 0004](./docs/adr/0004-stop-before-round-10-and-re-benchmark.md)). The final set has been
scored, and the scorer refuses a second scoring.

**The scratch live demo** ([docs/demo.md](./docs/demo.md)) makes 40 real Haiku calls with round 9's instructions,
on the tuning set only, outside the record. The rehearsal took 36 s at concurrency 16, with 0 failed calls, for $0.42.

```bash
python3 autoresearch/coach_notes.py "persona variety"
python3 autoresearch/run_round.py --scratch --slug live --concurrency 16
```

**Tests.** None of these makes a model call.

```bash
python3 autoresearch/test_autoresearch.py   # the frozen scorer and the review gate, on synthetic fixtures
python3 scripts/test_swarm.py               # the reaction prototype's own logic
python3 scripts/test_vultr_api.py           # the Vultr boundary; needs no key or network
npm --prefix runtime test                   # the city runtime and server: 38 tests
```

## Folder map

| Path | What's there |
|---|---|
| [`RUNTIME.md`](./RUNTIME.md) | The city runtime: commands, files, contract, smoke results, frontend handoff, decisions, open questions |
| `runtime/` | The city runtime: `server.js` and `console.html` (start here), `agents-client.js`, `claude-decision.js` (the agent), `orchestrator.js`, `run.js`, `evaluate.js`, `build_agents.py`, and the tests |
| [`PLAN.md`](./PLAN.md), [`CONTEXT.md`](./CONTEXT.md) | The loop's build plan and its vocabulary |
| `autoresearch/` | The tuning loop. `program.md` (the researcher's brief), `instructions.md` (round 9, signed off), `formats.py` (persona formats), `twin_loader.py`, `evaluate.py` (the frozen scorer), `run_round.py`, `record_round.py`, `coach_notes.py`, `rebench.py`, `write_final.py`, `export_record.py`, `results.tsv`, and one folder per round in `rounds/` and `final/` |
| `scripts/` | The earlier Nemotron reaction prototype. `run_swarm.py` holds the shared call helpers (`claude_json` through the CLI, `api_json` through the API). Also `react.py`, `plan.py` (an Opus planner that fans out to Haiku personas), `vultr_api.py` (Meet's Vultr survey path), and the pool scripts `fetch_personas.py`, `make_groups.py` and `export_reactions.py` |
| `dashboard/` | Page sources: `tuning.html` (the results page) and `agents.html` (a [review page](https://claude.ai/artifact/XuXbR17bYUsY6bjdsnitX3) for the reaction prototype) |
| `docs/` | [ADRs 0001–0004](./docs/adr/), the [demo script](./docs/demo.md), and `research/` reading notes |
| `data/` | `twin/` (git-ignored, regenerable), `record/` (the results page's data), `city/` (`agents.json`, the 100 bundles; `live/` saves, git-ignored except `live/samples/`), `reactions/` (paid Nemotron reaction runs), `contexts/` |

The Nemotron pool, `data/groups.json` and the reaction CSV are deleted to save space. You can regenerate them with
`fetch_personas.py`, then `make_groups.py`, then `export_reactions.py`.

## Known limits

- Twin respondents are US adults answering a survey. Survey likeness does not validate mobility choices.
- Deny rules don't block every shell route to the locked answer sheets. The scanner in `run_round.py`, coach
  sign-off and the once-only final set are the backstop.
- The Nemotron pool came from 20 random pages of 100 adjacent rows, not 2,000 independent draws.
- The Papiers CLI is read-only in [papiers-setup.md](../papiers-setup.md), but the sponsor's page says it can "write
  findings back". Until the Papiers team settles this, round summaries live in `results.tsv` and the round folders.
- What the reaction prototype taught us still holds for the city:
  - Agents follow the facts they are given. Without facts, they fall back on the model's own view.
  - Changing the wording can move every agent to one default.
