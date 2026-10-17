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
  (`full`, `compact`, `profile`, `short_card`).
- Read tuning-set answer sheets (`data/twin/tuning_answers.jsonl`) and tuning answers in round folders, to study
  mistakes.

## Each round

1. **Read.** Look at the last round's scorecard and find the weakest check. Read coach knowledge in Papiers:
   `python3 autoresearch/coach_notes.py "<problem>" ...` lists notes, recent highlights and annotated papers, runs
   the searches, and saves the lookup for the runner to file as the round's `sources.json`. Read any hit in full
   with `set -a; . ./.env; set +a; papiers read <id> --json`, and list the ids you used under `notes_used`.
2. **Hypothesise.** One sentence: what change should fix the weakest check, and why (cite note or passage ids).
3. **Change.** Edit `instructions.md` (or the format) once.
4. **Run.** `python3 autoresearch/run_round.py --slug <short-name> --sets tuning,check --steady [--format <fmt>]`.
5. **Decide.** Use `evaluate.keep(prev_check_score, new_check_score, noise)` with the noise from round 0. Keep or
   discard; a kept change is **on trial** until a coach signs it off. If discarded, restore the last kept
   `instructions.md`.
6. **Record.** Add the notes you used to `rounds/NNN-<slug>/sources.json`, write `decision.json`
   (hypothesis, change, kept, reason, triggers fired, question asked and reply), append the row to `results.tsv`,
   commit `round NN keep (on trial): <change> — <check> +x.xx` or `round NN discard: <change> — within noise`,
   then export and re-publish the tuning record page.

## Stop and ask a coach when

1. 3 rounds in a row keep nothing.
2. Any check jumps by more than 3× its noise in one round.
3. One check rises past its noise while another falls past its noise.
4. A result contradicts a paper a coach annotated.
5. The benchmark is passed (rounds still continue to 10).
6. Logged spend reaches $30.

While waiting you may test ideas on the tuning set only; at most 2 changes may be on trial at once.

## Sign-off

A coach types `sign off round NN — <name>` (or `reject round NN — <name>`). Record it in `decision.json` and
`results.tsv`, and commit `round NN signed off: <name>` (or `round NN rejected by coach`, restoring the last
signed-off instructions).

## After round 10

Score the final set once with the best signed-off instructions (all question families, with steady), then the
extras: experiment effects on the decision puzzles, and the 10 / 30 / 158 given-answers comparison. Write
`final/final.json`, re-publish, push the branch, and open a pull request when Steven approves.
