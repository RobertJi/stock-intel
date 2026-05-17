#!/usr/bin/env python3
"""Execute a prepared agent worktree and optionally publish a pull request."""

from __future__ import annotations

import argparse
import fnmatch
import json
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FORBIDDEN_PATTERNS = [
    ".env",
    ".env.*",
    "data/*",
    "**/__pycache__/*",
    "__pycache__/*",
    "*.pyc",
]


@dataclass(frozen=True)
class ExecutorConfig:
    worktree: Path
    backend: str
    command: str | None
    commit: bool
    push: bool
    pr: bool
    pr_draft: bool
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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_context(worktree: Path) -> tuple[dict[str, Any], dict[str, Any], str]:
    run_dir = worktree / ".agent-run"
    state_path = run_dir / "state.json"
    issue_path = run_dir / "issue.json"
    prompt_path = run_dir / "prompt.md"
    for path in (state_path, issue_path, prompt_path):
        if not path.exists():
            raise SystemExit(f"Missing prepared agent file: {path}")
    return load_json(state_path), load_json(issue_path), prompt_path.read_text(encoding="utf-8")


def git_changed_files(worktree: Path) -> list[str]:
    proc = run(["git", "status", "--porcelain"], cwd=worktree)
    files: list[str] = []
    for line in proc.stdout.splitlines():
        if not line:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        files.append(path)
    return files


def forbidden_files(files: list[str]) -> list[str]:
    blocked: list[str] = []
    for path in files:
        for pattern in FORBIDDEN_PATTERNS:
            if fnmatch.fnmatch(path, pattern):
                blocked.append(path)
                break
    return blocked


def run_backend(config: ExecutorConfig, prompt: str) -> dict[str, Any]:
    if config.backend == "noop":
        output = "noop backend: no coding command executed"
        (config.worktree / ".agent-run" / "backend.log").write_text(output + "\n", encoding="utf-8")
        return {"backend": config.backend, "returncode": 0, "stdout": output, "stderr": ""}

    if config.backend == "command":
        if not config.command:
            raise SystemExit("--command is required when --backend command is used")
        proc = subprocess.run(
            config.command,
            cwd=str(config.worktree),
            shell=True,
            text=True,
            capture_output=True,
            check=False,
        )
        result = {
            "backend": config.backend,
            "command": config.command,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }
        (config.worktree / ".agent-run" / "backend.log").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if proc.returncode != 0:
            raise SystemExit(f"Backend command failed ({proc.returncode})\n{proc.stderr.strip() or proc.stdout.strip()}")
        return result

    if config.backend == "codex":
        require_bin("codex")
        proc = subprocess.run(
            [
                "codex",
                "exec",
                "-C",
                str(config.worktree),
                "--sandbox",
                "workspace-write",
                "--ask-for-approval",
                "never",
                "-",
            ],
            input=prompt,
            text=True,
            capture_output=True,
            check=False,
        )
        result = {
            "backend": config.backend,
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }
        (config.worktree / ".agent-run" / "backend.log").write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if proc.returncode != 0:
            raise SystemExit(f"Codex backend failed ({proc.returncode})\n{proc.stderr.strip() or proc.stdout.strip()}")
        return result

    raise SystemExit(f"Unsupported backend: {config.backend}")


def verification_summary(worktree: Path) -> str:
    checks = []
    for cmd in (
        ["python3", "-m", "py_compile", "scripts/agent_issue_runner.py", "scripts/agent_issue_scanner.py", "scripts/agent_issue_executor.py"],
        ["npm", "run", "lint"],
    ):
        proc = subprocess.run(cmd, cwd=str(worktree), text=True, capture_output=True, check=False)
        checks.append({"command": " ".join(cmd), "returncode": proc.returncode})
    return "\n".join(f"- {item['command']}: exit {item['returncode']}" for item in checks)


def commit_changes(config: ExecutorConfig, state: dict[str, Any], issue: dict[str, Any], files: list[str]) -> str | None:
    if not files:
        return None
    message = f"agent: issue {state['issue']} {issue['title']}"
    run(["git", "add", "-A"], cwd=config.worktree, dry_run=config.dry_run)
    run(["git", "commit", "-m", message], cwd=config.worktree, dry_run=config.dry_run)
    if config.dry_run:
        return None
    proc = run(["git", "rev-parse", "HEAD"], cwd=config.worktree)
    return proc.stdout.strip()


