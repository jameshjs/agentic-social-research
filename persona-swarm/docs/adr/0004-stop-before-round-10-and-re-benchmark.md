---
status: accepted
---

# Stop the loop before round 10 and re-benchmark the bar, the noise and the borderline rounds

Rounds 4 to 9 kept nothing, although several came close, within the noise of the bar. The bar itself rests on
round 3's two runs, and the first of them looks lucky: group gaps scored 0.852 and then 0.790 on the re-measure, which
passed only 3 marks. The persona agents' answers vary from call to call, and group gaps is jumpy: it rests on 81
comparisons (63 of them on pricing), so one flipping moves it by 0.012, and round 3's two runs differed by 5. The noise was measured once, from a single pair of round 0 runs. So
close rounds may have been judged by luck rather than by their instructions.

On 17 Oct the team stopped the loop before round 10 ("instead of running another loop … rebenchmark previous data to
see real gains"). Instead:

- Round 3's kept instructions run 3 more times on the check set with steady, for 5 runs in all. The new bar is the
  mean of the 5 runs for each check, and the new noise is 2 × their standard deviation. Both go to
  `rounds/rebench/bar.json`.
- Rounds 4, 7, 8 and 9 each run once more on the check set with steady, with their own instructions and format. Each
  is judged on the mean of its 2 runs against the new bar and noise, with the same keep rule and benchmark marks, in
  `rounds/rebench/rejudged.json`.
- The team decides from that which round, if any, is the best kept candidate, and when the loop ends.

## Outcome

The 5 runs put round 3 at right person 0.811, spread 0.865, gaps 0.798 and steady 0.971: 3 marks, since gaps falls
just short of 0.80. The noise became 0.011, 0.014, 0.083 and 0.009. Rounds 4, 7 and 8 stayed discarded. Round 9
(relative profile and the Funhouse note's evidence order) passed: spread +0.015 against 0.014, with nothing falling past
its noise and marks held. The team kept it on trial. Its instructions and `full_relative` format are now in force, the
next round's bar is the mean of its 2 runs, and `record_round.py` reads the noise from `rounds/rebench/bar.json`.

## Consequences

- The original verdicts stay in the record. Rounds 4, 7 and 8 keep their `decision.json` and `results.tsv` rows
  unchanged. Round 9's row now reads kept, and its `decision.json` keeps the original verdict under `original_verdict`
  beside the `rebench` result.
- The scorer, its pass marks and `evaluate.py` are unchanged. The re-runs passed the review gate because round 9 had
  its review, as re-measures did before.
- The final set is still scored once, after the team signs off the instructions.
- 7 more check-set runs (13.6 minutes, no failed calls). The loop may end with fewer than 10 rounds.
- Round 9's gain is small (0.001 past the noise) and rests on 2 runs; its sign-off stays with the team.
