# Persona Tuning Loop: Implementation Plan

**Goal:** Tune one shared set of instructions so persona agents answer like real survey respondents, over exactly
10 tuning rounds steered by coaches. Every round is recorded with timestamps so the improvements, and the decision
behind each change, can be shown afterwards.

**Spec:** the decisions agreed on 17 Oct (Q1–Q31, summarised under Constraints below), the glossary in
[CONTEXT.md](./CONTEXT.md), [ADR 0001](./docs/adr/0001-twin-wave-split-benchmark-and-prompt-tuning-only.md) and
[ADR 0002](./docs/adr/0002-locked-answer-sheets-outside-the-repo.md), and [README.md](./README.md).

**Branch:** `steven/persona-tuning-loop`, created from `origin/main` at `ff429e7` with no upstream tracking. All work
and every round's commit go here. It is pushed and opened as a pull request to `main` only after round 10 and the
final scoring.

**Execution:** the main agent, with no delegation. The tuning rounds themselves are run by the researcher agent, a
Claude Code session following `autoresearch/program.md`.

## Important facts (checked 17 Oct)

- **Twin-2K-500 `wave_split`:** 2,058 respondents in 7 parquet files of about 27 MB each, at
  `huggingface.co/datasets/LLM-Digital-Twin/Twin-2K-500/resolve/refs%2Fconvert%2Fparquet/wave_split/data/000N.parquet`
  (N = 0–6). Columns: `pid`, `wave1_3_persona_text`, `wave1_3_persona_json`, `wave4_Q_wave1_3_A`, `wave4_Q_wave4_A`.
  pyarrow 21 and pandas 2.3 are installed.
- **Block shape:** each JSON column is a list of `{BlockName, Questions: [{QuestionType, QuestionText, Options, Rows,
  Answers}]}`. Question types seen: `MC`, `Matrix`, `TE` (free text), `Slider`, `DB` (text only). Answers carry
  `SelectedByPosition` (an int, or a list for matrices), `Values` or `Text`.
- **Demographics block (14 questions)** includes region (4 US regions), sex, age band (`18-29`, `30-49`, `50-64`,
  `65+`), education, race, marital status, party, family income bands (from `Less than $30,000` up), political views,
  household size and employment.
