# Development Plan: Multi-Agent Review (Worktree A)

## Context
Let a reviewer fan a PR out to a chosen set of agents in parallel, group the fan-out into one persistent `multi_agent_run`, and compare results in a Columns/Tabs page with a deterministic "Where agents disagree" block, live per-agent status, trace links and a pre-run estimate. Spec: `docs/specs/2026-07-08-multi-agent-review.md` (SPEC-2026-07-08-multi-agent-review, AC-1..AC-33). Mockups: `docs/design/multi-agent-review-*.png`, `docs/design/pr-page-*.png`. Modules: server, client (reviewer-core and `ci/`, `agent-runner/` untouched).

## Execution mode
**Multi-agent** (default chosen by the caller; the plan spans 2 modules and more than 6 steps). Flow: implementer → test-writer → plan-verifier → architecture-reviewer → doc-writer. Implementer steps split by module: steps 1-6 = server, steps 7-14 = client. Server steps 1-6 finish first (client depends on the contracts and endpoints). Test-writer owns all `*.it.test.ts` (Docker) and extra coverage.

## Decisions from clarification
- Spec open questions are resolved (D-1..D-4, OQ-4..OQ-12); no new questions asked.
- Compose review is out of scope: the "Compose review" button is not added or changed.
- Teaser = `agents.description` (omit if empty). Label is "parallel fan-out" (never "worktrees").
- Only the "Multi-Agent Review" item is added to the nav, in a new GLOBAL group.
- Only Accept/Dismiss are functional; Learn / Turn into eval case / Reply to author are disabled placeholders (AC-19).
- Fan-out becomes parallel (`Promise.allSettled`, failure-isolated) in `run-executor`.
- Planner decisions within the spec: `multi_agent_run_id` nullable FK is added to `agent_runs` (the spec requires the link; a migration is needed). Existing `POST /pulls/:id/review` keeps working (no multi run created) so other callers are unaffected.

## Architectural constraints
- onion-architecture: routes → service → `repository/*.repo.ts`. Services never import `drizzle-orm` or query `t.<table>` directly (server/INSIGHTS.md). Conflict computation is a pure function (no DB, no LLM, no embeddings) kept in the reviews module.
- Update BOTH `completeAgentRun` declarations if its params change (server/INSIGHTS.md: `repository.ts` vs `repository/run.repo.ts`). Prefer not to change it.
- Vendored contracts: edit `server/src/vendor/shared/contracts/*.ts` and `cp` over the client mirror (client/INSIGHTS.md).
- Server does not migrate on boot: generate the migration and run `pnpm db:migrate`. Do not edit applied migrations.
- AC-24: do not touch reviewer-core grounding / `wrapUntrusted` / injection guard. Teaser/summary strings render as plain text.
- Any route/service test reaching an LLM must inject `overrides.llm` with `MockLLMProvider`.
- Client: no `@testing-library/user-event` (use `fireEvent`); all strings through `next-intl` (`client/messages/en/*.json`); jsdom lacks `scrollIntoView`.
- Do not touch `server/clones/**`, `ci/`, `agent-runner/`.

## ADR conflicts
None. (ADR-0001..0004 cover skills trust, linked docs, onboarding, PR brief; none touch this area.)

## Steps

### 1. Shared contracts — module: server (then mirrored to client)
- Files: `server/src/vendor/shared/contracts/platform.ts` (or `observability.ts`), `server/src/vendor/shared/contracts/knowledge.ts`, mirrored to `client/src/vendor/shared/contracts/*`.
- Skill(s) to apply: zod, typescript-expert
- What: Add `MultiAgentRunRequest = { agentIds: string[] (min 1) }` and `MultiAgentRunStarted = { multi_run_id, pr_id, runs: { run_id, agent_id, agent_name }[] }`. Extend the agents-list item with `est_duration_ms: number|null`, `est_cost_usd: number|null`, `has_history: boolean` (optional on base `Agent` so create/update payloads are unaffected, or a dedicated `AgentWithEstimate` extending `Agent`). Reuse existing `MultiAgentRun`, `AgentColumn`, `Conflict`, `ConflictTake` as-is. Verify exported from the shared barrel. `cp` server files over the client copies. AC-8, AC-10, AC-12.

### 2. Schema + migration — module: server
- Files: `server/src/db/schema/runs.ts`, new `server/src/db/migrations/0017_*.sql` (+ meta).
- Skill(s) to apply: drizzle-orm-patterns, postgresql-table-design
- What: Add nullable `multi_agent_run_id uuid references multi_agent_runs(id) on delete cascade` plus an index to `agentRuns`. Leave `multi_agent_runs` columns as is (`ranAt` is already there). Generate migration with drizzle-kit, run `cd server && pnpm db:migrate`. AC-10.