def push_branch(config: ExecutorConfig, state: dict[str, Any]) -> None:
    run(["git", "push", "-u", "origin", state["branch"]], cwd=config.worktree, dry_run=config.dry_run)


def create_pr(config: ExecutorConfig, state: dict[str, Any], issue: dict[str, Any], files: list[str]) -> str | None:
    body = f"""## Summary

- Agent execution for issue #{state['issue']}: {issue['title']}

## Linked Issue

Closes #{state['issue']}

## Changed Files

{chr(10).join(f"- {path}" for path in files)}

## Verification

{verification_summary(config.worktree)}
"""
    cmd = [
        "gh",
        "pr",
        "create",
        "--repo",
        state["repo"],
        "--base",
        state["base"],
        "--head",
        state["branch"],
        "--title",
        f"agent: issue {state['issue']} {issue['title']}",
        "--body",
        body,
    ]
    if config.pr_draft:
        cmd.append("--draft")
    proc = run(cmd, cwd=config.worktree, dry_run=config.dry_run)
    return proc.stdout.strip() if proc.stdout else None


def update_state(worktree: Path, updates: dict[str, Any]) -> None:
    state_path = worktree / ".agent-run" / "state.json"
    state = load_json(state_path)
    state.update(updates)
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def execute(config: ExecutorConfig) -> dict[str, Any]:
    for name in ("git", "gh"):
        require_bin(name)

    state, issue, prompt = load_context(config.worktree)
    backend_result = run_backend(config, prompt)
    files = git_changed_files(config.worktree)
    blocked = forbidden_files(files)
    if blocked:
        raise SystemExit("Refusing to publish forbidden files: " + ", ".join(blocked))

    commit_sha = None
    pr_url = None
    if files and config.commit:
        commit_sha = commit_changes(config, state, issue, files)
    if files and config.push:
        push_branch(config, state)
    if files and config.pr:
        pr_url = create_pr(config, state, issue, files)

    status = "pr_opened" if pr_url else ("committed" if commit_sha else "executed")
    if not files:
        status = "no_changes"

    if not config.dry_run:
        update_state(
            config.worktree,
            {
                "status": status,
                "backend": config.backend,
                "changed_files": files,
                "commit_sha": commit_sha,
                "pr_url": pr_url,
            },
        )

    return {
        "issue": state["issue"],
        "worktree": str(config.worktree),
        "backend": backend_result,
        "changed_files": files,
        "commit_sha": commit_sha,
        "pr_url": pr_url,
        "status": status,
    }


def parse_args() -> ExecutorConfig:
    parser = argparse.ArgumentParser(description="Execute a prepared agent issue worktree.")
    parser.add_argument("worktree", type=Path, help="Prepared issue worktree path")
    parser.add_argument("--backend", choices=["codex", "command", "noop"], default="codex")
    parser.add_argument("--command", help="Shell command to run when --backend command is used")
    parser.add_argument("--commit", action="store_true", help="Commit resulting changes")
    parser.add_argument("--push", action="store_true", help="Push the worktree branch")
    parser.add_argument("--pr", action="store_true", help="Open a pull request")
    parser.add_argument("--pr-draft", action="store_true", help="Open the pull request as draft")
    parser.add_argument("--dry-run", action="store_true", help="Print git/gh publish commands without running them")
    args = parser.parse_args()

    worktree = args.worktree.expanduser().resolve()
    if not worktree.exists():
        raise SystemExit(f"Worktree does not exist: {worktree}")
    if args.pr and not args.push:
        raise SystemExit("--pr requires --push")
    if args.push and not args.commit:
        raise SystemExit("--push requires --commit")

    return ExecutorConfig(
        worktree=worktree,
        backend=args.backend,
        command=args.command,
        commit=args.commit,
        push=args.push,
        pr=args.pr,
        pr_draft=args.pr_draft,
        dry_run=args.dry_run,
    )


def main() -> int:
    print(json.dumps(execute(parse_args()), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