- **Wave 4 has 18 blocks per respondent.** Three are shared by everyone: `False consensus` (a matrix of 10 "support or
  oppose" policy items), `Product Preferences - Pricing` (40 yes/no purchase items after one `DB` intro) and
  `Non-experimental heuristics and biases`. The other 15 are randomly assigned conditions from pairs or triples
  (`Disease - gain` / `Disease-loss`, `Anchoring - redwood high` / `low`, `Proportion dominance 1A/1B/1C`, and so on).
  This was checked on 6 respondents.
- **One respondent inspected in full:** 158 given-answer questions, none of 9 sampled exam questions present in the
  given answers, and their own earlier answer repeated on 38 of 63 exam questions.
- **Reusable code:** `scripts/run_swarm.py` → `claude_json(system, prompt, schema, model, effort)`, which makes a
  structured call through the logged-in `claude` CLI with settings, plugins and MCP stripped, plus the v3 prompt
  text. `scripts/react.py` → `quote_check()` and `norm()`.
- **Team contracts:** [TEAM_SYNC.md](../TEAM_SYNC.md) makes the shared runtime the priority and this loop a
  supporting result. [demo-ui/replay-trace-spec.md](../demo-ui/replay-trace-spec.md) proposes persona JSON whose
  `traits` hold scenario facts (`income_weekly`, `fare_category`, `has_car`) plus a `deep_agent` flag.
- **This machine:** no `ANTHROPIC_API_KEY`, and the `claude` CLI is logged in through claude.ai, so persona agents
  bill to that plan.

## Constraints and invariants

| Area | Exact rule |
|---|---|
| Order | Tasks 1–11 start straight away. The runtime gate (Task 0) was dropped on 17 Oct at Steven's call; Task 12 still needs the runtime |
| Data source | `wave_split` only. Never read `full_persona` or `persona_summary` (ADR 0001) |
| Sets | Tuning 40 · Check 100 · Final 100, non-overlapping, drawn with a fixed seed and balanced across age band × sex × income band × region |
| Locked files | The raw parquet, and the check and final answer sheets and consistency keys, live in `~/.cache/persona-swarm/`, never in the repo. The researcher may read only tuning-set answer sheets (ADR 0002) |
| Question families | Tuning and check score **policy opinions** (`False consensus` rows) and **pricing** (`Product Preferences - Pricing`). **Decision puzzles** (every other block) are the held-out family, scored only on the final set |
| Matching | `MC` and yes/no: exact. Scales with 5 or more ordered points: within one step. `Matrix`: each row scored on its own. `TE`, `Slider`, `DB`: skipped |
| Scorecard | Right person, right spread, right group gaps, steady (definitions in Task 3), plus 4 baselines |
| Benchmark (check set) | Right person ≥ 0.70 of human consistency · right spread ≥ 0.80 · right group gaps ≥ 0.80 · beats every baseline on right person. Steady is reported and protected by the keep rule, but has no pass mark |
| Backend | Persona agents run through the `claude` CLI on the claude.ai plan. Switch to an Anthropic API key, with prompt caching for the repeated given answers, if the team gets one |
| Keep rule | Noise = per-check difference between two runs of the starting instructions. Keep a change only if at least one check improves by more than its noise and none falls by more than its noise. The number of benchmark marks passed may never fall |
| Loop length | Exactly 10 tuning rounds. Then the final set is scored once |
| Triggers (stop and ask) | 3 rounds in a row with no kept change · any check jumps by more than 3× its noise · one check rises past its noise while another falls past its noise · a result contradicts an annotated paper · the benchmark is passed · logged spend reaches $30 (raised from $10 on 17 Oct, after round 0 measured the cost) |
| While waiting | Ideas may be tried on the tuning set only. At most 2 changes may be on trial without sign-off |
| May change | `instructions.md` and the persona format setting only. Never the scorer, sets, benchmark, rewordings, given answers or the model (`claude-haiku-5-5`, low effort) |
| Sign-off | A coach types `sign off round NN — <name>` in the researcher session. Knowledge comes through Papiers notes, read at the start of each round. Coaches: Steven and Meet |
| Recording | Every round, kept or discarded, gets a timestamped folder and a commit. Only kept rounds change `instructions.md` |
| Page | A dashboard artifact, re-published at the end of every round |
| Adoption | Tuned instructions go into the city's deep agents if they beat the starting instructions by more than the noise and the city's own checks pass. Label them "benchmark not yet reached" if they don't pass it |

## Task 0: Runtime persona slice, built with James (no longer a gate)

Dropped as a gate on 17 Oct at Steven's call: the tuning loop starts without it. It remains the runtime work the city
needs, and Task 12 depends on it.

- **Produces:** persona JSON agreed with James in the shape of `replay-trace-spec.md`, and bounded JSON decisions
  for the TTC and Bloor prompts, pushed to `main` with the hash shared (TEAM_SYNC.md integration step 1).
- **Implementation decision:** propose to James a `tendencies` block on every persona, next to the spec's `traits`
  (which stay scenario facts): risk tolerance, price sensitivity, concern for others and openness to change, each
  tagged as an assumption with a range.
- **Acceptance check:** the commit is on `origin/main`, and James has confirmed that the engine accepts the decision
  JSON.

## Task 1: Twin loader, the three sets, and the leakage check

- **Files:** create `autoresearch/twin_loader.py` and `persona-swarm/.gitignore` (ignoring `data/twin/`).
- **Consumes:** the parquet URLs above, and `pyarrow`.
- **Produces:**
  - Repo, git-ignored: `data/twin/respondents.jsonl` (`pid`, `set`, demographics), `data/twin/given/<pid>.json`
    (given-answer blocks) and `data/twin/exam/<pid>.json`. Each exam item is `{id, family, block, condition, type,
    text, options, ordinal}`, with no answers.
  - `data/twin/tuning_answers.jsonl` and `data/twin/tuning_consistency.jsonl`: answer sheets and consistency keys
    for the tuning set only.
  - Outside the repo: `~/.cache/persona-swarm/twin/*.parquet`, and `~/.cache/persona-swarm/locked/answers.jsonl` and
    `consistency.jsonl` for the check and final sets.
- **Implementation decisions:**
  - Item ids: `policy_01`…`policy_10`, `price_01`…`price_40`, and `puzzle_<block-slug>_<n>` for puzzles, with
    matrix rows suffixed `_r<k>`.
  - `condition` = the block name.
  - `ordinal` = true for matrix rows, and for `MC` items whose options are an agreement, likelihood or favour ladder
    or monotonic dollar amounts. Every other `MC` item is matched exactly.
  - Sampling is seeded, and the seed is written into `respondents.jsonl`.
- **Acceptance checks:**
  - It prints set sizes of exactly 40/100/100, with no `pid` in two sets.
  - Each set's age band, sex, income band and region shares are within 10 points of the 240-respondent pool's.
  - **Leakage check:** for every respondent, no normalised exam question or row text, and no 8-word run from one,
    appears in their given answers. On a failure it exits non-zero and names the `pid` and item.
  - Searching `persona-swarm/` for any check or final `pid` with an `Answers` key finds nothing.

## Task 2: Persona formats and tendencies

- **Files:** create `autoresearch/formats.py`.
- **Consumes:** `data/twin/given/<pid>.json` from Task 1.
- **Produces:** `render(pid, fmt, given_size=None) -> str` for `fmt` ∈ `full` (Twin's text as is), `compact` (Q&A
  without unchosen options), `profile` (grouped by topic) and `short_card` (demographics plus three tendencies).
  `given_size` keeps the first N given answers, for the comparison in Task 11.
- **Implementation decisions:** the tendencies are computed from fixed given blocks:
  - risk tolerance ← the risk choice lists in `Economic preferences`
  - concern for others ← the $5 split offers
  - openness to change ← the openness items in `Personality`
  - price sensitivity is left out of Twin short cards, because the given answers don't measure it (the pricing items
    are exam questions). City personas still carry it.
