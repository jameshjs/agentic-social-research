#!/usr/bin/env python3
"""Fetch on each Claude prompt; fast-forward only a clean, non-divergent main."""

import json
import os
import subprocess
import sys
from pathlib import Path


def git(root: Path, *args: str, timeout: int = 12) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        check=False,
    )


def note(message: str) -> None:
    print(f"Git sync: {message}")


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except (ValueError, OSError):
        hook_input = {}

    cwd = Path(hook_input.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
    try:
        top = git(cwd, "rev-parse", "--show-toplevel")
        if top.returncode != 0:
            return
        root = Path(top.stdout.strip())
        remote = git(root, "remote", "get-url", "origin")
        if remote.returncode != 0:
            note("no origin remote; ask the team for the repository URL.")
            return

        fetched = git(root, "fetch", "--quiet", "origin")
        if fetched.returncode != 0:
            note("could not fetch origin; check network/auth and retry before integration or push.")
            return

        branch = git(root, "symbolic-ref", "--quiet", "--short", "HEAD")
        if branch.returncode != 0 or branch.stdout.strip() != "main":
            # Feature branches need their owner's chosen merge/rebase strategy.
            return

        remote_head = git(root, "rev-parse", "--verify", "refs/remotes/origin/main")
        local_head = git(root, "rev-parse", "HEAD")
        if remote_head.returncode != 0 or local_head.returncode != 0:
            note("origin/main is unavailable; inspect remote branches before working.")
            return
        if remote_head.stdout == local_head.stdout:
            return

        local_is_ancestor = git(root, "merge-base", "--is-ancestor", "HEAD", "origin/main")
        if local_is_ancestor.returncode != 0:
            remote_is_ancestor = git(root, "merge-base", "--is-ancestor", "origin/main", "HEAD")
            if remote_is_ancestor.returncode != 0:
                note("main diverged from origin/main; coordinate a deliberate merge or rebase.")
            return  # A locally ahead main must not be changed by this hook.

        status = git(root, "status", "--porcelain", "--untracked-files=all")
        if status.returncode != 0:
            note("could not inspect the working tree; no pull attempted.")
            return
        if status.stdout.strip():
            note("origin/main has new commits, but local changes exist; commit your work and integrate safely.")
            return

        merged = git(root, "merge", "--ff-only", "--quiet", "origin/main")
        if merged.returncode == 0:
            note("fast-forwarded clean main to origin/main.")
        else:
            note("fast-forward failed; inspect git status and integrate manually.")
    except (OSError, subprocess.TimeoutExpired):
        note("sync check timed out or could not run; retry git fetch before integration or push.")


if __name__ == "__main__":
    main()
