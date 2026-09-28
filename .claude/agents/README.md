# Agents map

Seven-agent set for dev-digest work, built around the core two-stage
pipeline **planner → implementer**, plus a standalone **researcher**. Four
more agents round out the pipeline around those: **test-writer** and
**plan-verifier** both run after `implementer` finishes a plan (writing
tests for the new code, then checking the finished work off against the
plan step by step); **architecture-reviewer** runs read-only onion-
architecture boundary checks after implementation, independent of the other
two; **doc-writer** runs last, after a plan has been implemented and
accepted, turning it into project documentation. Each agent's own file is
the source of truth for its exact instructions — this README is an index,
not a copy.

| Agent | File | Model | Tools | Role |
|---|---|---|---|---|
| [planner](planner.md) | `planner.md` | sonnet | Read, Grep, Glob, Bash, Write | Turns a task/GitHub issue into a Development Plan file |
| [implementer](implementer.md) | `implementer.md` | sonnet | Read, Write, Edit, Bash, Glob, Grep, Skill | Executes an existing Development Plan step by step |
| [researcher](researcher.md) | `researcher.md` | sonnet | Read, Grep, Glob, Bash, WebFetch, WebSearch | Investigates a question (repo and/or external), never edits code |
| [test-writer](test-writer.md) | `test-writer.md` | sonnet | Read, Write, Edit, Bash, Glob, Grep, Skill | Writes unit/integration tests for existing code across `client`/`server`/`reviewer-core` |
| [architecture-reviewer](architecture-reviewer.md) | `architecture-reviewer.md` | sonnet | Read, Grep, Glob, Bash | Read-only onion-architecture boundary check with file:line evidence |
| [plan-verifier](plan-verifier.md) | `plan-verifier.md` | sonnet | Read, Glob, Grep, Bash | Cross-checks finished code against every step of a Development Plan |
| [doc-writer](doc-writer.md) | `doc-writer.md` | sonnet | Read, Write, Edit, Glob, Grep, Bash, Skill | Turns a finished, accepted plan into project documentation |

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

## test-writer

- **Responsibility**: write unit/integration tests for existing code — UI
  (`client/`) and backend (`server/`) code, and `reviewer-core/` — by
  detecting which module a target file belongs to and applying that
  module's own project skill/testing conventions rather than generic
  testing knowledge.
- **Permissions**: full edit access (`Read`/`Write`/`Edit`/`Bash`/`Glob`/
  `Grep`) plus `Skill`, since it must invoke a module-specific skill (e.g.
  `react-testing-library`, `fastify-best-practices`, `zod`,
  `typescript-expert`) as it writes tests. Preloads the
  `engineering-insights` skill.
- **Input**: a target file/component/route/adapter/module to test, or a
  gap the implementer/planner flagged as missing coverage.
- **Output**: new or extended test files colocated with the source per
  `TESTING.md`'s suite map, and a chat report (files added/extended, skills
  applied per file, tests run + pass/fail, anything flagged for other
  agents).
- **Does not**: implement application features, perform architectural or
  security review, modify the source file under test to force a test to
  pass (flags a suspected bug instead), touch `server/clones/**`.
- **Sources its rules are grounded in**:
  - `TESTING.md` (per-package suite map, unit vs `*.it.test.ts`
    integration split, "typological, not exhaustive" coverage philosophy,
    per-package test commands)
  - each touched module's `INSIGHTS.md` conventions, via the
    `engineering-insights` skill
  - the module-to-skill mapping: `react-testing-library` /
    `react-best-practices` for `client/**`, `fastify-best-practices` for
    `server/**` (no dedicated backend-testing skill exists), plain
    Vitest/TS for `reviewer-core/**`, `zod`/`typescript-expert` for typed
    fixtures across any module

## architecture-reviewer

- **Responsibility**: check onion-architecture boundaries between
  `reviewer-core` (pure domain) and `server` (DB/fs/network/Fastify/
  Drizzle) — flags `server/clones/**` touched as source, direct DB/fs/
  network access inside `reviewer-core/src/**`, and service code importing
  concrete infra instead of a repository/adapter interface. Every finding
  cites a `file:line` and the exact violating import/dependency, never
  generic advice.
- **Permissions**: `Read`, `Grep`, `Glob`, `Bash`. No Edit/Write — read-only,
  by deliberate frontmatter omission (no `Skill` either, so it can't
  indirectly trigger a mutation); `Bash` use is restricted to read-only
  investigation (`git log`/`git show`/`grep`), never a mutating command.
- **Input**: a diff, PR, or file set to check — or "the implementer's most
  recent changes" when triggered proactively after `reviewer-core/src/**`,
  `server/src/adapters/**`, `server/src/platform/container.ts`, or
  `server/src/db/**` are touched.