- **Acceptance checks:**
  - Every format, for every respondent, passes Task 1's leakage check.
  - `short_card` is 150 words or fewer.
  - `given_size=10` returns exactly 10 answered questions.

## Task 3: The frozen scorer and baselines

- **Files:** create `autoresearch/evaluate.py` and `autoresearch/test_autoresearch.py`.
- **Consumes:** exam items (Task 1), agent answers `{pid: {item_id: int}}`, the locked answer sheets and consistency
  keys, and `tuning_answers.jsonl` for the baselines.
- **Produces:** `score(answers, set_name) -> dict`, giving all four checks, the baselines, the benchmark marks passed
  and the items missing, written to `score.json`. It also provides `keep(prev, new, noise) -> (bool, reason)` and
  records a SHA-256 of itself in every score.
- **Implementation decisions:**
  - **Right person** = total agent matches ÷ total human-consistency matches over the same respondents and items.
  - **Right spread** = mean over items of the entropy of agent answers ÷ the entropy of real answers, over items
    whose real entropy is above 0.
  - **Right group gaps** = the share of item × group splits with a real gap of at least 0.10 (answers scaled 0–1)
    where the agents' gap has the same sign. The splits are age 18–29 vs 65+, male vs female, family income under
    $50,000 vs $100,000 or more, and Democrat vs Republican.
  - **Steady** = the share of reworded policy items answered the same as the original wording, with the scale
    tolerance applied.
  - **Baselines:**
    - most common answer among tuning respondents
    - most common answer among tuning respondents with the same age band and income band
    - copy the tuning respondent with the most matching given answers
    - persona agents with no persona: run once in Task 9 and stored
  - A round is **invalid** if more than 5% of check-set items are missing.
- **Acceptance checks** (`python3 autoresearch/test_autoresearch.py`, offline, with synthetic fixtures):
  - Answers equal to the answer sheet give right person = 1 ÷ consistency.
  - Everyone giving the most common answer gives right spread below 0.2 and fails the benchmark.
  - Reversed group gaps score 0.
  - A scale answer one step away matches; two steps away doesn't.
  - `TE` and `Slider` items are ignored.
  - `keep()` rejects a gain within the noise and rejects any check falling beyond the noise.
  - Changing one byte of `evaluate.py` changes the recorded hash.

## Task 4: Rewordings for the steady check

- **Files:** create `autoresearch/rewordings.json`.
- **Produces:** one rewording for each of the 10 policy items, `{id, original, reworded, approved_by, approved_at}`.
- **Implementation decision:** an AI drafts the rewordings and a coach approves each for unchanged meaning. Once
  approved, the file is frozen and its hash is recorded in every score.
- **Acceptance check:** the scorer refuses to compute steady while any entry has no `approved_by`.

## Task 5: The round runner

- **Files:** create `autoresearch/run_round.py`.
- **Consumes:** `instructions.md`, the format setting, Task 2's `render()`, `run_swarm.claude_json` and Task 3's
  `score()`.
- **Produces:** `run_round(slug, sets)`, which writes `autoresearch/rounds/NNN-<slug>/` containing
  `instructions.md`, `answers.jsonl`, `score.json` and `meta.json` (start and end time, calls, failures, cost,
  timings). The researcher adds `sources.json` (Task 8) and `decision.json` (Task 10).
- **Implementation decisions:**
  - One call per respondent. The system prompt is the instructions plus the rendered persona; the user message lists
    their exam items with numbered options.
  - The schema is `{"answers": [{"id": str, "answer": int}]}`. Every id must be present and every answer between 1
    and the number of options; otherwise retry once, then mark the item missing.
  - Steady is a **separate** call per check respondent, containing only the 10 reworded items.
  - **Before any call,** reject instructions longer than 600 words, or containing any 8-word run from an exam item or
    any pricing product name.
  - A `--dry-run` backend returns random valid answers and makes no model calls.
