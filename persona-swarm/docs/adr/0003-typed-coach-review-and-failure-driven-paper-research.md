---
status: accepted
---

# Require a typed coach review after every round, and research a failing check in papers before the next edit

Rounds 4 to 7 kept nothing. Round 7 was the first round to use Steven's Papiers highlights, but they only reshaped the
persona format (an interviewer-and-me transcript). The redo turned one highlight into a generic instruction ("not a
helpful assistant"). Neither had any effect. Spread fell past its noise both times, as it had in rounds 2 and 6, and
the everyday items agents over-buy didn't move. The highlights had been chosen before this failure was known, so none
of them addressed it. Coaches also had no say between triggers, so four rounds ran without a human comment.

So on 17 Oct Steven:

- **Revoked round 7's interview-format run.** It stays in `rounds/_revoked/` with no `results.tsv` row, and round 7
  was redone as an instruction edit.
- **Required a typed coach review after every round.** The review is a verdict (sign off, reject or continue), a
  comment and an improvement for the next round, all in the coach's own words. `record_round.py --review` writes it
  into the round's `decision.json` and onto its `coach_notes` in `results.tsv`, and `run_round.py` refuses to start
  the next round until it exists. The researcher agent may suggest comments and improvements, marked as suggestions,
  but never records its own text as the coach's.
- **Made a check that keeps failing drive the research.** The researcher agent first asks a coach to save and
  highlight papers about that failure, then runs `coach_notes.py` and drafts the next edits from those highlights.

## Considered options

- **Keep coaching to sign-offs and triggers.** Rejected: rounds 4–7 ran with no human comment between triggers, while
  the same failure repeated.
- **Let the researcher agent pick and cite papers itself.** Rejected: highlights are how coaches give research
  knowledge (CONTEXT.md). The agent may propose a reading list, but a coach chooses what gets highlighted.

## Consequences

- Each round now waits for a coach, so the ten rounds take longer. Rounds 0–6 predate the rule and count as reviewed.
- Round results stay uncommitted until a coach has looked at them (Steven, 17 Oct). The researcher agent hands over
  the commit subject the recorder printed.
- The review reaches the page through `results.tsv`'s `coach_notes`, so the exporter is unchanged.
- The scorer, noise, keep rule and benchmark are unchanged: this changes who steers between rounds, not how a round
  is judged.
