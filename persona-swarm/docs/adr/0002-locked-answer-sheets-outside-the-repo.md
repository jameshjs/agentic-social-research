---
status: accepted
---

# Keep check and final answer sheets outside the repo; the researcher agent sees only tuning-set answers

The researcher agent runs as a Claude Code session in this repository and can read any file in it. So the answer
sheets and consistency keys for the check and final sets are stored outside the repository, where only the scorer
reads them. The researcher may read tuning-set answer sheets to study its own mistakes. Without this, a tuned
instruction could quietly encode real answers and every score would be meaningless.

## Consequences

- The scorer reads from a path outside the repo. Anyone rerunning the loop regenerates those files with the loader,
  since they are never committed.
- The researcher session's permission settings should also deny reads of that path, so the rule is enforced and not
  only a convention.
