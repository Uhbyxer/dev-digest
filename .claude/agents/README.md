# Agents map

Three-agent pipeline for dev-digest work: **planner → implementer**, plus a
standalone **researcher**. Each agent's own file is the source of truth for
its exact instructions — this README is an index, not a copy.

| Agent | File | Model | Tools | Role |
|---|---|---|---|---|
| [planner](planner.md) | `planner.md` | sonnet | Read, Grep, Glob, Bash, Write | Turns a task/GitHub issue into a Development Plan file |
| [implementer](implementer.md) | `implementer.md` | sonnet | Read, Write, Edit, Bash, Glob, Grep, Skill | Executes an existing Development Plan step by step |
| [researcher](researcher.md) | `researcher.md` | sonnet | Read, Grep, Glob, Bash, WebFetch, WebSearch | Investigates a question (repo and/or external), never edits code |

## planner

- **Responsibility**: produce a structured Development Plan for a feature/fix
  or GitHub issue, grounded in module boundaries (`server`/`client`/
  `reviewer-core`/`e2e`), each touched module's `INSIGHTS.md`, `CONTEXT.md`/
  ADRs, and onion-architecture constraints between `reviewer-core` and
  `server`. Names, per step, which project skill the implementer must apply.
- **Permissions**: read-only over code (`Read`/`Grep`/`Glob`/`Bash`); the only
  `Write` use is the plan file itself. No `Edit`, no `Skill` tool — it does
  not apply skills, only cites which one applies to each step.
- **Input**: a task description or GitHub issue number.
- **Output**: `docs/plans/<slug>.md` (Context, Architectural constraints, ADR
  conflicts, Steps with files + skill(s) + module, Tests to run, Out of
  scope), plus a short chat summary.
- **Does not**: write/edit application code, perform architectural or
  security review.
- **Sources its rules are grounded in**:
  - `CLAUDE.md` (module table, port list, do-not-touch list)
  - `TESTING.md` (per-package test commands it must cite under "Tests to run")
  - `docs/agents/domain.md` and `docs/agents/issue-tracker.md` (how to read
    `CONTEXT.md`/ADRs and GitHub issues)
  - the `onion-architecture` skill (`.claude/skills/onion-architecture/`) —
    its trigger paths (`reviewer-core/src/**`, `server/src/modules/**`,
    `server/src/adapters/**`, `server/src/platform/container.ts`,
    `server/src/db/**`) define exactly where the planner must require a
    port/adapter instead of a direct dependency
  - the `engineering-insights` skill contract (module `INSIGHTS.md` files)

## implementer

- **Responsibility**: execute a Development Plan (as written by `planner`,
  typically under `docs/plans/`) across frontend and backend, selecting and
  invoking the relevant project skill per file it touches, running the
  project's test suites, and checking only that its changes match the plan's
  stated scope.
- **Permissions**: full edit access (`Read`/`Write`/`Edit`/`Bash`/`Glob`/
  `Grep`) plus `Skill`, since it must invoke skills as it works. Preloads the
  `engineering-insights` skill.
- **Input**: a Development Plan file path (or "the plan the planner just
  wrote").
- **Output**: code changes matching the plan, an `INSIGHTS.md` append for
  anything substantial newly learned, and a chat report (Steps completed /
  Tests run / Deviations from plan / Flagged for other agents).
- **Does not**: create or rewrite plans, perform onion-architecture or
  security review (it may flag concerns for those agents but must not fix or
  block on them), `git push`, touch `server/clones/**`.
- **Sources its rules are grounded in**:
  - the plan file itself (authoritative scope — the implementer applies it,
    does not re-derive it)
  - `TESTING.md` (authoritative per-package test commands)
  - `CLAUDE.md` (do-not-touch list, migration-does-not-run-on-boot gotcha)
  - the skill set named in the plan, drawn from: `fastify-best-practices`,
    `drizzle-orm-patterns`, `postgresql-table-design`, `next-best-practices`,
    `react-best-practices`, `react-nextjs-architecture`,
    `react-testing-library`, `zod`, `typescript-expert`,
    `engineering-insights`

## researcher

- **Responsibility**: answer a specific question via repo research (code,
  config, docs, git history) and/or external research (docs sites,
  standards, articles). Read-only.
- **Permissions**: `Read`, `Grep`, `Glob`, `Bash` for repo investigation;
  `WebFetch`, `WebSearch` for external investigation. No `Write`/`Edit` —
  cannot save its own report to a file. Never invokes `/deep-research`.
- **Input**: a concrete question with scope (repo-internal, external, or
  both). Asks clarifying questions first if the request is vague.
- **Output**: a chat-only Markdown report per mode used (Findings / Evidence
  / References / Could not find) — never a file, never a code change.
- **Does not**: modify anything, plan, or implement.
