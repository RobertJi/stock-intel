#!/usr/bin/env python3
"""Prepare an isolated worktree for a GitHub issue-backed agent task."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


AGENT_LABELS = {
    "ready": "agent-ready",
    "working": "agent-working",
    "blocked": "agent-blocked",
    "pr_opened": "agent-pr-opened",
    "ci_failed": "agent-ci-failed",
    "done": "agent-done",
}


@dataclass(frozen=True)
class RunnerConfig:
    issue: int
    repo: str
    repo_root: Path
    base: str
    remote: str
    worktrees_dir: Path
    require_ready_label: bool
    claim: bool
    dry_run: bool


def run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    input_text: str | None = None,
    dry_run: bool = False,
) -> subprocess.CompletedProcess[str]:
    if dry_run:
        print("+ " + " ".join(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")

    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip()
        raise SystemExit(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{message}")
    return proc


def require_bin(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Missing required command: {name}")


def repo_root_from_git() -> Path:
    proc = run(["git", "rev-parse", "--show-toplevel"])
    return Path(proc.stdout.strip()).resolve()


def repo_name_with_owner(repo_root: Path) -> str:
    proc = run(["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd=repo_root)
    return proc.stdout.strip()


def slugify(value: str, max_len: int = 48) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return (value[:max_len].strip("-") or "task")


def issue_labels(issue: dict[str, Any]) -> set[str]:
    return {label["name"] for label in issue.get("labels", [])}


def load_issue(config: RunnerConfig) -> dict[str, Any]:
    fields = "number,title,body,url,state,labels,comments"
    proc = run(
        ["gh", "issue", "view", str(config.issue), "--repo", config.repo, "--json", fields],
        cwd=config.repo_root,
    )
    issue = json.loads(proc.stdout)
    if issue.get("state") != "OPEN":
        raise SystemExit(f"Issue #{config.issue} is not open: {issue.get('state')}")

    labels = issue_labels(issue)
    if config.require_ready_label and AGENT_LABELS["ready"] not in labels:
        raise SystemExit(
            f"Issue #{config.issue} does not have required label {AGENT_LABELS['ready']!r}. "
            "Use --no-require-ready-label for manual bootstrap runs."
        )
    if AGENT_LABELS["working"] in labels:
        raise SystemExit(f"Issue #{config.issue} already has label {AGENT_LABELS['working']!r}.")
    return issue


def ensure_clean_repo(repo_root: Path) -> None:
    proc = run(["git", "status", "--porcelain"], cwd=repo_root)
    if proc.stdout.strip():
        raise SystemExit("Repo has uncommitted changes. Commit/stash them before preparing an agent worktree.")


def ensure_branch_available(config: RunnerConfig, branch: str, worktree_path: Path) -> None:
    if worktree_path.exists():
        raise SystemExit(f"Worktree path already exists: {worktree_path}")

    local = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
        cwd=str(config.repo_root),
        check=False,
    )
    if local.returncode == 0:
        raise SystemExit(f"Local branch already exists: {branch}")

    remote = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/remotes/{config.remote}/{branch}"],
        cwd=str(config.repo_root),
        check=False,
    )
    if remote.returncode == 0:
        raise SystemExit(f"Remote branch already exists: {config.remote}/{branch}")


def render_prompt(issue: dict[str, Any], config: RunnerConfig, branch: str) -> str:
    labels = ", ".join(sorted(issue_labels(issue))) or "(none)"
    comments = issue.get("comments") or []
    rendered_comments = "\n\n".join(
        f"### Comment by {comment.get('author', {}).get('login', 'unknown')} at {comment.get('createdAt')}\n\n{comment.get('body', '')}"
        for comment in comments
    )
    if not rendered_comments:
        rendered_comments = "(no comments)"

    return f"""# Agent Task Prompt

You are working on GitHub issue #{issue['number']} in an isolated worktree.

Repository: {config.repo}
Base branch: {config.base}
Working branch: {branch}
Issue URL: {issue['url']}
Labels: {labels}

## Rules

- Do not modify files outside the issue scope.
- Do not commit secrets, .env files, data files, __pycache__, or generated caches.
- Keep unrelated refactors out of the PR.
- Run the smallest meaningful verification command before committing.
- Commit changes to the current branch only.
- Open a PR against {config.base} when complete.
- In the final summary, include changed files and verification commands.

## Issue Title

{issue['title']}

## Issue Body

