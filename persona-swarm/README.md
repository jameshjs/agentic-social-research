# Persona swarm

Making the city's agents behave like real people. This is Steven's workstream in [`prd.md`](../prd.md) §14
(persona planner and agent decisions). Run every command from this folder.

## The goal

An **autoresearch loop** tunes one shared instruction file that every agent follows, until the agents pass a
human-likeness benchmark built from real people's survey answers
([Twin-2K-500](https://huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500), CC BY 4.0). An AI researcher proposes
each change. Teammates coach it through notes in Papiers and by approving or rejecting its proposals. The best
instructions then drive the agents in the product's demos (TTC fare and Bloor bike-lane removal).

What improves is **the instructions**: not a policy, and not the model, which is never retrained.

```
 THE PRODUCT (answers a policy question)            THE PERSONA TUNING LOOP (this folder, runs first)
 ───────────────────────────────────────            ─────────────────────────────────────────────────
 5 Screens          Aadit  city + dashboard          Twin exam  +  tuning loop  +  Papiers coaching
 4 Orchestrator     James  weeks, rules, metrics                 │
 3 Agents           Steven people + choices  ◄───────────────────┘  best instructions
 2 Research memory  Meet   Papiers adapter (fare / Bloor papers)
 1 Scenario         Meet   question → settings
```

Papiers is used in two places: Meet's layer 2 for policy evidence, and the persona tuning loop for coaching the
agents. Use one shared adapter for both.

## The evaluation set: Twin-2K-500

Real people answered survey waves 1–3 and, months later, wave 4, which repeated some questions. Per person (counts
from one person inspected; matrix questions hold several statements each):

| Part | What it is | Size | Who sees it |
|---|---|---|---|
| **Given** | Their waves 1–3 answers: demographics (14), personality (~44), money games and risk choices (~34), puzzles and money knowledge (~65) | 158 questions | The agent |
| **Exam** | Their wave-4 questions: policy opinions (10), decision puzzles (~13), "would you buy at this price?" (40). None appear in the given part. | ~63 | The agent, questions only |
| **Answer sheet** | Their real wave-4 answers | ~63 | **Locked**, scorer only |
| **Consistency key** | Their earlier answers to those same ~63 | ~63 | **Locked**: measures how often people repeat themselves (about 60% for this person) |

- **People:** 100, balanced by age, sex, income and region. Split **by person**: 60 to tune on, 20 to check each
  change, 20 kept for one final score.
- **Only use the `wave_split` config.** `full_persona` uses wave-4 answers for repeated questions, and its
  `persona_summary` probably does too. Either would hand the agent the answer sheet. Generate any short summary
  ourselves from waves 1–3 only.
- **Settings the loop may vary:** how much is given (10, 30 or all 158 answers) and how it's written: full text,
  compact Q&A, a topic profile, or a short card of about Nemotron size. The short card tests what transfers to the
  city's short personas.

### What "more human" means: checks computed by code, never by an AI

| Check | Question | Measure |
|---|---|---|
| 1. Right person | Did the agent give this person's answer? | Match rate as a share of that person's own consistency |
| 2. Right spread | Do 100 agents vary the way 100 people do? | Spread of agent answers ÷ spread of real answers (1 = same) |
| 3. Right group gaps | Do real group differences (older vs younger, by income) point the same way? | Share of gaps with the right direction |
| 4. Steady | Same answer when a question is reworded? | Agreement across 2 wordings |

The agents are compared with four baselines on the same scorecard: the most common answer, rules from demographics,
the most similar training person, and no persona. The final exam includes **question types never used in tuning**,
so a pass means the agents learned to read a person, not to recall question styles.

**Benchmark** (proposal; fix it before round 1, on the check set): right person ≥ 70% of human consistency, spread
≥ 0.8, group-gap direction ≥ 80%, and beats every baseline. Stop at 10 rounds whatever happens, then score the final 20
people once.

## One round of the loop

| Step | What happens | Papiers |
|---|---|---|
| 1. Score | Run the agents and find the weakest check, e.g. "agents too alike" | — |
| 2. Read | Search the team's library for that problem, preferring teammates' annotated papers | `papiers search "<problem>" --json`, `papiers list --kind note --since 1d`, `papiers read <id> --json` |
| 3. Propose | One change to `instructions.md`, citing the passage and note it came from | IDs saved with the round |
| 4. Ask | When triggered, ask a human with the evidence attached. Triggers: no gain in 3 tries, a suspicious jump, one check up and another down, a result that contradicts an annotated paper | The coach replies with a note in Papiers, or in our app |
| 5. Decide | Rerun the check set; keep only if the benchmark score improves | — |
| 6. Record | Write the round folder and one `results.tsv` row | The next round starts by reading new notes |

**The agent may edit** only `instructions.md` and the persona format setting. **Never** the scorer, the splits,
the benchmark, the personas themselves, or the model (Haiku, low effort).

**What stops "if you see question A, answer X":**
- The instructions are shared by every agent, so they can't name a person.
- The researcher sees scores, never the check or final answer sheets.
- The instructions are length-capped and rejected if they mention exam questions or answers.
- The final 20 people are never seen during tuning.
- A one-size answer is just the most-common-answer baseline, and it also fails the spread check.
- A human sees every kept change.

## Recording the tuning process

This is the planned layout. Nothing below is built yet.

```
autoresearch/
├── program.md        human-written brief: goal, benchmark, allowed edits, ask triggers   (humans edit)
├── instructions.md   the shared agent instructions                                         (the agent edits: the only file)
├── evaluate.py       frozen scorer: 4 checks + baselines                                   (no one edits during the loop)
├── twin_loader.py    picks 100 people, splits them, writes data/twin/, runs the leakage check
├── run_round.py      one round: agents answer → score → record
├── results.tsv       one row per round: the timeline the demo shows
└── rounds/NNN-<slug>/
    ├── instructions.md   the version used
    ├── answers.jsonl     each agent's answers (no real answers in here)
    ├── score.json        the 4 checks, baselines, change vs the last round
    ├── sources.json      Papiers query, item IDs read, human notes used
    └── decision.json     proposal, reason, kept or discarded, decided by agent or human, question and reply
data/twin/                given answers and exam questions per person (git-ignored, regenerable)
~/.cache/persona-swarm/locked/   answer sheet + consistency key, outside the repo so the researcher can't read them
```

`results.tsv` columns: `round, time, change, check_targeted, score_before, score_after, checks_passed, kept,
decided_by, papiers_ids, human_note`.

**Git:** one commit per kept round (for example `round 004 keep: reason from the person's own values [nte_…]`).
Discarded rounds keep their folder and are reverted. The git log and `results.tsv` together are the iteration record
for the Papiers judges.

## Live demo: one real person

Tuning always runs on many people. On stage, show **one** person so people can follow it.

1. **Person card:** an example drawn at random from the check set (say so on screen), with 5 facts from their given
   answers, such as region, age band, risk choices, and how much they offered in the $5 game.
2. **10 of their exam questions** in three columns: the real answer, the earlier version's answer, and the new
   version's answer, each with a tick or a cross.
3. **Timeline** from `results.tsv`: the check-set score rises, stalls, then a human note in Papiers redirects it.
4. **Live step:** a teammate writes a note → the agent reads it (`papiers list --kind note`) and proposes a change
   → it reruns **this person** (one call, a few seconds) and a 20-person mini check (an estimated 30–40 s, not yet
   measured) → the new point appears, labelled *decided by: human*.

The one person makes the story visible; the 20-person score is the evidence. Keep a recorded copy of the live step
in case the network fails.

## Papiers setup

```bash
cp .env.example .env                  # once; .env is git-ignored
# put the token from Papiers → Settings → API tokens after PAPIERS_TOKEN=
set -a; . ./.env; set +a              # load it into this shell
papiers auth status                   # should report a token
papiers doctor
```

Never commit the token, paste it in chat, or print it in logs. The team's docs ([papiers-setup.md](../papiers-setup.md))
describe the CLI as read-only, while the sponsor's page says it can "write findings back": ask the Papiers team. Until
that's settled, round summaries live in `results.tsv` and the round folders.

## Status

The build plan is [PLAN.md](./PLAN.md); the agreed vocabulary is in [CONTEXT.md](./CONTEXT.md) and the decisions in
[docs/adr/](./docs/adr/). Work happens on the `steven/persona-tuning-loop` branch.

| Built | Not built yet |
|---|---|
| The earlier reaction prototype in `scripts/` (below) and its self-check | `program.md`, `instructions.md`, `twin_loader.py`, `evaluate.py`, `run_round.py`, the timeline page |
| `.env` / `.env.example` for the Papiers token | A Papiers token, and teammate notes on the persona papers |

To save space, the downloaded Nemotron pool (11.6 MB), `data/groups.json` and the dashboard CSV were deleted. They
are regenerable: `fetch_personas.py` → `make_groups.py` → `export_reactions.py`. The paid reaction runs are kept in
`data/reactions/`.

Reading list to save and annotate in Papiers:
- Park et al. 2024, *Generative Agent Simulations of 1,000 People*
- The Twin-2K-500 paper and its mega-study
- Argyle et al. 2023, *Out of One, Many*
- Santurkar et al. 2023, *Whose Opinions Do Language Models Reflect?*
- Wang et al. 2025, on AI personas flattening identity groups

## Earlier prototype: Nemotron policy reactions

Pick a group of synthetic Nemotron personas, describe a policy, and get one in-character reaction each from Claude
Haiku 5.5 through the logged-in `claude` CLI. It costs about $0.01 per group of 20.
[Agent review dashboard](https://claude.ai/artifact/XuXbR17bYUsY6bjdsnitX3) (snapshot).

```bash
python3 scripts/fetch_personas.py     # re-download the pool (deleted to save space)
python3 scripts/make_groups.py        # groups from scripts/group_defs.json; add one with --add <id> "<label>" key=value
python3 scripts/react.py men "Adult transit fares rise by 50 cents per ride next year" \
    --context data/contexts/transit_split_men.json --run fare-transit-split
python3 scripts/export_reactions.py   # runs → data/dashboard/reactions.csv for the dashboard
python3 scripts/test_swarm.py         # offline self-check, no model calls
```

**Anthropic API benchmark path.** `scripts/plan.py` takes a freeform hypothesis: one Opus 5.5 call picks the
most affected group and words the proposal, then each persona in it reacts through Haiku 5.5. Calls bill to the API
key, not a Claude plan. Run `pip install anthropic` and put `ANTHROPIC_API_KEY` in `persona-swarm/.env` (see
`.env.example`). The tuning loop and `react.py` stay on the CLI.

```bash
python3 scripts/plan.py "Raising TTC fares by 50 cents will push low-income riders to drive"
```

**Vultr-only survey prototype path.** With a server-side `VULTR_INFERENCE_API_KEY` in `.env` or the shell, the same
script can use Vultr `glm-5.3` for planning and `glm-5.3-flash` for persona reactions. It requires no Anthropic API
key or SDK. The Vultr adapter enforces structured JSON and rejects a different returned model ID. First regenerate
the ignored persona pool and groups with the commands above. This survey prototype is not connected to the city's
event engine, and model quality has not been measured live. [Model and credit decision](../VULTR.md).

```bash
python3 scripts/plan.py --provider vultr "Raising TTC fares by 50 cents will push low-income riders to drive"
python3 scripts/test_vultr_api.py  # offline boundary checks, no Vultr key or network
```

What it taught us, which is the starting point for `instructions.md`:
1. **Only ask what the persona's data can answer.** Money questions made personas invent debts and children in 17% of
   answers.
2. **The best prompt so far (v3):** decline missing *facts*, but always decide *opinions* from the person's values.
   v1 invented answers to 11 of 19 unanswerable questions. v2 declined everything, opinions included.
3. **Wording moves everyone to one default.** Three wordings of the fare question gave three different near-unanimous
   answers (mostly mixed, all mixed, all oppose), and only 2 of 40 agents kept their stance across them.
4. **Context drives actions more than stance.** Drivers said "it barely affects me" (37/40) but 30/40 still opposed on
   behalf of others. Agents follow facts they're given; without them they fall back on the model's own view. That's
   what the Twin loop has to fix.

## Known limits

- Twin measures what real people **say on a survey**, not what they do over weeks, and has no Toronto, transit or
  cycling questions. Before agents go into the city they also need the scenario checks: they stick to their own
  facts, they respect the engine's rules (budgets, Fair Pass), and they match the direction of the team's papers.
- The Twin counts here come from one person; the loader produces the real numbers.
- The Nemotron pool was 20 random pages of 100 adjacent rows, not 2,000 independent draws.
