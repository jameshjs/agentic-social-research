# Persona tuning loop: status and handover

**Snapshot:** 17 Oct 2026, 10:40 UTC.

| Item | State |
|---|---|
| Branch | `steven/persona-tuning-loop` at `9b3ce03` plus this file's commit, not pushed |
| Page | https://claude.ai/artifact/717U6NqZVYDnqCbnRFvRUb |
| Spend | **$14.27** of the $30 trigger (list price, billed to the claude.ai plan). The recorder prints $12.98: it sums only `rounds/NNN-*/meta.json`, so it misses the revoked interview run's $1.29. Add $1.29 to every total it prints, and fire trigger 6 yourself if the sum reaches $30 |
| Rules | [PLAN.md](../PLAN.md) |
| Procedure | [program.md](program.md) |
| Words | [CONTEXT.md](../CONTEXT.md) |

Everything a new agent needs to carry on is on this page. Work from `persona-swarm/`.

## Pick up here

**Waiting for Steven: trigger 1 fired in round 7** (rounds 5, 6 and 7 kept nothing). The question, the three
suggested edits for round 8 and a method note are in `rounds/007-not-an-assistant/decision.json`. Don't run round 8
before he replies.

- When he replies, write his words into that file's `reply` and `next_suggestions.chosen`, and commit.
- Then run round 8 as `program.md` says: `coach_notes.py` right before the round, one edit, record with
  `--papiers-ids` citing highlights, set `notes_used`, write `next_suggestions`, export, commit, then update
  `datasets/rounds` (see "Page store").
- If he picks the method note, re-measure with `run_round.py --number 003 --slug spending-habits-repeat2 --sets check
  --steady` (no `coach_notes.py` before a re-measure).

Round 7 history: the interview-format run was **revoked by Steven** (format-only; see
`rounds/_revoked/007-interview-format/REVOKED.md`, no `results.tsv` row). Round 7 was redone as an instruction edit
the researcher agent wrote from his highlights, and discarded.

## Rounds (check set)

Since round 7, a round is compared with the **mean of the kept round's runs**. Round 3's mean, the bar now, is:
right person 0.807, spread 0.869, gaps 0.821, steady 0.972, 4 marks.

| Round | Change | Right person | Spread | Gaps | Steady | Marks | Decision | Commit |
|---|---|---|---|---|---|---|---|---|
| 000 | Starting instructions (run A; run B measured the noise) | 0.806 | 0.879 | 0.790 | 0.959 | 3 | baseline | `332a6a6` |
| 001 | Decide policy views from own answers, not party | 0.810 | 0.876 | 0.790 | 0.969 | 3 | discard (within noise) | `ee9ca59` |
| 002 | Buy only what they'd really buy on this trip | 0.814 | **0.810** | 0.802 | 0.968 | 4 | discard (spread fell) | `96b08f6` |
| 003 | Let spending-habit answers decide how readily they buy | 0.803 | 0.874 | **0.852** | 0.970 | 4 | **kept, signed off by Steven** | `dd3f10c`, `72f4da7` |
| 003 re-measure | The same instructions again (trigger 1) | 0.811 | 0.865 | 0.790 | 0.974 | 3 | sets the bar to the mean | `419a872` |
| 004 | Decide from the person's answers, not group stereotypes | **0.826** | 0.863 | 0.802 | 0.953 | 4 | discard (spread and steady fell) | `034c437` |
| 005 | Compact persona format | 0.817 | 0.867 | **0.765** | 0.966 | 3 | discard (gaps fell) | `ab01035` |
| 006 | Don't buy necessities just because most households do | 0.811 | 0.848 | 0.778 | 0.964 | 3 | discard (spread and gaps fell) | `64ce85f` |
| ~~007~~ | Interview persona format | 0.818 | 0.852 | 0.802 | 0.974 | 4 | **revoked by Steven** (format-only; would have discarded on spread) | `d09ee9b` |
| 007 | Not a helpful assistant (from Anthology and Out of One, Many highlights) | 0.813 | 0.858 | 0.790 | 0.966 | 3 | discard (spread fell; marks 4 → 3) | `9b3ce03` |

Round 7 (redo) by family:

- **Policy:** right person 0.822, spread 0.899, gaps 1.0.
- **Pricing:** right person 0.810, spread 0.848, gaps 0.730.
- **Run:** 257 s, $1.58, 0 failed calls. Highlights cited: `hl_42736e321c9efbb55c00281d4eaf4edc`,
  `hl_39746a61ef98d937816daf833be4f776`, `hl_ef176edeb52094c16f68e9ad57932e9a`.

Triggers fired so far, each with Steven's question and reply in that round's `decision.json`:

| Trigger | Fired in |
|---|---|
| 5 (benchmark passed) | rounds 0 and 3 |
| 2 (a check moved more than 3× its noise) | round 2 |
| 3 (one check up past its noise while another fell past its noise) | round 4 |
| 1 (three rounds in a row kept nothing) | round 6; round 7 (**waiting for Steven**) |

## Code status

Everything below is committed and clean unless the table says otherwise. Every `score.json` carries the same
scorer hash (`9e5332f9…`) and rewordings hash (`45136ba1…`). `python3 autoresearch/test_autoresearch.py` prints
`ok`.

| File | What it does | State and checks |
|---|---|---|
| `autoresearch/twin_loader.py` | Builds the 240 respondents, the 40/100/100 sets, exams, tuning answer sheets and locked sheets; leak check | Deterministic, runs in 9 s; prints balance and "leakage check passed". Items are named by content: `price_<product>`, `policy_NN`, `puzzle_<block>_<n>` |
| `autoresearch/formats.py` | Persona formats `full`, `compact`, `profile`, `interview`, `short_card` | **Uncommitted:** `interview` was added for round 7. Interview had 0 leaks on all 240; compact and profile also passed. `short_card` runs to 198 words (the plan says 150 at most; unused) |
| `autoresearch/evaluate.py` | The frozen scorer: checks, baselines, marks, `by_family`, experiment effects, the once-only final, `noise_from`, `keep` | Don't edit it: the hash is in every score. Tested by `test_autoresearch.py` |
| `autoresearch/test_autoresearch.py` | Offline tests of the scorer on synthetic fixtures | Pass |
| `autoresearch/run_round.py` | Runs a round, plus `--dry-run` and `--rescore`; scans instructions for exam text and brand names; files `sources-pending.json` into the new folder | Dry runs and refusals checked by hand; no unit test |
| `autoresearch/record_round.py` | Keep rule against the kept round's mean, triggers, `decision.json`, the `results.tsv` row, restore on discard, sign-off | Checked by hand on a throwaway copy; no unit test. Spend sums every run's `meta.json` |
| `autoresearch/coach_notes.py` | Papiers lookup: every paper, highlight and note in full, plus searches, to `rounds/sources-pending.json` | Works with the token in `.env`; never prints it |
| `autoresearch/export_record.py` | `results.tsv` and each round's instructions → `data/record/rounds.json` and `final.json` | Its test lives in a scratchpad, not in the repo |
| `dashboard/tuning.html` | The page: tiles, a step chart of the instructions in force, the rounds table, the instructions diff, final results | Published as `files/index.html` v2 |
| `scripts/run_swarm.py` | `claude_json()`: one structured call through the logged-in `claude` CLI (Haiku 5.5, low effort) | Reused from before the loop |
| `autoresearch/instructions.md` | The instructions in force: round 3's, signed off | Must equal `rounds/003-spending-habits/instructions.md` before a round |
| `autoresearch/rewordings.json` | The 10 policy rewordings for steady | Approved by Steven, so frozen |

**Working tree:** clean, apart from `dashboard/tuning.html`, which another session is redesigning. Don't stage it.

**Page store:**