### 3. Repositories — module: server
- Files: `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository.ts` (facade), `server/src/modules/agents/repository.ts`.
- Skill(s) to apply: drizzle-orm-patterns, typescript-expert
- What: Named functions: `createMultiAgentRun(db, workspaceId, prId)`; `createAgentRun` accepts optional `multiAgentRunId`; `getMultiAgentRun(db, workspaceId, prId, multiRunId?)` (latest for PR when id omitted, OQ-10); `listRunsForMultiRun` joined with agent name/provider/model/color source, status, duration, cost, score, error; findings for those runs (via reviews/findings). In agents repo: `estimatesByAgent(db, workspaceId)` — GROUP BY agent over `agent_runs` with `status='done'` returning AVG `durationMs`, AVG `costUsd`, count (AC-8, AC-9). AC-10, AC-12.

### 4. Parallel fan-out in the executor — module: server
- Files: `server/src/modules/reviews/run-executor.ts`.
- Skill(s) to apply: typescript-expert, engineering-insights
- What: Replace the sequential `for…of await` over `jobs` with `Promise.allSettled(jobs.map(...))`, keeping per-agent logging and the existing per-agent catch (`runOneAgent` already persists failure/cancel). Shared diff/intent pre-work stays once. Do not change reviewer-core calls. AC-11, AC-24.

### 5. Conflict computation (pure) + multi-agent service — module: server
- Files: new `server/src/modules/reviews/conflicts.ts`, `server/src/modules/reviews/service.ts`.
- Skill(s) to apply: typescript-expert, zod
- What: `computeConflicts(columns)` — deterministic: group findings across agents by identical file AND overlapping `[start_line,end_line]` ranges (transitive merge via sorted sweep per file); each group → `Conflict{file,line,title,takes}` with one take per ran agent, `verdict` = that agent's highest severity in the group or `'ignored'` ("did not flag"), `note` short. Compute only over `done` runs. Service: `startMultiAgentRun(workspaceId, prId, agentIds, log)` — validate agents are enabled and in workspace, create the multi run, create N agent_runs linked, kick off `executeRuns` in the background (reuse `resolveTargets`/`runReview` queueing path; same precondition as the single review, OQ-6), return `MultiAgentRunStarted`. `getMultiAgentView(workspaceId, prId, multiRunId?)` → `MultiAgentRun` (columns ordered, totals: `total_duration_ms` = max, `total_cost_usd` = sum, `agent_count`; running columns have no score/findings; `status` mapped to done|failed|running, cancelled → failed). AC-10, AC-12, AC-20..AC-23, AC-31, AC-32.

### 6. Routes + agents list estimates — module: server
- Files: `server/src/modules/reviews/routes.ts`, `server/src/modules/agents/service.ts`, `server/src/modules/agents/routes.ts`.
- Skill(s) to apply: fastify-best-practices, zod
- What: `POST /pulls/:id/multi-agent-run` (body `MultiAgentRunRequest`, rate limit 10/min like the single trigger) and `GET /pulls/:id/multi-agent` (optional query `run=<multiRunId>`, 404 via `NotFoundError` if none). Extend `AgentsService.list` to merge estimates (null + `has_history:false` when no done runs). Update the route doc comment header. AC-3, AC-8, AC-9, AC-10, AC-12, AC-33.

### 7. Shared RunTraceDrawer + finding-card building blocks — module: client
- Files: move `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer` (and `FindingCard` if reused) to `client/src/components/` (update imports and tests in the PR page); no behaviour change.
- Skill(s) to apply: react-nextjs-architecture, typescript-expert
- What: Structural move only so the new page can reuse the same drawer via `?trace=<runId>` (AC-14, AC-14a).

### 8. API hooks — module: client
- Files: new `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/agents.ts`, `client/src/lib/types.ts`.
- Skill(s) to apply: react-best-practices, typescript-expert
- What: `useStartMultiAgentRun(prId)` (mutation), `useMultiAgentRun(prId, multiRunId)` (polls ~4s while any column `running`, stops when settled; keeps SSE/active-runs fallback per spec edge cases), agents hook returns estimate fields; `useFindingAction` reused for accept/dismiss with query invalidation (AC-18). AC-13, AC-18.

### 9. Estimate + presentation helpers — module: client
- Files: new `client/src/app/multi-agent-review/helpers.ts` (+ `constants.ts`).
- Skill(s) to apply: typescript-expert
- What: `summarizeEstimate(selected)` (time = max, cost = sum, skip `has_history:false`, no request); `scoreColor` (≥70 green, 50-69 orange, <50 red) and `confidenceColor` (≥90 green, 50-89 orange, <50 red) (AC-29); agent accent palette/icon assignment (index-based mapping, no DB column, OQ-11); severity sort (CRITICAL→WARNING→SUGGESTION, then file/line) (AC-26); duration/cost formatters (reuse `lib/format.ts`). AC-7, AC-9, AC-26, AC-29.

