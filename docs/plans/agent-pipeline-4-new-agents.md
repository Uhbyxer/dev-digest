# Development Plan: Add test-writer, architecture-reviewer, plan-verifier, doc-writer agents

## Context
The dev-digest agent pipeline currently has three agents — `planner` →
`implementer`, plus a standalone `researcher` — defined under
`.claude/agents/` and indexed in `.claude/agents/README.md`. This plan adds
four new subagent definitions to round out the pipeline: `test-writer`
(writes tests using the project's own testing skills/conventions, not
generic testing knowledge), `architecture-reviewer` (read-only onion-
architecture boundary check with file:line evidence), `plan-verifier`
(checklist-style verification of a finished implementation against a
Development Plan), and `doc-writer` (turns a finished plan into project
documentation, with diagrams only where they clarify a real mechanism).
This is a meta-plan: its deliverables are `.md` agent-definition files, not
application code.

## Architectural constraints
None of `reviewer-core`/`server`/`client`/`e2e` module boundaries apply —
this plan produces Claude Code subagent definitions under `.claude/agents/`
only. The only "boundary" that matters here is scope discipline between the
four new agents themselves and the three existing ones (each agent's
description must state clearly what it does NOT do, matching this repo's
existing negative-scoping convention in `planner.md`/`implementer.md`/
`researcher.md`), and the constraint that `architecture-reviewer` must be
genuinely read-only (no `Edit`/`Write` in its `tools:` frontmatter — a
frontmatter omission is enough, Claude Code raises no error for an absent
tool, so this must be checked by inspection, not assumed).

## ADR conflicts
None. `docs/adr/0001-skill-trust-tiers.md` is about skill trust tiers, not
agent definitions, and none of the four new agents contradicts it (all four
invoke existing skills via the `Skill` tool or by reading `SKILL.md`
directly, per the same pattern `implementer.md` already uses).

## Steps

### 1. Create `test-writer` agent — files: `.claude/agents/test-writer.md`
- Files: `.claude/agents/test-writer.md` (new)
- Skill(s) to apply: none (this step writes an agent definition, not code —
  the skill names below are what the *new agent itself* will reference in
  its own body)
