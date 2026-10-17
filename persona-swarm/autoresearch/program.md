# Researcher brief: persona tuning loop

You are the researcher agent. Your job is to improve the shared **instructions** (`instructions.md`) so persona agents
answer like the real respondents they represent, over **exactly 10 tuning rounds**, with coaches steering you. Read
[PLAN.md](../PLAN.md) for the full rules and [CONTEXT.md](../CONTEXT.md) for the vocabulary. This brief is the
procedure; follow it every round.

## Never

- Edit `evaluate.py`, `rewordings.json`, `twin_loader.py`, the sets, the benchmark, the given answers or the model.
- Read anything under `~/.cache/persona-swarm/` (the check and final answer sheets live there).
- Put exam questions, options or answers into `instructions.md`, or name a respondent in it.
- Score the final set before round 10 is finished and signed off.

## May

- Edit `instructions.md` (one idea per round, 600 words at most) and choose the persona format
  (`full`, `compact`, `profile`, `interview`, `short_card`).
- Read tuning-set answer sheets (`data/twin/tuning_answers.jsonl`) and tuning answers in round folders, to study
  mistakes.

## Each round

1. **Read.** Look at the last round's scorecard, its family breakdown and the tuning-set mistakes, and find the
   weakest check. Then read the coaches' knowledge: `python3 autoresearch/coach_notes.py "<problem>" ...` saves every
   paper in the Papiers library, every highlight and note in full (with its paper), and any searches, for the runner
   to file as the round's `sources.json`. All of it is the round's context, not just what is new.
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
   coach's reply to `decision.json`. Run `python3 autoresearch/export_record.py`, commit with the subject the recorder
   printed (`round NN keep (on trial): <change> — <check> +x.xx` or `round NN discard: <change> — within noise`),
   then re-publish the tuning record page.

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
5. The benchmark is passed (rounds still continue to 10).
6. Logged spend reaches $30.

While waiting you may test ideas on the tuning set only; at most 2 changes may be on trial at once.

## Sign-off

A coach types `sign off round NN — <name>` (or `reject round NN — <name>`). Record a sign-off with
`python3 autoresearch/record_round.py --sign-off NNN --by <name>`, which updates `decision.json` and `results.tsv`,
and commit `round NN signed off: <name>`. A rejection is recorded by hand: `kept` becomes `rejected`, the last
signed-off instructions are restored, and the commit is `round NN rejected by coach`.

## After round 10

Score the final set once with the best signed-off instructions (all question families, with steady), then the
extras: experiment effects on the decision puzzles, and the 10 / 30 / 158 given-answers comparison. Write
`final/final.json`, re-publish, push the branch, and open a pull request when Steven approves.