{issue.get('body') or '(empty)'}

## Issue Comments

{rendered_comments}
"""


def write_agent_files(worktree_path: Path, issue: dict[str, Any], config: RunnerConfig, branch: str) -> None:
    run_dir = worktree_path / ".agent-run"
    run_dir.mkdir(parents=True, exist_ok=False)

    state = {
        "repo": config.repo,
        "issue": issue["number"],
        "issue_url": issue["url"],
        "base": config.base,
        "branch": branch,
        "worktree": str(worktree_path),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "prepared",
    }

    (run_dir / "issue.json").write_text(json.dumps(issue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (run_dir / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (run_dir / "prompt.md").write_text(render_prompt(issue, config, branch), encoding="utf-8")


def claim_issue(config: RunnerConfig, issue: dict[str, Any], branch: str, worktree_path: Path) -> None:
    body = (
        "Agent runner prepared this issue.\n\n"
        f"- Branch: {branch}\n"
        f"- Worktree: {worktree_path}\n"
        "- Status: prepared for coding agent execution"
    )
    run(
        [
            "gh",
            "issue",
            "edit",
            str(issue["number"]),
            "--repo",
            config.repo,
            "--remove-label",
            AGENT_LABELS["ready"],
            "--add-label",
            AGENT_LABELS["working"],
        ],
        cwd=config.repo_root,
        dry_run=config.dry_run,
    )
    run(
        ["gh", "issue", "comment", str(issue["number"]), "--repo", config.repo, "--body", body],
        cwd=config.repo_root,
        dry_run=config.dry_run,
    )


def prepare(config: RunnerConfig) -> dict[str, Any]:
    issue = load_issue(config)
    title_slug = slugify(issue["title"])
    branch = f"agent/issue-{config.issue}-{title_slug}"
    worktree_path = (config.worktrees_dir / f"issue-{config.issue}").resolve()

    if not config.dry_run:
        ensure_clean_repo(config.repo_root)
    ensure_branch_available(config, branch, worktree_path)

    run(["git", "fetch", config.remote, config.base], cwd=config.repo_root, dry_run=config.dry_run)
    run(
        [
            "git",
            "worktree",
            "add",
            str(worktree_path),
            "-b",
            branch,
            f"{config.remote}/{config.base}",
        ],
        cwd=config.repo_root,
        dry_run=config.dry_run,
    )

    if not config.dry_run:
        write_agent_files(worktree_path, issue, config, branch)

    if config.claim:
        claim_issue(config, issue, branch, worktree_path)

    return {
        "repo": config.repo,
        "issue": config.issue,
        "branch": branch,
        "worktree": str(worktree_path),
        "prompt": str(worktree_path / ".agent-run" / "prompt.md"),
        "claimed": config.claim,
    }


def parse_args() -> RunnerConfig:
    parser = argparse.ArgumentParser(description="Prepare an isolated worktree for an agent-ready GitHub issue.")
    parser.add_argument("issue", type=int, help="GitHub issue number")
    parser.add_argument("--repo", help="GitHub repo in owner/name form. Defaults to gh repo view.")
    parser.add_argument("--base", default="main", help="Base branch. Defaults to main.")
    parser.add_argument("--remote", default="origin", help="Git remote name. Defaults to origin.")
    parser.add_argument("--worktrees-dir", help="Directory for issue worktrees. Defaults to ~/dev/worktrees/<repo>.")
    parser.add_argument("--claim", action="store_true", help="Move issue from agent-ready to agent-working and comment.")
    parser.add_argument(
        "--no-require-ready-label",
        action="store_true",
        help="Allow preparing an issue without the agent-ready label.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print git/gh mutations without running them.")
    args = parser.parse_args()

    for name in ("git", "gh"):
        require_bin(name)

    repo_root = repo_root_from_git()
    repo = args.repo or repo_name_with_owner(repo_root)
    repo_name = repo.split("/")[-1]
    worktrees_dir = Path(args.worktrees_dir).expanduser() if args.worktrees_dir else Path.home() / "dev" / "worktrees" / repo_name

    return RunnerConfig(
        issue=args.issue,
        repo=repo,
        repo_root=repo_root,
        base=args.base,
        remote=args.remote,
        worktrees_dir=worktrees_dir.resolve(),
        require_ready_label=not args.no_require_ready_label,
        claim=args.claim,
        dry_run=args.dry_run,
    )


def main() -> int:
    summary = prepare(parse_args())
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
