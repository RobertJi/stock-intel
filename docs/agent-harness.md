# Signals Agent Harness

This repo is the first pilot for the personal project harness.

## Current Phase

Phase 1 is complete:

- Agent issue template exists at .github/ISSUE_TEMPLATE/agent-task.md.
- CI exists at .github/workflows/ci.yml.
- Agent labels exist in GitHub.
- main is branch-protected and requires Web checks.

Phase 2 adds the local worktree runner.

## Labels

The runner expects tasks to be explicitly marked:

- agent-ready: ready for agent pickup
- agent-working: claimed and being prepared/worked
- agent-blocked: needs human input
- agent-pr-opened: PR has been opened
- agent-ci-failed: CI failed and needs a fix loop
- agent-done: completed

## Preparing A Worktree

From the repo root:

~~~bash
python3 scripts/agent_issue_runner.py <issue-number>
~~~

By default, the issue must be open and have agent-ready.

The runner creates:

~~~text
~/dev/worktrees/stock-intel/issue-<number>
~~~

Inside that worktree it writes local, ignored agent context:

~~~text
.agent-run/issue.json
.agent-run/state.json
.agent-run/prompt.md
~~~

## Claiming An Issue

To also move the issue from agent-ready to agent-working and leave a GitHub comment:

~~~bash
python3 scripts/agent_issue_runner.py <issue-number> --claim
~~~

Use --dry-run to inspect mutating git and gh commands before running them:

~~~bash
python3 scripts/agent_issue_runner.py <issue-number> --claim --dry-run
~~~

## Manual Bootstrap

For a one-off test issue that is not labeled yet:

~~~bash
python3 scripts/agent_issue_runner.py <issue-number> --no-require-ready-label
~~~

Do not use this mode in the cron scanner. Automated pickup must require agent-ready.

## Next Step

The next harness layer should call a coding backend from the prepared worktree using .agent-run/prompt.md, then commit, push, and open a PR.
