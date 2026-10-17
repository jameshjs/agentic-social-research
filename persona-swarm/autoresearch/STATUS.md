# Persona tuning loop: status and to-do

Snapshot: 17 Oct 2026, 10:25 UTC. Branch `steven/persona-tuning-loop` (not pushed). Page:
https://claude.ai/artifact/717U6NqZVYDnqCbnRFvRUb. Spend: $11.41 of the $30 trigger, at list price, billed to the
claude.ai plan. The rules are in [PLAN.md](../PLAN.md), the procedure in [program.md](program.md) and the words in
[CONTEXT.md](../CONTEXT.md).

## Where it stands

- **Rounds:** 6 of 10 done. One change is kept and signed off (round 3); five were discarded.
- **Re-measured:** round 3's instructions, on the check set (trigger 1). Its group gaps came back at 0.790 against
  0.852, so later rounds are compared with the mean of both runs: right person 0.807, spread 0.869, gaps 0.821,
  steady 0.972, 4 marks.
- **Next:** round 7, which uses the interview persona format (suggestion 1). The format is built and passes the
  leak check.

## The setup on one screen

| Part | Value |
|---|---|
| Data | Twin-2K-500 `wave_split`: 240 respondents, split into tuning 40 / check 100 / final 100 (seed 17). Every set is within 7 points of the pool on age, sex, income and region, and the leak check passes |
| Locked files | The check and final answer sheets, and the raw parquet, live in `~/.cache/persona-swarm/`. Deny rules in `~/.claude/settings.json` block `Read` and shell access |
| Persona agents | `claude-haiku-5-5`, low effort, through the logged-in `claude` CLI. One call per respondent, plus one steady call per check respondent. A round takes about 4 min and $1.60 |
| Scored items | Policy (10 rows) and pricing (40 products) on the tuning and check sets. Decision puzzles are held out for the final set |
| Checks | Right person, right spread (capped at 1 per item), right group gaps (sign agreement over 4 splits), and steady (rewordings; report only) |
| Benchmark (check set) | Right person ≥ 0.70, spread ≥ 0.80, gaps ≥ 0.80, and right person above every baseline |
| Baselines (check set, right person) | Most common 0.710 · same age and income 0.659 · most similar 0.689 · no persona 0.733 |
| Noise (round 0, run A vs run B) | Right person 0.015 · spread 0.010 · gaps 0.049 · steady 0.010 |
| Keep rule | At least one check up by more than its noise, none down by more than its noise, and benchmark marks never fall. From round 7, rounds are compared with the mean of the kept round's runs |

## Rounds so far (check set)

| Round | Change | Right person | Spread | Gaps | Steady | Marks | Decision | Commit |
|---|---|---|---|---|---|---|---|---|
| 000 | Starting instructions (run A; run B measured the noise) | 0.806 | 0.879 | 0.790 | 0.959 | 3 | baseline | `332a6a6` |
| 001 | Decide policy views from own answers, not party | 0.810 | 0.876 | 0.790 | 0.969 | 3 | discard (within noise) | `ee9ca59` |
| 002 | Buy only what they'd really buy on this trip | 0.814 | **0.810** | 0.802 | 0.968 | 4 | discard (spread fell) | `96b08f6` |
| 003 | Let spending-habit answers decide how readily they buy | 0.803 | 0.874 | **0.852** | 0.970 | 4 | **kept, signed off by Steven** | `dd3f10c`, `72f4da7` |
| 004 | Decide from the person's answers, not group stereotypes | **0.826** | 0.863 | 0.802 | 0.953 | 4 | discard (spread and steady fell) | `034c437` |
| 005 | Compact persona format | 0.817 | 0.867 | **0.765** | 0.966 | 3 | discard (gaps fell) | `ab01035` |
| 006 | Don't buy necessities just because most households do | 0.811 | 0.848 | 0.778 | 0.964 | 3 | discard (spread and gaps fell) | `64ce85f` |

Triggers fired so far:

- 5 in round 0 and again in round 3 (the benchmark is passed);
- 2 in round 2;
- 3 in round 4;
- 1 in round 6.

Each has its question and Steven's reply in that round's `decision.json`.

## What the rounds taught

- **Spending-habit answers are the strongest purchase signal.** The tightwad–spendthrift questions raised the
  correlation of each person's purchase count with the real person's from 0.14 to 0.42.
- **Shifting how often agents buy backfires.** Rounds 2 and 6 made agents give the same answer for each product, so
  spread fell.
- **Agents caricature party.** Their Democrat-minus-Republican policy gaps are 1.3–3.2 points, where people differ
  by 0.2–1.3. Fixes help policy (+0.013 to +0.027 right person), but policy is a fifth of the items, so the pooled
  check stays within its noise.
- **"Ignore groups" goes too far.** Round 4 raised right person by 0.023 but erased real income and age differences
  in buying.
