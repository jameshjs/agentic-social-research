@AGENTS.md

# Claude Code team workflow

The imported `AGENTS.md` is the shared product contract. Read the linked PRD, research dossier, Toronto demo notes, and [fare paper pack](./papers.md) before changing architecture. The TTC fare case is one demo of a general hypothesis engine. For Papiers work, read [papiers-setup.md](./papiers-setup.md) and use the [evidence index](./data/ttc_fare_evidence.json) only as an explicitly agent-curated offline fallback.

## Keep this four-person checkout current

- The committed `.claude/settings.json` runs `sync-main.py` before **every user prompt**. It fetches `origin`, then fast forwards a clean local `main` when possible. Read any warning it prints before editing.
- At the start of a work block and at least every 30 minutes during a long turn, run `git status -sb` and `git fetch origin`. On a clean `main`, run `git pull --ff-only origin main` if behind. Also sync before changing shared contracts, integration, and the final push.
- If the tree has uncommitted or untracked work, the hook **fetches but does not pull**. Finish and commit your own coherent change first, then integrate the fetched commits. If histories diverge or a merge conflicts, resolve it deliberately with the affected owner. Never discard another person's changes to make a pull succeed.
- Never use `git reset --hard`, `git clean -fd`, force push, or automatic stash in the shared checkout. Do not edit a teammate's active files without coordinating. Prefer a separate feature branch or worktree for overlapping work.
- Push small, working vertical slices and tell the team the commit hash and any changed interface. Before pushing, fetch and verify the branch is current. The handoff cadence and file ownership are in PRD §14.

## Shared product and implementation guardrails

- Aadit: city and economic dashboard. Steven: persona planner and agent decisions. James: world engine, orchestrator, metrics, API. Meet: hypothesis compiler, evidence/economics contract, integration, pitch, submission.
- Freeze `ScenarioSpec`, `PersonaSpec`, `WorldEvent`, `MetricDefinition`, `MetricPoint`, and `RunResult` early. Update fixtures and notify the other owner when a field changes.
- Drive animation, charts, and the decision brief from the same event/result data. Baseline and intervention must replay from a fixed seed. Clearly separate observed data, assumptions, simulated outputs, and unsupported real-world forecasts.
- Keep an offline or cached run for the four-minute demo. Verify both the TTC fare and Ontario wage prompts use the same engine, plus one unprepared prompt through the speculative fallback.
- In the Papiers demo, show investigation → evidence evaluation → agent proposed next step → genuine human annotation/approval → versioned rerun. The CLI is read-only and needs a local token; do not claim a live integration until `search`/`read` returns an actual human note and its source passage.

If the hook cannot reach `origin`, say so in your handoff and retry before integration or pushing. A hook warning is not permission to overwrite local work.