- **Output**: a chat-only findings table (`Severity | File:Line | Violating
  import/dependency | Rule violated`) plus a summary count, or an explicit
  "No boundary violations found" statement when clean.
- **Does not**: propose or make the fix, comment on naming/style/test
  coverage/security, run any mutating git or filesystem command.
- **Sources its rules are grounded in**:
  - `.claude/skills/onion-architecture/SKILL.md` (exact trigger paths and
    rule statement) and `docs/research/onion-architecture.md` for
    underlying rationale when a finding needs it
  - `CLAUDE.md`'s do-not-touch list (`server/clones/**`)
  - ArchUnit's directional-dependency rule (adapters may depend on domain,
    never the reverse) and Anthropic's Claude Code Review "verification
    bar" (`file:line` citation required for every finding, no naming-only
    inference)

## plan-verifier

- **Responsibility**: cross-check finished code in this repo against every
  step of a given Development Plan (and any additional requirements doc
  supplied), classifying each step DONE / PARTIAL / NOT FOUND / DIVERGED
  with concrete file evidence.
- **Permissions**: `Read`, `Glob`, `Grep`, `Bash`. No Edit/Write — read-only,
  a checker not a fixer.
- **Input**: a Development Plan file path (required; asks if more than one
  candidate under `docs/plans/` is plausible) and, optionally, a
  requirements doc (e.g. a linked GitHub issue or a `docs/specs/*.md` file)
  to check plan coverage against.
- **Output**: a chat-only report — an optional Requirement coverage table
  (COVERED / PARTIALLY COVERED / NOT COVERED / OUT OF SCOPE, only if a
  requirements doc was supplied), a Plan Completion table (`# | Plan Step |
  Files | Status`), a Gap Summary, and a Verdict line (COMPLETE / MOSTLY
  COMPLETE / INCOMPLETE).
- **Does not**: perform code-quality, architecture, or security review
  (completeness against the plan only); fix gaps found; treat an
  explicitly-deferred item as a gap; trust file/function names over
  reading the actual code.
- **Sources its rules are grounded in**:
  - `planner.md`'s Development Plan template and "ask if there's more than
    one candidate" convention
  - `TESTING.md` (to confirm a plan's "Tests to run" commands were actually
    run/passing) and the migration-file check under
    `server/src/db/migrations/` for schema-change steps
  - internal prior art (methodology only, stack specifics excluded):
    `server/clones/burnjohn/quick-blog/.claude/agents/plan-verifier.md`'s
    DONE/PARTIAL/NOT FOUND/DIVERGED classification and two-pass
    requirements/plan structure
  - the ASDLC.io "Quality Gate vs Review Gate" pattern and Addy Osmani's
    spec-vs-implementation checklist guidance, both used to scope this
    agent strictly to completeness, excluding quality commentary

## doc-writer

- **Responsibility**: turn a finished Development Plan (or other
  implementation material, e.g. an implementer's report) into project
  documentation under the correct `docs/` subfolder, describing what was
  built and why rather than restating the plan verbatim, adding a Mermaid
  diagram only when one actually clarifies a real mechanism.
- **Permissions**: `Read`/`Write`/`Edit`/`Glob`/`Grep`/`Bash` plus `Skill`
  (to invoke `mermaid-diagram` when a diagram is warranted); `Bash` is for
  read-only git-history lookups to ground the "why" — it does not run
  tests or migrations.
- **Input**: a finished, accepted Development Plan (and/or an implementer
  report), used after the plan has actually been implemented.
- **Output**: a new or updated file under the chosen `docs/` subfolder
  (`docs/adr/`, `docs/agent-prompts/`, `docs/agents/`, `docs/design/`,
  `docs/research/`, or `docs/specs/`), plus a chat report (path(s) written,
  subfolder chosen and why, whether a diagram was added and why/why not).
- **Does not**: perform code-quality, architecture, or security review;
  invent an ADR for a decision that wasn't actually deliberated; silently
  overwrite an existing doc file without noting what changed.
- **Sources its rules are grounded in**:
  - `docs/adr/0001-skill-trust-tiers.md` as the house style example for ADR
    format (Nygard: Title, Status, Context, Decision, Consequences; one
    decision per record)
  - the per-subfolder decision rule derived from this repo's existing
    `docs/` layout (`docs/adr/`, `docs/agent-prompts/`, `docs/agents/`,
    `docs/design/`, `docs/research/`, `docs/specs/`) — asks rather than
    forcing a placement if none fit
  - the Diátaxis documentation framework (Tutorials/How-to/Reference/
    Explanation), used to map this repo's `docs/` subfolders
  - docs-as-code AI-diagramming guidance (diagram only when it clarifies a
    real mechanism, never as decoration) and the `mermaid-diagram` skill
    for syntax only