- What: Add a new agent file matching the existing frontmatter shape
  (`name`, `description`, `tools`, optionally `skills`, `model`). Concrete
  frontmatter to use:
  - `name: test-writer`
  - `description:` state it writes unit/integration tests for both UI
    (`client/`) and backend (`server/`) code, and for `reviewer-core/`,
    detecting which module a target file belongs to and applying that
    module's own project skill/testing conventions rather than generic
    testing knowledge; state "Use when the user asks to add/write tests for
    a component, route, adapter, or reviewer-core module, or when the
    implementer/planner flags missing test coverage." Negative scope: "Does
    NOT implement application features and does NOT perform architectural or
    security review — writes tests only, against code that already exists."
  - `tools: Read, Write, Edit, Bash, Glob, Grep, Skill` (needs write access
    to create/extend test files, and `Skill` to invoke `react-testing-library`
    / `fastify-best-practices` / `zod` / `typescript-expert` /
    `engineering-insights`; matches `implementer.md`'s tool set since it also
    edits+runs tests).
  - `skills: engineering-insights` (preloaded, same as `implementer.md`, so
    it inherits each touched module's `INSIGHTS.md` conventions without
    re-deriving them).
  - `model: sonnet` — test authoring requires the same judgment level as
    implementation (matching `implementer`), not the throwaway/mechanical
    tier that would justify `haiku`.
  - System-prompt body outline (sections to write, mirroring the depth of
    `implementer.md`):
    - Opening framing: writes tests for existing code, does not implement
      features.
    - "Before writing tests" — read the target file(s) first; read the
      relevant module's `INSIGHTS.md`; check for existing test files next to
      the target (extend, don't overwrite) per this repo's colocation
      convention (see `TESTING.md`'s suite map).
    - "Detect the module and skill" — explicit per-module mapping table:
      - `client/**` → invoke `react-testing-library` skill (React Testing
        Library + jsdom conventions, per `TESTING.md`'s "client" suite row);
        also invoke `react-best-practices` to understand the component
        being tested if unclear.
      - `server/**` → invoke `fastify-best-practices` for route/adapter test
        conventions; follow `TESTING.md`'s unit vs `*.it.test.ts` integration
        split verbatim (unit tests exclude Docker/Postgres deps and use
        `server/src/adapters/mocks.ts`; integration tests use
        `test/helpers/pg.ts` and must be named `*.it.test.ts`). No dedicated
        backend-testing skill exists in this repo — state that explicitly
        rather than inventing one.
      - `reviewer-core/**` → plain Vitest/TS, no framework skill exists;
        follow the "pure engine, no DB/GitHub/FS" testing description in
        `TESTING.md`.
      - Any module: invoke `zod` when writing/asserting typed fixtures or
        request/response schemas, and `typescript-expert` when the fixture
        or mock needs non-trivial typing.
    - "Coverage strategy" — few, meaningful tests, not exhaustive coverage,
      explicitly matching `TESTING.md`'s "typological, not exhaustive"
      philosophy (one happy path + the edge that actually matters), not a
      generic "aim for X% coverage" rule.
    - "Running tests" — per-module command from `TESTING.md` (`cd client &&
      pnpm test`, `cd server && pnpm exec vitest run --exclude
      '**/*.it.test.ts'` or `.it.test` for integration, `cd reviewer-core &&
      npm test`); fix failures the new tests caused, don't touch unrelated
      failing tests.
    - "What you must not do" — do not modify the source file under test to
      make a test pass (flag a suspected bug instead of silently "fixing"
      production code as a side effect); do not touch `server/clones/**`; do
      not perform architectural or security review.
    - Closing report format (short markdown: files added/extended, skills
      applied per file, tests run + pass/fail, anything flagged for other
      agents) — mirror `implementer.md`'s report block structure.

### 2. Create `architecture-reviewer` agent — files: `.claude/agents/architecture-reviewer.md`
- Files: `.claude/agents/architecture-reviewer.md` (new)
- Skill(s) to apply: none for this plan step itself (agent-definition
  authoring); the new agent's body will reference `onion-architecture`.
- What: Add a new, strictly read-only agent. Concrete frontmatter:
  - `name: architecture-reviewer`
  - `description:` state it checks onion-architecture boundaries between
    `reviewer-core` (pure domain) and `server` (DB/fs/network/Fastify/
    Drizzle), flags `server/clones/**` touched as source, and flags direct
    DB/fs/network access inside `reviewer-core/src/**`; every finding must
    cite a `file:line` and the exact violating import/dependency, never
    generic advice; "Use proactively after implementation changes touch
    `reviewer-core/src/**`, `server/src/adapters/**`,
    `server/src/platform/container.ts`, or `server/src/db/**`, or when asked
    to check architecture/boundaries." Negative scope: "Read-only — makes NO
    code changes (no Edit/Write tool) and does not evaluate code quality,
    style, test coverage, or security; those are separate concerns owned by
    other agents/skills (`pr-self-review`, `security`)."
  - `tools: Read, Grep, Glob, Bash` — deliberately omits `Edit`, `Write`, and
    `Skill`; read the `onion-architecture` `SKILL.md` directly via `Read`
    rather than invoking it as a `Skill` tool call, so the agent never has an
    execution path that could be mistaken for a mutating tool. `Bash` is
    included only for read-only investigation (`git log`/`git show`/`grep`
    pipelines), matching `researcher.md`'s read-only `Bash` usage — the
    system prompt must explicitly forbid any mutating bash command.
  - `model: sonnet` — boundary violations require judgment about what counts
    as "infrastructure" (e.g. distinguishing a type-only import from a
    runtime dependency), not mechanical pattern matching, so `haiku` is not
    proposed; `opus` is not justified either since this is a bounded,
    well-specified check, not open-ended security judgment.
  - System-prompt body outline:
    - Opening framing: read-only architecture-boundary reviewer; never
      writes code; every finding needs a concrete citation.
    - "Before reviewing" — read
      `.claude/skills/onion-architecture/SKILL.md` in full (and
      `docs/research/onion-architecture.md` if the finding needs the
      underlying rationale) to get the exact trigger paths and rule
      statement; identify the diff or file set in scope (via `git diff`/
      `git log` or the files named in the task).
    - "Checks to run" — enumerated, each tied to a concrete detection method:
      1. `reviewer-core/src/**` importing anything from `server/`, a DB
         driver, `drizzle-orm`, `fastify`, `fs`, `node:fs`, `undici`/`fetch`,
         or any concrete infra SDK — detect via `grep -n "^import"` /
         `Grep` across `reviewer-core/src/**` cross-referenced against a
         known infra-package list.
      2. Anything reviewer-core needs from outside must arrive through a
         port/interface with the concrete adapter living in
         `server/src/adapters/**` — flag a reviewer-core file that expects
         an external capability (DB row, file read, network call) without
         an injected interface.
      3. `server/src/modules/*/service.ts` importing `drizzle-orm` or a DB
         driver directly instead of a repository/adapter interface (per the
         skill's stated rule that only `container.ts` and adapter
         implementations may import concrete infra).
      4. Any diff touching `server/clones/**` as if it were source (not
         generated runtime data) — flag per `CLAUDE.md`'s do-not-touch list.
    - "Evidence bar" — every finding MUST include the file path, line
      number, and the exact quoted import/dependency line; no finding may
      rest on a file name or folder location alone (grounded in the
      Anthropic Claude Code Review "verification bar" practice already
      researched). If a suspected violation can't be pinned to a concrete
      line, report it under "Needs follow-up", not as a finding.
    - Output format: a findings table — `Severity | File:Line | Violating
      import/dependency | Rule violated` — plus a short summary count; end
      with an explicit "No boundary violations found" statement when clean,
      rather than omitting the section.
    - "What you must not do" — do not propose or make the fix; do not
      comment on naming/style/tests/security; do not run any mutating git or
      filesystem command.

### 3. Create `plan-verifier` agent — files: `.claude/agents/plan-verifier.md`
- Files: `.claude/agents/plan-verifier.md` (new)
- Skill(s) to apply: none for this authoring step; internal prior art at
  `server/clones/burnjohn/quick-blog/.claude/agents/plan-verifier.md` was
  read for verification-methodology structure only (Express/MongoDB/PRD
  specifics from that file must NOT be copied — this repo has no "PRD" input
  concept, only a Development Plan and optionally another requirements doc).
- What: Add a new, read-only verification agent adapted from the prior-art
  DONE/PARTIAL/NOT FOUND/DIVERGED methodology to dev-digest's own plan
  format (`docs/plans/<slug>.md`, per `planner.md`'s template). Concrete
  frontmatter:
  - `name: plan-verifier`
  - `description:` state it cross-checks finished code in this repo against
    every step of a given Development Plan (and any additional requirements
    doc supplied), classifying each step DONE/PARTIAL/NOT FOUND/DIVERGED
    with concrete file evidence; "Use after the implementer reports a plan
    as complete, to confirm nothing was missed or diverged before
    considering the work finished." Negative scope, stated explicitly per
    the user's requirement: "Does NOT perform code-quality, architecture, or
    security review — verifies completeness against the plan only; quality
    is `pr-self-review`'s/`security`'s job, architecture is
    `architecture-reviewer`'s job."
  - `tools: Read, Glob, Grep, Bash` — read-only, no `Edit`/`Write` (it is a
    checker, not a fixer, matching the prior-art agent's own tool set and
    this repo's `researcher.md` read-only pattern).
  - `model: sonnet` — classifying PARTIAL vs DIVERGED requires reading and
    comparing actual code semantics against plan prose, not mechanical
    pattern matching.
  - System-prompt body outline:
    - Opening framing: skeptical completeness verifier; confirms every plan
      step is actually built; does not judge quality.
    - "Inputs" — the plan file path (required; ask for it if not given, do
      not guess which file under `docs/plans/` is meant if more than one is
      a plausible candidate — mirrors `planner.md`'s "ask if there's more
      than one candidate" convention) and, optionally, another requirements
      doc (e.g. a linked GitHub issue or a `docs/specs/*.md` file) to check
      plan coverage against, adapted from the prior-art's optional "PRD"
      pass but renamed to this repo's own vocabulary.
    - "Two passes" (only run pass 1 if a requirements doc was supplied):
      1. Requirements → Plan coverage: extract each distinct requirement,
         classify COVERED / PARTIALLY COVERED / NOT COVERED / OUT OF SCOPE
         (explicitly deferred in the plan).
      2. Plan → Code coverage (always run): extract every plan step, search
         the actual files named in that step, read them, classify DONE /
         PARTIAL / NOT FOUND / DIVERGED.
    - "Incomplete-implementation signals" — adapt the prior-art's list to
      this repo's stack: `TODO`/`FIXME`/`HACK` comments, stubbed return
      values, a step that named a skill to apply but the resulting code
      clearly doesn't follow it (e.g. plan said "apply `zod`" but no schema
      exists), a schema-change step where `pnpm db:migrate` was never run
      (check for a corresponding migration file under
      `server/src/db/migrations/` or equivalent), a "Tests to run" command
      from the plan that hasn't actually been run/passing.
    - "Cross-reference" (only with a requirements doc) — plan steps with no
      traceable requirement (scope creep, noted not flagged as wrong) and
      implemented-but-undocumented work (noted, not flagged).
    - Output format: adapt the prior-art's two tables (Requirement coverage
      table if applicable; Plan Completion table: `# | Plan Step | Files |
      Status`) plus a Gap Summary and a Verdict line (COMPLETE / MOSTLY
      COMPLETE / INCOMPLETE), keeping the prior-art's structure but stripped
      of Express/MongoDB specifics.
    - "What you must not do" — do not fix gaps found; do not comment on
      architecture or security; do not treat an explicitly-deferred item as
      a gap; when in doubt, read the code rather than trusting file/function
      names.

### 4. Create `doc-writer` agent — files: `.claude/agents/doc-writer.md`
- Files: `.claude/agents/doc-writer.md` (new)
- Skill(s) to apply: none for this authoring step; the new agent's body will
  reference `mermaid-diagram`.
- What: Add a new documentation-authoring agent. Concrete frontmatter:
  - `name: doc-writer`
  - `description:` state it turns a finished Development Plan (or other
    implementation material, e.g. an implementer's report) into project
    documentation under the correct `docs/` subfolder, describing what was
    built and why rather than restating the plan verbatim, and adding a
    Mermaid diagram only when one actually clarifies a real mechanism;
    "Use after a plan has been implemented and the user wants it
    documented, or asks for an ADR/design note/spec to be written or
    updated." Negative scope: "Does NOT write ADRs as a substitute for an
    actual architectural decision discussion — an ADR entry describes a
    decision already made, not one this agent invents — and does NOT
    perform code review of any kind."
  - `tools: Read, Write, Edit, Glob, Grep, Bash, Skill` — needs `Write`/
    `Edit` since its output is doc files (unlike planner, whose only Write
    use is the plan itself, this agent's entire job is writing files);
    `Skill` to invoke `mermaid-diagram` when a diagram is warranted; `Bash`
    for read-only git history lookups to ground "why" (e.g. `git log
    --oneline` on the touched files) — the prompt must state this Bash
    usage is investigative only, doc-writer does not run tests or migrations.
  - `model: sonnet` — deciding *where* a doc belongs and whether a diagram
    earns its place is a judgment call the researched material explicitly
    flags as uncovered by any skill, so this is not mechanical work.
  - System-prompt body outline:
    - Opening framing: turns finished work into documentation; describes
      what was built and why (not a restatement of the plan); references
      the motivating plan/PR to reduce staleness (state as a known
      limitation: no automated staleness tooling exists in this repo).
    - "Before writing" — read the source Development Plan (and/or
      implementer report) fully; read the actual changed code, don't take
      the plan's intent on faith, since the plan describes intended not
      necessarily final behavior; read `docs/adr/0001-skill-trust-tiers.md`
      as the house style example for ADRs, and skim one existing file in
      each candidate subfolder to match tone/format.
    - "Choosing the right docs/ subfolder" — explicit decision rule per
      folder, since there's no single default:
      - `docs/adr/` — only for an architecturally significant decision that
        was actually made (not proposed) during the work; Nygard format
        strictly: Title, Status, Context, Decision, Consequences; one
        decision per record; check `docs/adr/0001-skill-trust-tiers.md` for
        exact heading/numbering convention before adding
        `NNNN-slug.md`.
      - `docs/agent-prompts/` — only for reviewer LLM prompt template
        documentation (not relevant to most tasks; narrow, specific
        folder).
      - `docs/agents/` — only for docs about this agent pipeline itself
        (e.g. if a plan changes agent behavior/conventions, not application
        features).
      - `docs/design/` — mockups/visual design artifacts and the narrative
        around them (this repo currently stores images here, e.g.
        `skills-lab-and-agent-editor-mockup.png`); use for UI/UX rationale,
        not implementation detail.
      - `docs/research/` — background/primary-source research material
        (e.g. `onion-architecture.md`, `react-nextjs-architecture.md`);
        use only when writing up externally-sourced grounding material, not
        for describing this repo's own feature.
      - `docs/specs/` — reference-style description of a feature's shape
        (e.g. `conventions-feature.md`, `agents-md-compat.md`); this is the
        default landing place for "what was built" write-ups of a shipped
        feature.
      - State explicitly: if none fit cleanly, say so and ask rather than
        forcing a placement.
    - "When to add a diagram" — only when a flow/mechanism is genuinely
      hard to convey in prose (e.g. multi-step async flow, port/adapter
      wiring, state machine); invoke the `mermaid-diagram` skill for syntax;
      never add a diagram as decoration for a simple linear description.
    - "Writing the doc" — lead with what was built and why (extract
      rationale from the plan's Context section and any ADR conflicts noted
      there, plus a fresh read of the code for anything the plan didn't
      anticipate); link back to the source plan file and, if known, the
      PR/commit that implemented it.
    - "What you must not do" — do not fold in code-quality, architecture, or
      security review; do not invent an ADR for a decision that wasn't
      actually deliberated; do not silently overwrite an existing doc file
      without noting what changed.
    - Closing report format: path(s) written, subfolder chosen and why,
      whether a diagram was added and why/why not.

### 5. Update the agent index — files: `.claude/agents/README.md`
- Files: `.claude/agents/README.md`
- Skill(s) to apply: none (documentation-index update, not code).
- What: Extend the existing README to include all four new agents, matching
  its current exact format:
  - Update the intro line ("Three-agent pipeline... plus a standalone
    researcher") to describe the now seven-agent set and how the four new
    agents relate to the existing two-stage pipeline (e.g. "test-writer and
    plan-verifier run after implementer; architecture-reviewer runs
    read-only checks after implementation; doc-writer runs after a plan is
    implemented and accepted").
  - Add four new rows to the top summary table (`| Agent | File | Model |
    Tools | Role |`), in the same column order and terseness as the existing
    three rows.
  - Add four new `##`-level sections (one per new agent), each following the
    existing five-bullet structure exactly: **Responsibility**,
    **Permissions**, **Input**, **Output**, **Does not**, **Sources its
    rules are grounded in** — populate each from the frontmatter/body
    decided in Steps 1-4 above (e.g. `architecture-reviewer`'s "Permissions"
    bullet must explicitly say "No Edit/Write — read-only", mirroring how
    `researcher`'s section already calls out "No Write/Edit").

## Tests to run
This plan produces `.md` agent-definition files, not application code — no
`pnpm`/`vitest`/`npm test` command applies. Sanity-check each new agent
definition instead:
- `test-writer`: invoke it once against a trivial existing file in each of
  `client/`, `server/`, and `reviewer-core/`; confirm it reads the right
  skill per module (no generic testing advice) and writes/extends a test
  file colocated with the source, per `TESTING.md`'s suite map.
- `architecture-reviewer`: invoke it once on a small diff or file set;
  confirm it produces file:line-cited findings (or an explicit "no
  violations" statement) and that it makes zero Write/Edit calls (its
  `tools:` frontmatter has no such tool, so any attempt should fail/absent
  itself — confirm no tool-not-found workaround is attempted).
  invoke it on a diff that intentionally imports `drizzle-orm` inside
  `reviewer-core/src/**` (a throwaway scratch file, deleted after the check)
  to confirm it actually flags the violation rather than always reporting
  clean.
- `plan-verifier`: run it against this very plan once Steps 1-5 are
  implemented; confirm each of the five steps above gets a
  DONE/PARTIAL/NOT FOUND/DIVERGED classification with a file citation, and
  that it does not comment on code quality/architecture.
- `doc-writer`: run it once against a small already-implemented plan (e.g. a
  past entry under `docs/plans/`) and confirm it picks a `docs/` subfolder
  with stated reasoning, and only proposes a diagram when there's a genuine
  multi-step mechanism to show.
- After all five files exist, re-read `.claude/agents/README.md` and confirm
  its table + sections stay consistent with each agent's actual frontmatter
  (a manual diff-by-eye check, not an automated test).

## Out of scope
- Architectural review of the resulting agent definitions themselves
  (separate agent/pass).
- Security review of the resulting agent definitions (separate `security`
  skill pass) — note only: none of the four new agents are given
  credentials, network egress beyond `Bash`'s existing shell access, or
  write access outside this repo, but a dedicated security pass is still a
  separate concern from this plan.
- Writing the actual four `.claude/agents/*.md` files and the
  `.claude/agents/README.md` update — that is the implementer's job,
  executing this plan.

## Sources
- Anthropic subagent docs — `code.claude.com/docs/en/sub-agents` and
  `code.claude.com/docs/en/agent-sdk/subagents`: `description` is the sole
  auto-delegation signal; short descriptions with behavioral detail pushed
  into the system-prompt body; `tools:` as a least-privilege allowlist
  (omission causes no error); `model:` guidance (cheaper model for
  high-volume/mechanical work, stronger for high-stakes judgment, worked
  example opus-for-security vs sonnet-for-balanced-review); a subagent's
  context contains only its own system prompt plus what's passed in the
  delegation message.
- ArchUnit onion-architecture rule literature (directional dependency rule:
  adapters may depend on domain, never the reverse) — used to ground
  `architecture-reviewer`'s grep/import-graph-based detection approach.
- Anthropic's Claude Code Review product documentation — the "verification
  bar" requiring a `file:line` citation for every behavior claim (not an
  inference from naming), and single-purpose findings (architecture findings
  not diluted with unrelated style commentary) — used to shape
  `architecture-reviewer`'s evidence bar and output format.
- ASDLC.io adversarial-review pattern — "Quality Gate vs Review Gate":
  deterministic completeness-against-checklist as a distinct mode from
  probabilistic quality judgment — used to scope `plan-verifier` strictly to
  completeness, excluding quality commentary.
- Addy Osmani, spec-writing/post-implementation guidance — compare
  implementation against the spec and produce an explicit
  satisfied/missing checklist as a distinct step from code review — used to
  ground `plan-verifier`'s DONE/PARTIAL/NOT FOUND/DIVERGED classification
  step.
- Diátaxis documentation framework (Tutorials/How-to/Reference/Explanation)
  — used to map this repo's `docs/` subfolders and inform `doc-writer`'s
  subfolder-choice decision rule.
- Docs-as-code AI-diagramming guidance — diagrams should be drafted from a
  described flow and included only when they clarify a real mechanism, not
  as decoration — used to scope `doc-writer`'s Mermaid-diagram judgment
  call, which the plan notes is not covered by the `mermaid-diagram` skill
  itself (that skill covers syntax only).
- Internal prior art (read directly, methodology only, stack specifics
  excluded): `server/clones/burnjohn/quick-blog/.claude/agents/plan-verifier.md`
  (DONE/PARTIAL/NOT FOUND/DIVERGED classification, two-pass
  requirements/plan structure, output tables) and
  `server/clones/burnjohn/quick-blog/.claude/agents/test-writer.md`
  (module-detection-then-skill-read workflow, coverage-strategy framing) —
  both from an unrelated Express/MongoDB/Jest project; only the
  verification/testing methodology shape was reused, not any stack-specific
  detail.
