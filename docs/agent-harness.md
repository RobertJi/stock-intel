# Signals Agent Harness

This repo is the first pilot for the personal project harness.

## Current Phase

Phase 1 is complete:

- Agent issue template exists at .github/ISSUE_TEMPLATE/agent-task.md.
- CI exists at .github/workflows/ci.yml.
- Agent labels exist in GitHub.
- main is branch-protected and requires Web checks.

Phase 2 adds the local worktree runner. Phase 3 adds the scanner that finds ready issues and optionally calls the runner.

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

## Scanning Ready Issues

List candidate issues without mutating anything:

~~~bash
python3 scripts/agent_issue_scanner.py
~~~

Preview scanner-to-runner execution:

~~~bash
python3 scripts/agent_issue_scanner.py --prepare --claim --dry-run
~~~

Actually prepare and claim one issue:

~~~bash
python3 scripts/agent_issue_scanner.py --prepare --claim
~~~

The scanner defaults to one issue per run. Increase cautiously:

~~~bash
python3 scripts/agent_issue_scanner.py --prepare --claim --max-issues 2
~~~

Do not run the scanner from cron until the coding backend layer is connected. Otherwise issues will be claimed and prepared, but no agent will actually write code.

## Next Step

## Executing A Prepared Worktree

After a worktree has been prepared, run the executor:

~~~bash
python3 scripts/agent_issue_executor.py ~/dev/worktrees/stock-intel/issue-<number>
~~~

By default it uses Codex as the coding backend. To publish the result:

~~~bash
python3 scripts/agent_issue_executor.py ~/dev/worktrees/stock-intel/issue-<number> --commit --push --pr
~~~

For deterministic smoke tests, use the command backend:

~~~bash
python3 scripts/agent_issue_executor.py ~/dev/worktrees/stock-intel/issue-<number> --backend command --command "npm run lint" 
~~~

The executor refuses to publish forbidden files such as .env files, data files, __pycache__, and pyc files.

## Next Step

The next harness layer should wire scanner -> runner -> executor into a controlled cron job, then add a CI failure repair loop.
## Phase 4 Smoke Test

- 2026-05-17: executor smoke test confirmed scanner -> runner -> executor -> PR publication flow.