| Document | Version | Points at |
|---|---|---|
| `datasets/rounds` | v8 | `/_blob/cd5b13e5a7fd5b5e15a01c3f5b0d3931`, rounds 000–007 (the old blob `485a05ef…` is deleted) |
| `datasets/final` | v2 | `/_blob/7381fbf1f7e60dc6636710b3a1ab1138`, one "pending" row |
| `files/index.html` | v2 | — (another session is redesigning the page: don't republish it) |
| `dash/meta` | v1 | — |

## The setup on one screen

| Part | Value |
|---|---|
| Data | Twin-2K-500 `wave_split`: 240 respondents, split into tuning 40 / check 100 / final 100 (seed 17). Every set is within 7 points of the pool on age, sex, income and region |
| Locked files | The check and final answer sheets, and the raw parquet, live in `~/.cache/persona-swarm/`. Deny rules in `~/.claude/settings.json` block `Read` and shell access |
| Persona agents | `claude-haiku-5-5`, low effort, through the logged-in `claude` CLI. One call per respondent, plus one steady call per check respondent. A round takes about 4–5 min and $1.10–1.60 |
| Scored items | Policy (10 rows) and pricing (40 products) on the tuning and check sets. Decision puzzles are held out for the final set |
| Checks | Right person, right spread (capped at 1 per item), right group gaps (sign agreement over 4 splits), and steady (rewordings; report only) |
| Benchmark (check set) | Right person ≥ 0.70, spread ≥ 0.80, gaps ≥ 0.80, and right person above every baseline |
| Baselines (check set, right person) | Most common 0.710 · same age and income 0.659 · most similar 0.689 · no persona 0.733 |
| Noise (round 0, run A vs run B) | Right person 0.015 · spread 0.010 · gaps 0.049 · steady 0.010 |
| Keep rule | At least one check up by more than its noise, none down by more than its noise, and benchmark marks never fall. Compared with the mean of the kept round's runs |

## What the rounds taught

- **Spending-habit answers are the strongest purchase signal.** The tightwad–spendthrift questions raised the
  correlation of each person's purchase count with the real person's from 0.14 to 0.42.
- **Shifting how often agents buy backfires.** Rounds 2 and 6 made agents answer uniformly per product, so spread
  fell.
- **Instructions don't reach the staples.** Rounds 2, 6 and 7 each told agents, in different words, that people
  often pass on everyday items; milk, eggs and baking soda stayed at 95–100% yes on the tuning set (people 50–85%).
  Round 7's two-sided "not a helpful assistant" cue moved treats toward people's answers, but not the staples, and
  pushed the two conservative policy items further into opposition.
- **Format changes trade spread for right person.** Compact (round 5) and interview (round 7) both gained a little
  right person and lost spread or pricing gaps. The full Twin text is still the best format.
- **Agents caricature party.** Their Democrat-minus-Republican policy gaps are 1.3–3.2 points, where people differ
  by 0.2–1.3. Fixes help policy (+0.013 to +0.027 right person), but policy is a fifth of the items, so the pooled
  check stays within its noise.
- **"Ignore groups" goes too far.** Round 4 raised right person by 0.023 but erased real income and age differences
  in buying.
- **Agents react to price as people do.** Their over-buying is at bargain or $0.00 prices and on everyday
  necessities (milk: people 0.50, agents 1.00).
- **Group gaps is the jumpiest check.** It ranges 0.765–0.852 across runs; the re-measure showed round 3's 0.852 was
  high.

## Coach context (Papiers)

Steven's library holds 7 papers and 15 highlights, and no notes. `coach_notes.py` saves them in full each round.

- **Out of One, Many** (12 highlights):
  - Pattern correspondence matters more than matching individuals, and draws vary.
  - Personas are conditioned with an interviewer-and-me transcript (tried in the revoked round 7).
  - Party is the most predictive element, but combining elements predicts best.
  - The template was never optimised.
- **Anthology of Backstories** (3 highlights):
  - Instruction-tuned models give only positive, helpful actions (tried in round 7).
  - Questions are asked in series.
  - Backstories must vary.
- **Not highlighted yet:** Twin-2K-500, Funhouse Mirrors, Synthetic Replacements, Automated Social Science, and LLM
  Agents Grounded in Self-Reports.

**Suggested edits for round 8,** from `rounds/007-not-an-assistant/decision.json` (Steven picks):

1. **Policy only, "party is one input among several"** (`hl_f9cf5b71d8b01335a0f1fee0962f34de`,
   `hl_39746a61ef98d937816daf833be4f776`). Leaves shopping alone. Likely within noise when pooled.
2. **Shopping: household and demographics decide which products fit** (`hl_a57f83114dc9b82734d028801f8cf37a`,
   `hl_f9cf5b71d8b01335a0f1fee0962f34de`). Aims at pricing group gaps; the tuning groups behind it are small.
3. **Don't fall back on the most typical answer** (`hl_ef176edeb52094c16f68e9ad57932e9a`,
   `hl_42736e321c9efbb55c00281d4eaf4edc`). Aims at spread; may cost right person and steady.