- **Acceptance checks:**
  - A dry run on 3 respondents writes a complete round folder and a score.
  - Planting an exam sentence in `instructions.md` makes the runner refuse before calling anything.
  - `meta.json` holds start and end times and the cost.

## Task 6: The researcher's brief, starting instructions, and guardrails

- **Files:**
  - create `autoresearch/program.md` and `autoresearch/instructions.md`
  - add deny rules to `~/.claude/settings.json`, so no team file is touched; use the `update-config` skill
- **Produces:**
  - `program.md`: the goal, benchmark, allowed and forbidden edits, the 6 triggers and the waiting rules, the
    Papiers steps for each round, the sign-off protocol, the commit message formats, the re-publish step, and
    "after round 10: the final set once, then the extras".
  - Starting `instructions.md`: v3 from `run_swarm.py` without the "I'd rather not say" rule, plus "answer every
    question with your best guess of how this person would answer".
- **Implementation decision:** deny `Read(~/.cache/persona-swarm/**)`, and shell commands that name that path, in
  the researcher session.
- **Acceptance check:** in a dry-run session, asking the researcher to read `~/.cache/persona-swarm/locked/answers.jsonl`
  is blocked.

## Task 7: The tuning record and its page

- **Files:** create `autoresearch/results.tsv`, `autoresearch/export_record.py` and `dashboard/tuning.html`.
- **Produces:**
  - `results.tsv` with columns `round, started_at, ended_at, check_targeted, hypothesis, change, papiers_ids,
    coach_notes, right_person, right_spread, right_group_gaps, steady, marks_passed, delta_vs_prev, cost_usd, kept,
    signed_off_by, signed_off_at, commit`.
  - `export_record.py`, which writes `data/record/tuning_record.json`: rows plus each round's instructions before and
    after.
  - A Dashboard-type artifact built on `tuning.html`, showing, per round, the times, the hypothesis and sources, the
    **instructions diff** (computed in the page), the scores before and after, the cost and the decision. The final
    section is filled in by Task 11.
- **Implementation decision:** the researcher re-publishes after every round, in the same session (the artifact
  tools are not scriptable): export → upload the record as an asset → update the dataset document.
- **Acceptance check:** after round 0 the page shows row 000. A fake row shows a highlighted diff and a "discarded"
  label.

## Task 8: Papiers coaching setup

- **Consumes:** `.env` (`PAPIERS_TOKEN`) and [papiers-setup.md](../papiers-setup.md).
- **Produces:**
  - Steven's own token in `persona-swarm/.env`.
  - Park 2024 and the Twin-2K-500 paper saved and annotated by a coach.
  - Each round writes `sources.json`: the query, item ids read, coach notes used, and the time.
- **Acceptance checks:**
  - `papiers auth status` reports a token.
  - `papiers search "persona" --json` returns at least one annotated item.
  - With no token, `program.md`'s fallback applies: no live notes, and the record says so.

## Task 9: Round 0

- **Consumes:** Tasks 1–8, and Steven's go-ahead to spend model calls (the first real run).
- **Produces:** row `000`, holding:
  - the starting instructions run **twice** on the check set (the noise)
  - the tuning set run once
  - the no-persona baseline
  - the three code baselines
  - the measured round time and cost
- **Acceptance checks:**
  - Noise is recorded per check.
  - Measured before round 0: one `full`-format call is about 18k words, 18 s and $0.011 at list price, so a round
    is about $1.80, not the $0.60 first estimated, and the loop about $25. Original estimate: 240 persona calls of about 24k tokens, 140 for
    tuning and check plus 100 for steady. If a round takes over 15 minutes, raise `CONCURRENCY` from 8 to 16 and
    re-measure.

## Task 10: Tuning rounds 1–10

- **Consumes:** `program.md`, run by the researcher agent.
- **Produces:** rounds `001`–`010`, each committed on the branch as soon as it ends:
  - `round NN keep (on trial): <change> — <check> +x.xx`
  - `round NN discard: <change> — within noise`
  - `round NN signed off: <coach>` when a coach signs off a kept change
  - `round NN rejected by coach`, which restores the last signed-off instructions
- **Acceptance checks:**
  - Exactly 10 rounds exist.
  - Every row has times, the scores, the decision and a commit hash.
  - Every kept round is signed off, or explicitly rejected, before Task 11.
  - Every trigger that fired has the question and the coach's reply in its `decision.json`.