- **Agents react to price as people do.** Their over-buying is at bargain or $0.00 prices and on everyday
  necessities (milk: people 0.50, agents 1.00).
- **Group gaps is the jumpiest check.** It ranges 0.765–0.852 across runs, and round 3's 0.852 is the highest,
  hence the re-measure.

## Coach context (Papiers)

Steven's library holds 7 papers and 15 highlights, and no notes. `coach_notes.py` saves them in full each round.

- **Out of One, Many** (12 highlights):
  - Pattern correspondence matters more than matching individuals, and draws vary.
  - Personas are conditioned with an interviewer-and-me transcript whose answers come from the offered options.
  - Party is the most predictive element, but combining elements predicts best.
  - The template was never optimised.
- **Anthology of Backstories** (3 highlights):
  - Instruction-tuned models give only positive, helpful actions.
  - Questions are asked in series.
  - Backstories must vary.
- **Not highlighted yet:** Twin-2K-500, Funhouse Mirrors, Synthetic Replacements, Automated Social Science, and LLM
  Agents Grounded in Self-Reports.

Suggested edits for round 7, in `rounds/006-necessities/decision.json`:

1. **Interview format** (chosen): "Interviewer: question (options) / Me: answer".
2. **"Not a helpful assistant"** instruction.
3. **Policy only:** party is one input among several.

## Decisions log (17 Oct)

- The runtime gate (Task 0) was dropped.
- The rewordings were approved.
- The spend trigger is $30.
- Scorer:
  - right spread is capped at 1 per item;
  - the one final scoring also reports each family and the puzzle experiment effects;
  - the 10/30/158 given-answers comparison runs on the check set;
  - `keep()` ignores float rounding.
- The sets were re-balanced.
- Item ids are named by content: the pricing block was shuffled per respondent. Rounds 0–1 were re-keyed and
  re-scored.
- Compact personas keep the labels of numbered scales.
- Each round reads every Papiers paper, highlight and note.
- The researcher agent writes suggested edits for the next round.
- Trigger 1: the kept round is re-measured, and later rounds are compared with the mean of its runs.

## To-do

1. ~~Re-measure round 3~~: done ($0.26), recorded in round 3's `decision.json`.
2. ~~Add the `interview` format~~: done (13k words, 0 leaks on all 240 respondents).
3. Round 7:
   1. `coach_notes.py`;
   2. `run_round.py --slug interview-format --format interview --steady`;
   3. `record_round.py`;
   4. `export_record.py`;
   5. publish (update `datasets/rounds` pinned to v6, then delete its old blob);
   6. commit.
4. Rounds 8–10: each from the last round's `next_suggestions`, with the triggers and sign-offs.
5. After round 10 (the final set is scored once):
   1. Run the no-persona baseline on the final set with all families (never scored on its own).
   2. Run the best signed-off instructions on the final set with all families and steady.
   3. Write `final/final.json`: scorecard, baselines, held-out puzzles, experiment effects, follow one respondent.
   4. Run the 10/30/158 given-answers comparison on the check set.
   5. Export and publish.
6. With Steven's approval:
   1. fetch, rebase if `main` moved, push, and open a PR to `main`;
   2. share the hash;
   3. hand Meet the page link and a recording of about 20 seconds.

Open items:

- `short_card` runs to 198 words (the plan says 150 at most; it is unused).
- Persona-first prompt order, so the given answers stay cached: worth it in the runtime (Task 12), not mid-loop.
- Task 0, the runtime slice with James.
- Trigger 4 can't fire until a coach writes notes or highlights a result-relevant claim.

## Gotchas

- **Locked files:** never read `~/.cache/persona-swarm/`. `evaluate.py` reads the locked files itself and returns
  only aggregates.
- **The final set is scored once.** A marker lands in `locked/final_scored.json`. Dry runs refuse the final set, and
  `--no-persona` never scores it.
- **Papiers lookup:** `run_round.py` files `rounds/sources-pending.json` into the next round folder. So run
  `coach_notes.py` right before a round, never before a re-measure.
- **Page writes need `if_version`:**
  - `datasets/rounds` v6 (blob `/_blob/485a05efe592ae12fb9711f97074c901`);
  - `datasets/final` v2;
  - `files/index.html` v2.
- **Shared checkout:** two other sessions touched it earlier. This session is now its only writer.

```bash
python3 autoresearch/coach_notes.py "<terms>"
python3 autoresearch/run_round.py --slug <name> --sets tuning,check --steady [--format full|compact|profile|interview]
python3 autoresearch/record_round.py autoresearch/rounds/NNN-<slug> --targeted <check> --label "..." --change "..." --hypothesis "..."
python3 autoresearch/record_round.py --sign-off NNN --by Steven
python3 autoresearch/run_round.py --slug rescore --rescore autoresearch/rounds/NNN-<slug>
python3 autoresearch/export_record.py
python3 autoresearch/test_autoresearch.py
```
