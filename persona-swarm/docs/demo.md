# Persona tuning demo: 60–90 seconds of the 4-minute pitch

Open the [results page](https://claude.ai/artifact/717U6NqZVYDnqCbnRFvRUb) at the top, on desktop. It stays private until
someone shares it from its Share menu. Every number below is on that page, from `data/record/final.json` and
`data/record/rounds.json`.

## Walkthrough

| Time | On screen | Say |
|---|---|---|
| 0:00 | **Final set** card | "An agent tuned one instructions file so Haiku persona agents answer a survey like the real person. This card asks whether that holds on 100 new people, scored once. Right person is 0.808, against 0.756 with no persona and 0.744 for the most common answer: it beats all four baselines." |
| 0:15 | **Final set**, the four cells | "Compared with the check set: spread rose (0.895), right person and steady slipped just past noise, and group gaps stayed within it." |
| 0:25 | **By question family** | "Pricing holds up. Policy falls just below the simple baselines on new people. The held-out decision puzzles, never used in tuning, fall below every baseline, though agents reproduced 11 of 15 real experiment effects." |
| 0:38 | **Follow one respondent** | "Respondent 73 is a strong tightwad. Round 9's relative profile told the agent so, and it flipped three answers to match theirs: no to dog food and milk, yes to baking soda. 36 of 50 right, up from 33." |
| 0:50 | **Decision trail** | "Our judgment changed course four times. We revoked round 7. Edits came from our Papiers notes. We spotted round 3's lucky bar and re-ran it 5 times, which flipped round 9 to keep. Then gains fell below noise, so we stopped." |
| 1:05 | **Rounds** table, select round 9 | "Each round runs from highlights and notes, to one edit, to a verdict from code, to our typed review." |
| 1:15 | **What we learned** | "Limits: the gains are small and near noise, the final set is scored once, policy and puzzles trail simple baselines, and staples never moved." |

## Follow one respondent

Respondent 73 comes from the **tuning set**, because the check and final answer sheets stay locked. Say so on stage.
The agent read this relative profile, computed from their earlier answers:

- More of a tightwad than about 90% of respondents.
- About as trusting as most respondents.
- Less risk-averse than about 75% of respondents.

Round 9 matched 36 of their 50 answers, against 33 for round 0's instructions. Round 9 changed three outcomes, and
all three changes were improvements:

| Question | Real answer | Round 0 | Round 9 |
|---|---|---|---|
| Purina Dog Chow, 44 lb bag | No | ✗ Yes | ✓ No |
| ARM & HAMMER baking soda, $2.16 | Yes | ✗ No | ✓ Yes |
| Great Value whole milk, gallon, $7.84 | No | ✗ Yes | ✓ No |

## How the walkthrough maps to the judging criteria

| Criterion | Where it shows |
|---|---|
| Autonomous research | Rounds table and round chain: hypothesis, one edit, a scored run, a verdict, the agent's next suggested edit |
| Human–agent collaboration | Papiers highlights and notes at the start of each chain; the typed review at its end; the decision trail |
| Technical execution | Four checks computed by code; answer sheets locked away; bar and noise from 5 repeat runs; final set scored once |
| Originality | Tuning the instructions, not the model, against real respondents, and keeping a change only if it beats noise |
| Evidence and demonstration | Every round's diff, scores, sources and verdict on the page; final and held-out results; one respondent followed |

## Honest limits to say out loud

- Gains are small. Round 9's spread gain clears its noise by 0.001, on the mean of 2 runs.
- The final set is scored once. On new people, right person (0.808) and steady (0.957) fall just past the check set's
  noise (0.820 ± 0.011 and 0.970 ± 0.009).
- Policy right person (0.792) falls below the most common answer (0.810) and no persona (0.808) on new people.
- The held-out puzzles fall below every baseline (0.834 against 0.848–0.855), with spread 0.522. Agents reproduced 11
  of 15 real experiment effects in sign.
- Staples such as milk and coffee stayed near certain yes after the edits aimed at them (rounds 7–8).
- The followed respondent is from the tuning set. Twin-2K-500 measures what people say on a survey, not what they do.
