---
name: run-plan
description: Orchestrates implementation of an approved Development Plan (docs/plans/<slug>.md) with the project's agents — implementer per module (parallel worktrees), then plan-verifier, then architecture-reviewer in parallel with test-writer, then a bugs/security review, optionally doc-writer. Use when the user says to run/execute/implement a plan, or types /run-plan <plan path>, especially in multi-agent mode. Does not write code itself and never commits or pushes.
argument-hint: <path to docs/plans/<slug>.md>
---

# Run a Development Plan

Plan: `$ARGUMENTS` (if empty, use the most recent file under `docs/plans/`; ask if more
than one is a plausible candidate). Delegate everything to agents and relay concise
results — do not implement, test or review anything yourself.

## Steps

1. **Read the plan** and its `Execution mode`. If it says single-agent, run one
   `implementer` on the whole plan, then continue from step 3.
2. **implementer** — split the plan's steps by module. Independent modules (`server`,
   `client`, `reviewer-core`) go to separate `implementer` agents in parallel, each with
   `isolation: "worktree"` and told exactly which steps/module to do; merge the worktrees
   back afterwards. Dependent steps run sequentially. Never `git push`.
3. **plan-verifier** — pass the plan path AND its spec. If any step is PARTIAL /
   NOT FOUND / DIVERGED, send the gaps back to `implementer` and re-verify (max 2
   rounds), then stop and ask the user.
4. **architecture-reviewer** and **test-writer** — launch in parallel in one message
   (reviewer is read-only; test-writer only adds tests). Pass them the changed file list
   and the spec's `AC-n`.
5. **Bugs and security** — run the `code-review` skill (or `pr-self-review`) on the
   changes; feed critical findings back to `implementer`, then re-run affected tests only.
6. **doc-writer** — only if the user asks for docs.
7. **Summary** — verifier verdict, architecture findings count, test result, AC coverage,
   open flags. If all is green, suggest moving the spec to `Status: implemented` (the user
   or `specreator` edits it). Do not commit or push unless asked.