**Method note:** re-measure round 3 once more before round 8, since spread's noise (0.010) comes from one pair of
runs and round 3's own runs differ by 0.009 (`hl_ef176edeb52094c16f68e9ad57932e9a`).

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
- Trigger 1 after round 6: round 3 was re-measured, and later rounds are compared with the mean of the kept round's
  runs.
- Round 7 tried the interview format (suggestion 1).
- **Round 7 revoked by Steven:** the interview format changed only the persona format while the instructions stayed
  round 3's. Its run moved to `rounds/_revoked/007-interview-format/` with no `results.tsv` row; round 7 is redone as an
  instruction edit the researcher agent writes from the highlighted papers. The interview format stays in `formats.py`.
  Its $1.29 still counts toward the $30 trigger, though the recorder no longer sees it.
- **Round 7 redone** with the same 15 highlights (Papiers had nothing new): "not a helpful assistant", citing
  `hl_42736e321c9efbb55c00281d4eaf4edc`, `hl_39746a61ef98d937816daf833be4f776` and
  `hl_ef176edeb52094c16f68e9ad57932e9a`. Discarded (spread −0.011, marks 4 → 3). Trigger 1 fired again; the question
  is waiting for Steven.

## To-do

1. Get Steven's reply to trigger 1 (round 7) and record it (see "Pick up here").
2. Rounds 8–10: each from the last round's `next_suggestions`, with the triggers and sign-offs. Add the revoked
   run's $1.29 to the recorder's spend total.
4. After round 10 (the final set is scored once):
   1. Run the no-persona baseline on the final set with all families (never scored on its own).
   2. Run the best signed-off instructions on the final set with all families and steady.
   3. Write `final/final.json`: scorecard, baselines, held-out puzzles, experiment effects, follow one respondent.
   4. Run the 10/30/158 given-answers comparison on the check set.
   5. Export and publish.
5. With Steven's approval:
   1. fetch, rebase if `main` moved, push, and open a PR to `main`;
   2. share the hash;
   3. hand Meet the page link and a recording of about 20 seconds.

Open items:

- `short_card` runs to 198 words (the plan says 150 at most; it is unused).
- Persona-first prompt order, so the given answers stay cached: worth it in the runtime (Task 12), not mid-loop.
- Task 0, the runtime slice with James.
- `record_round.py` and `run_round.py` have no unit tests.
- Trigger 4 can't fire until a highlighted claim conflicts with a result.

## Gotchas

- **Locked files:** never read `~/.cache/persona-swarm/`. `evaluate.py` reads the locked files itself and returns
  only aggregates.
- **The final set is scored once.** A marker lands in `locked/final_scored.json`. Dry runs refuse the final set, and
  `--no-persona` never scores it.
- **Papiers lookup:** `run_round.py` files `rounds/sources-pending.json` into the next round folder. So run
  `coach_notes.py` right before a round, never before a re-measure. A re-measure uses
  `--number <kept round> --slug <slug>-repeat --sets check --steady`.
- **Before each round:** `instructions.md` must equal the kept round's `instructions.md`. The recorder restores it
  after a discard.
- **Interrupted runs:** if a run dies mid-way, its folder holds only `instructions.md` and `sources.json`. Move
  `sources.json` back to `rounds/sources-pending.json`, delete the folder, and rerun.
- **Long runs:** start rounds in the background and wait on the process. A round takes about 4–5 minutes.
- **Shared checkout:** other sessions have touched it before. Check `git status` before writing.

```bash
python3 autoresearch/coach_notes.py "<terms>"
python3 autoresearch/run_round.py --slug <name> --sets tuning,check --steady [--format full|compact|profile|interview]
python3 autoresearch/record_round.py autoresearch/rounds/NNN-<slug> --targeted <check> --label "..." --change "..." --hypothesis "..."
python3 autoresearch/record_round.py --sign-off NNN --by Steven
python3 autoresearch/run_round.py --slug rescore --rescore autoresearch/rounds/NNN-<slug>
python3 autoresearch/export_record.py
python3 autoresearch/test_autoresearch.py
```