### 10. Agent picker on the PR page — module: client
- Files: replace `.../_components/RunReviewDropdown/*` with `AgentPicker` (keep folder pattern: component, constants, styles, index, test), update `PrDetailHeader`.
- Skill(s) to apply: react-best-practices, react-testing-library
- What: "Run Review ▾" opens "Pick agents to run" with Clear, checkbox rows (name + `~Ns` estimate or "—"), all enabled agents pre-checked (OQ-4), "Run multi-agent review (N)" disabled at 0, summary line, "Configure agents…" → `/agents`, empty state link to `/agents` when none enabled, merged/closed `warnMerged` carried over. On confirm: POST multi-agent run then navigate to the result page by multi-run id. Do not add the Compose review button. AC-1, AC-2, AC-3, AC-7, AC-9.

### 11. Nav item + routes + Configure run — module: client
- Files: `client/src/vendor/ui/nav.ts` (new GLOBAL group with "Multi-Agent Review"; check where nav is consumed and the `:repoId` handling so a global href works), `client/src/app/multi-agent-review/page.tsx` (Configure run), `.../_components/ConfigureRun/*`, `client/messages/en/multiAgent.json` (+ register in the i18n request loader).
- Skill(s) to apply: next-best-practices, react-nextjs-architecture, react-best-practices
- What: Two-step form: PR dropdown (`#n · title`, empty state "No pull requests yet", pre-select from `?pr=` context), agent cards step disabled with empty-state prompt until a PR is chosen, Select all, colour-tinted cards, teaser from `description`, `time · $cost`, run button + "≈ Xs · $Y · parallel fan-out" summary. Starts a run and navigates to results. AC-4, AC-5, AC-6, AC-7, AC-9. Only this one nav item is added.

### 12. Shared results building blocks — module: client
- Files: `client/src/app/multi-agent-review/_components/{AgentSummary,FindingRow,ScoreRing,DisagreeBlock}/*`.
- Skill(s) to apply: react-best-practices, react-nextjs-architecture
- What: One implementation each, reused by both layouts (AC-16): per-agent summary/header (accent, score ring or running indicator or failed marker, time/cost, View trace button setting `?trace=<runId>` and passing `running` to drawer), finding row (severity icon/left border, truncation with `title`, Accepted/Dismissed state, accordion expansion in Tabs with category chip, confidence badge, rationale, Suggested fix, Accept/Dismiss functional, Learn / Turn into eval case / Reply to author disabled placeholders), DisagreeBlock (rows per group, per-agent verdict badge incl. "did not flag", "Show only conflicts" switch off by default filtering unanimous groups, "waiting for N agents" while running, hidden when zero findings). AC-14, AC-15, AC-17..AC-23, AC-28..AC-32; accessible labels (WCAG AA).

### 13. Results page: Columns and Tabs — module: client
- Files: `client/src/app/multi-agent-review/[multiRunId]/page.tsx` plus `_components/{ResultsHeader,ColumnsView,TabsView}/*`; mount the shared `RunTraceDrawer` driven by `?trace=`.
- Skill(s) to apply: next-best-practices, react-nextjs-architecture, react-best-practices
- What: Header (breadcrumb, title, "N selected agents · parallel", Configure run button, Columns/Tabs segmented control default Columns, totals line from `MultiAgentRun`), Columns (min width 280px, horizontal scroll row, header and disagree block do not scroll, coloured top border, footer View trace + "N findings"), Tabs (tab strip with score badge / failed marker, summary card, accordion, one expanded at a time, no re-fetch on tab switch). Failed columns show reason without blocking siblings; per-column "No findings" empty state. Route survives reload. AC-12..AC-16, AC-25..AC-27, AC-31..AC-33.

### 14. i18n + a11y pass — module: client
- Files: `client/messages/en/multiAgent.json`, components above.
- Skill(s) to apply: next-best-practices, react-best-practices
- What: Ensure every user-facing string uses `useTranslations()`; keyboard operability and labels for checkboxes, segmented control, tabs, switch.

## Tests to run
- Server: `cd server && pnpm exec vitest run src/modules/reviews/conflicts.test.ts` (pure grouping: overlap, disjoint, different file, did-not-flag, severity divergence), plus a no-DB route test for the two new endpoints with `MockLLMProvider`; `cd server && pnpm typecheck`.
- Client: `cd client && pnpm exec vitest run src/app/multi-agent-review src/app/repos` limited to touched component tests (AgentPicker, ConfigureRun, DisagreeBlock, helpers, moved RunTraceDrawer/FindingCard tests); `cd client && pnpm typecheck`.
- Migration applied locally: `cd server && pnpm db:migrate`.
- No `*.it.test.ts` for the implementer (test-writer/CI).

## Out of scope
- Writing or changing the spec (specreator)
- Compose review drawer and button; Memory / Agent Performance / CI Runs nav items; Per-Agent Stats; list of earlier multi-runs; persisting picker selection or view mode
- Functional Learn / Reply / Turn into eval case
- reviewer-core changes, `ci/`, `agent-runner/`
- Architectural review (separate agent)
- Security review (separate agent)