## Task 11: Final scoring, extras, and push

- **Produces:**
  - The final-set scorecard with the best signed-off instructions, scored once, against the baselines and human
    consistency.
  - The held-out decision-puzzle result.
  - Experiment effects: per condition pair, the real answer difference beside the agents', for choice and scale
    items.
  - A chart for 10, 30 and all 158 given answers.
  - Round 0 vs round 10 instructions, and a "follow one respondent" panel (a check-set respondent drawn by the seed).
- **Then:** fetch, rebase the branch onto `origin/main` if it has moved, `git push -u origin
  steven/persona-tuning-loop`, open a pull request to `main` (with Steven's approval), and share the hash.
- **Hand-off to Meet:** the page link (shared from its Share menu) and a recording of about 20 seconds from round 0
  to the final scores, for the pitch. The live Papiers moment stays with Meet's policy loop.
- **Acceptance checks:**
  - The final set is scored exactly once: the scorer logs each final scoring and refuses a second.
  - The page's final section matches `score.json`.

## Task 12: Adoption into the runtime (conditional)

- **Consumes:** Task 11's result and Task 0's runtime.
- **Produces:** if the adoption rule holds, the tuned instructions become the "how to be this person" section of the
  deep agents' decision prompt in the runtime, labelled with the round and the benchmark status.
- **Acceptance check:** the city's own checks still pass after the switch (quote grounding, and the engine's action
  validation) on the TTC and Bloor fixtures.

## Integration and review

- **Cross-task checks:**
  - Task 1's item ids are the keys Tasks 3, 5 and 7 use.
  - The hash of the scorer and the rewordings is identical in every `score.json`.
  - `results.tsv` and the page show the same numbers.
  - Every commit on the branch belongs to exactly one round.
- **Failure modes and what catches them:**

| Failure | Caught by |
|---|---|
| Answer sheet in a persona | Task 1's leakage check, rerun on every format in Task 2 |
| The researcher reads check or final answers | Locked location plus deny rules (Task 6); a jump trigger; the final set scored once |
| Instructions encode answers | The runner's scanner and length cap (Task 5); coach sign-off |
| Overfitting to the check set | The final set scored once; the held-out puzzle family |
| Scorer changed mid-loop | The hash in every score (Task 3) |
| CLI failures or rate limits | Retry once, then mark missing; a round with over 5% missing is invalid (Tasks 3 and 5) |
| Spend overrun | The $30 trigger, using the per-round cost in `meta.json` |

## Decisions settled at plan review (17 Oct)

These were open when the plan was first drafted. They are now reflected in the tasks above.

1. **Tendency, not trait.** The replay-trace spec uses `traits` for scenario facts like `has_car`, so our four broad
   tendencies are called **tendencies**, proposed to James as a `tendencies` key (Task 0).
2. **Price sensitivity** is left out of Twin short cards, which can't measure it, and kept on the city's personas
   (Task 2).
3. **Steady is report-only:** scored and protected by the keep rule, with no pass mark (Constraints).
4. **Group splits:** age 18–29 vs 65+, sex, income under $50,000 vs $100,000 or more, and Democrat vs Republican
   (Task 3).
5. **Ordered `MC` scales:** agreement, likelihood or favour ladders, and monotonic dollar amounts (Task 1).
6. **Backend:** the `claude` CLI on the claude.ai plan, until the team gets an API key (Constraints).

## Limitations

- Deny rules don't stop every shell route to the locked files. The scanner, coach sign-off and the once-only final
  set are the backstop.
- Twin measures what US respondents **say** on a survey. City use still needs the scenario checks: persona fidelity,
  the engine's rules, and the direction of the team's papers.
- Costs and timings are estimates until round 0 measures them.

## Decisions made while starting the loop (17 Oct)

1. **Spend trigger raised to $30.** A measured call costs $0.011 at list price, so $10 would have paused the loop
   around round 4. Steven's call.
2. **Rewordings approved** by Steven, so steady is scored from round 0 and `rewordings.json` is frozen.
3. **Scorer details fixed before freezing:** right spread caps each item at 1 (being more varied than people earns
   no credit); the one final scoring also reports each question family and the puzzle experiment effects, since
   the final set can't be scored twice; and the 10 / 30 / 158 given-answers comparison runs on the check set.
4. **Sets re-balanced:** the 2:5:5 cycle starts at its most balanced rotation, which keeps every set within 7 points
   of the pool (the first draw had the tuning set 11 points short on the South).
5. **Papiers:** the CLI is installed and Steven's token works, but the library is empty, so rounds record no coach
   notes until papers are saved and annotated.
