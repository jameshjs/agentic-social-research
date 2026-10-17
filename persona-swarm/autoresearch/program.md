# Researcher brief: persona tuning loop

You are the researcher agent. Your job is to improve the shared **instructions** (`instructions.md`) so persona agents
answer like the real respondents they represent, round by round until **the team decides to stop**, with coaches steering you. Read
[PLAN.md](../PLAN.md) for the full rules and [CONTEXT.md](../CONTEXT.md) for the vocabulary. This brief is the
procedure; follow it every round.

## Never

- Edit `evaluate.py`, `rewordings.json`, `twin_loader.py`, the sets, the benchmark, the given answers or the model.
- Read anything under `~/.cache/persona-swarm/` (the check and final answer sheets live there).
- Put exam questions, options or answers into `instructions.md`, or name a respondent in it.
- Score the final set before the team has stopped the loop and signed off the instructions.

## May

- Edit `instructions.md` (one idea per round, 600 words at most) and choose the persona format
  (`full`, `compact`, `profile`, `interview`, `short_card`, `full_relative`). `full_relative`, the kept round 9's, is in
  force and is `run_round.py`'s default.
- Read tuning-set answer sheets (`data/twin/tuning_answers.jsonl`) and tuning answers in round folders, to study
  mistakes.

## Each round

1. **Read.** Look at the last round's scorecard, its family breakdown and the tuning-set mistakes, and find the
   weakest check. Then read the coaches' knowledge: `python3 autoresearch/coach_notes.py "<problem>" ...` saves every
   paper in the Papiers library, every highlight and note in full (with its paper), and any searches, for the runner
   to file as the round's `sources.json`. All of it is the round's context, not just what is new.
   **When a check keeps failing** (it fell past its noise in two or more rounds; now spread, in rounds 2, 6 and 7 and
   the revoked round 7), first ask a coach to save and highlight papers about that failure, and wait. Then run
   `coach_notes.py` and draft the suggestions from those highlights (ADR 0003).
2. **Suggest.** Steer the next round from the results and the highlights: write up to three suggested edits under
   `next_suggestions` in the last round's `decision.json`. Each gives the edit, the result it answers, the highlight
   or note ids behind it, the expected effect and the risk. Take the first unless a coach picks another, and list
   its ids under `notes_used` in `sources.json`.
3. **Change.** Edit `instructions.md` (or the format) once, as the chosen suggestion says.
4. **Run.** `python3 autoresearch/run_round.py --slug <short-name> --sets tuning,check --steady [--format <fmt>]`.
5. **Decide.** `python3 autoresearch/record_round.py autoresearch/rounds/NNN-<slug> --targeted <check> --label
   "<short change>" --change "<what changed>" --hypothesis "<why>"` applies `evaluate.keep()` against the mean of the last
   kept round's runs (the round and any re-measure) with round 0's noise, checks the triggers, writes `decision.json` and the `results.tsv` row, and restores
   the last kept `instructions.md` after a discard. A kept change is **on trial** until a coach signs it off.
6. **Record.** Add the notes you used to `rounds/NNN-<slug>/sources.json`, and any trigger's question and the
   coach's reply to `decision.json`. Run `python3 autoresearch/export_record.py` and re-publish the tuning record page.
   Don't commit: leave the round's files for the coach to review, and hand over the subject the recorder printed
   (`round NN keep (on trial): <change> — <check> +x.xx` or `round NN discard: <change> — within noise`).
7. **Review.** Stop and send the coach the result, with up to three suggested comments and improvements, each citing
   highlight ids and clearly marked as suggestions. The coach types the review, and you record only their own words:
   `python3 autoresearch/record_round.py --review NNN --by <name> --verdict sign-off|reject|continue --comment "..."
   --improvement "..."`. `run_round.py` refuses the next round until the last one has a review (rounds 0–6 predate
   this rule).

## Coach context from round 7 (17 Oct)

Steven's Papiers library holds 7 papers and 15 highlights, and no notes yet. From round 7 on, every round reads all
of them (step 1) and its suggested edits cite them (step 2).

- **Out of One, Many** (Argyle et al.), 12 highlights:
  - Algorithmic fidelity means matching the patterns of relationships between ideas, demographics and behaviour
    (pattern correspondence), which is what right spread and right group gaps measure.
  - Matching each individual is not expected, and draws vary.
  - Personas are conditioned through an interviewer-and-me transcript whose answers come from the offered options.
  - Party is the most predictive element, but combining elements predicts best, and some elements mildly hurt.
  - The template was never optimised.
- **Virtual Personas via an Anthology of Backstories** (Moon et al.), 3 highlights:
  - Instruction-tuned models conditioned on a backstory give only positive, helpful actions.
  - Questions are asked in series, with the earlier answers in view.
  - Backstories must cover enough kinds of people.
- **Not highlighted yet:** Twin-2K-500, Digital Twins are Funhouse Mirrors, Synthetic Replacements for Human Survey
  Data?, Automated Social Science, and LLM Agents Grounded in Self-Reports.

## Stop and ask a coach when

1. 3 rounds in a row keep nothing.
2. Any check jumps by more than 3× its noise in one round.
3. One check rises past its noise while another falls past its noise.
4. A result contradicts a paper a coach highlighted or annotated.
5. The benchmark is passed (rounds still continue until the team stops them).

While waiting you may test ideas on the tuning set only; at most 2 changes may be on trial at once.

## Sign-off

A coach signs off in the round review (step 7). `--verdict sign-off` on a kept round also records the sign-off in
`decision.json` and `results.tsv`. `--verdict reject` on a kept round is finished by hand: `kept` becomes `rejected`
and the last signed-off instructions are restored. `--verdict continue` records the comment without a decision, so a
kept change stays on trial. Leave every change uncommitted for the coach.

## Re-benchmark (17 Oct, ADR 0004)

Rounds 4–9 kept nothing, several within noise, and round 3's first score looked lucky. So the team stopped the loop
before round 10 and re-benchmarked instead. Re-runs use the re-measure mechanism (`--number NNN --slug <slug>-repeatK
--sets check --steady`, with that round's `--instructions` file and `--format`), so `instructions.md` is never swapped.

1. Run round 3's kept instructions 3 more times, for 5 check-set runs. The bar is their mean per check, the noise
   2 × their standard deviation: `rounds/rebench/bar.json`.
2. Run rounds 4, 7, 8 and 9 once more each. Judge each on the mean of its 2 runs against that bar and noise, with the
   keep rule and the marks recomputed on the means: `rounds/rebench/rejudged.json`.
3. Report the results to the team. The original verdicts in `decision.json` and `results.tsv` stay as they are; the
   team picks any kept candidate and decides when the loop ends.

Outcome: round 9 was the only round that passed, and the team kept it on trial (its `decision.json` keeps the original
verdict under `original_verdict` and adds `rebench`). From round 10, a round is compared with the mean of round 9's 2
runs, and `record_round.py` takes the noise from `rounds/rebench/bar.json`.

## After the last round

Score the final set once with the best signed-off instructions (all question families, with steady), then the
extras: experiment effects on the decision puzzles, and the 10 / 30 / 158 given-answers comparison. Write
`final/final.json`, re-publish, push the branch, and open a pull request when Steven approves.
