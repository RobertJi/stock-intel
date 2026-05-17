#!/usr/bin/env python3
"""Scan GitHub for agent-ready issues and optionally prepare worktrees."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


READY_LABEL = "agent-ready"
WORKING_LABEL = "agent-working"
BLOCKED_LABEL = "agent-blocked"
DONE_LABEL = "agent-done"


@dataclass(frozen=True)
class ScannerConfig:
    repo: str
    repo_root: Path
    base: str
    remote: str
    worktrees_dir: str | None
    limit: int
    max_issues: int
    prepare: bool
    claim: bool
    dry_run: bool
    keep_going: bool


def run(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
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


def label_names(issue: dict[str, Any]) -> set[str]:
    return {label["name"] for label in issue.get("labels", [])}


def list_ready_issues(config: ScannerConfig) -> list[dict[str, Any]]:
    fields = "number,title,url,updatedAt,labels"
    proc = run(
        [
            "gh",
            "issue",
            "list",
            "--repo",
            config.repo,
            "--state",
            "open",
            "--label",
            READY_LABEL,
            "--limit",
            str(config.limit),
            "--json",
            fields,
        ],
        cwd=config.repo_root,
    )
    issues = json.loads(proc.stdout)
    candidates: list[dict[str, Any]] = []
    for issue in issues:
        labels = label_names(issue)
        if WORKING_LABEL in labels or BLOCKED_LABEL in labels or DONE_LABEL in labels:
            continue
        candidates.append(issue)
    candidates.sort(key=lambda item: item["number"])
    return candidates[: config.max_issues]


def runner_command(config: ScannerConfig, issue_number: int) -> list[str]:
    cmd = [
        "python3",
        "scripts/agent_issue_runner.py",
        str(issue_number),
        "--repo",
        config.repo,
        "--base",
        config.base,
        "--remote",
        config.remote,
    ]
    if config.worktrees_dir:
        cmd.extend(["--worktrees-dir", config.worktrees_dir])
    if config.claim:
        cmd.append("--claim")
    if config.dry_run:
        cmd.append("--dry-run")
    return cmd


def prepare_issue(config: ScannerConfig, issue: dict[str, Any]) -> dict[str, Any]:
    cmd = runner_command(config, issue["number"])
    if config.dry_run:
        print("+ " + " ".join(cmd))
    proc = subprocess.run(
        cmd,
        cwd=str(config.repo_root),
        text=True,
        capture_output=True,
        check=False,
    )
    result = {
        "issue": issue["number"],
        "title": issue["title"],
        "url": issue["url"],
        "command": cmd,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }
    if proc.returncode != 0 and not config.keep_going:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        raise SystemExit(proc.returncode)
    return result


def scan(config: ScannerConfig) -> dict[str, Any]:
    candidates = list_ready_issues(config)
    results: list[dict[str, Any]] = []
    if config.prepare:
        for issue in candidates:
            results.append(prepare_issue(config, issue))

    return {
        "repo": config.repo,
        "ready_count": len(candidates),
        "prepared_count": len(results),
        "prepare": config.prepare,
        "claim": config.claim,
        "dry_run": config.dry_run,
        "candidates": [
            {
                "number": issue["number"],
                "title": issue["title"],
                "url": issue["url"],
                "labels": sorted(label_names(issue)),
            }
            for issue in candidates
        ],
        "results": results,
    }


def parse_args() -> ScannerConfig:
    parser = argparse.ArgumentParser(description="Scan for agent-ready GitHub issues.")
    parser.add_argument("--repo", help="GitHub repo in owner/name form. Defaults to gh repo view.")
    parser.add_argument("--base", default="main", help="Base branch for prepared worktrees.")
    parser.add_argument("--remote", default="origin", help="Git remote for prepared worktrees.")
    parser.add_argument("--worktrees-dir", help="Directory for prepared issue worktrees.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum issues to fetch from GitHub.")
    parser.add_argument("--max-issues", type=int, default=1, help="Maximum ready issues to prepare per scan.")
    parser.add_argument("--prepare", action="store_true", help="Prepare worktrees for matching issues.")
    parser.add_argument("--claim", action="store_true", help="Pass --claim to the issue runner. Requires --prepare.")
    parser.add_argument("--dry-run", action="store_true", help="Print mutating commands without running them.")
    parser.add_argument("--keep-going", action="store_true", help="Continue after an issue preparation failure.")
    args = parser.parse_args()

    if args.claim and not args.prepare:
        raise SystemExit("--claim requires --prepare")

    for name in ("git", "gh", "python3"):
        require_bin(name)

    repo_root = repo_root_from_git()
    repo = args.repo or repo_name_with_owner(repo_root)

    return ScannerConfig(
        repo=repo,
        repo_root=repo_root,
        base=args.base,
        remote=args.remote,
        worktrees_dir=args.worktrees_dir,
        limit=args.limit,
        max_issues=args.max_issues,
        prepare=args.prepare,
        claim=args.claim,
        dry_run=args.dry_run,
        keep_going=args.keep_going,
    )


def main() -> int:
    print(json.dumps(scan(parse_args()), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
