# Development Plan: Project Context

## Context
Implements SPEC-01 (`docs/specs/project-context.md`, ACs AC-1..AC-36): discover Markdown "Context Documents" under `.devdigest/{specs,docs,insights}/` of a repo clone, browse/edit them on a Project Context page, attach/order them on Agents and Skills (Context tab), show approximate token counts, inject the effective set into the run prompt as an untrusted `## Project context` block, and store the injected snapshot in the run trace. Design mockups: `docs/design/project-context-*.png`. No GitHub issue linked.

Reuse: `assemblePrompt` already has a `specs?: string[]` part rendering `## Project context` (`reviewer-core/src/prompt.ts`); `PromptAssembly.specs` and `RunTrace.specs_read` already exist in `server/src/vendor/shared/contracts/trace.ts` (currently always `[]` in `run-executor.ts`); `agentSkills` gives the ordering pattern.

## Execution mode
multi-agent (default recommendation, pending user confirmation): implementer (server, reviewer-core, client steps in module order) -> test-writer -> plan-verifier -> architecture-reviewer -> doc-writer (adds Context Document / Attachment / Project context block terms to `CONTEXT.md`). Spans 3 modules and >6 steps.

## Decisions from clarification
Confirmed by user: 100 KB per-document limit (AC-24); 200 docs in <1 s target.
Assumed defaults (relayed to user, not yet answered; see final report Q1-Q6):
- Q1 Base-branch reading via `git show origin/<defaultBranch>:<path>` for run-time injection (AC-25), listing/edit via the working tree of the clone (AC-1, AC-4). Edits are NOT auto-committed: the page must show "local edit, not on base branch" caveat.
- Q2 Attachment table is a single `context_attachments` table with `owner_type` (`agent|skill`) + `owner_id`, `repo_id`, `path` (not FK to a doc row: documents are files), `order`.
- Q3 "Enabled skill" (AC-26/27) = globally enabled skill linked via `agent_skills` (no per-link enabled column exists).
- Q4 Skill order = `agent_skills.order`.
- Q5 CI/MCP runner path is out of scope unless it shares `run-executor.ts`.
- Q6 "Index status" in AC-8 = existing repo-intel index status endpoint, reused as is.

## Architectural constraints
- `reviewer-core` stays pure: block serialization (headings, delimiters, path labels, token estimate `ceil(chars/4)`, 8,000-token warn threshold, determinism) is a pure function in `reviewer-core/src/project-context/` (follow the `conventions/`/`intent/` split: `index.ts` barrel re-exported from `src/index.ts`; tests in flat `reviewer-core/test/`, per its INSIGHTS.md). No fs/DB there.
- All fs/git access via `GitClient` adapter (`server/src/vendor/shared/adapters.ts` + `server/src/adapters/git/simple-git.ts`) and a matching mock in `adapters/mocks.ts` (server INSIGHTS: mockable via container pattern).
- Services must not import drizzle/touch `t.<table>`; queries go in `repository/*.repo.ts` (server INSIGHTS).
- Path safety: all read/write/upload/delete confined to the three folders; reject traversal, symlinks escaping the folders (`realpath` check), non-`.md`, size >100 KB for attach. `server/clones/**` is only reached through the GitClient at runtime, never as source.
- Server does not migrate on boot: `pnpm db:migrate` step required.
- Client vendored contracts must be `cp`'d from server (client INSIGHTS) — never hand-ported.
- ADR-0001/0002: block is untrusted-delimited, no quarantine LLM step (spec states this explicitly; no contradiction).

## ADR conflicts
None. Note: the spec's "no LLM quarantine" is consistent with ADR-0002 scope (fetched URLs only).

## Steps

### 1. Shared contracts — module: server (then mirrored to client)
- Files: `server/src/vendor/shared/contracts/context.ts` (new; export from the contracts index), `server/src/vendor/shared/contracts/trace.ts`; `cp` to `client/src/vendor/shared/contracts/`.
- Skill(s): zod, typescript-expert
- What: `ContextDocType`, `ContextDocument` (path, type, size, tokens, missing?), `ContextAttachment`, request/response shapes (list, read, save with `expected_mtime/hash`, create, upload, delete, set attachments per owner, effective-set preview). Extend `RunTrace` with an optional `project_context` snapshot `{ text, entries:[{path, origin, tokens}], skipped:[{path, reason}] }`; keep `specs_read` populated with paths (AC-34, 35, 36). Keep new trace fields optional so old traces stay valid.

### 2. Pure project-context serializer — module: reviewer-core
- Files: `reviewer-core/src/project-context/{index,serialize,tokens}.ts`, export in `reviewer-core/src/index.ts`; tests `reviewer-core/test/project-context.test.ts`.
- Skill(s): typescript-expert, zod
- What: `estimateTokens`, `dedupeEffectiveSet` (agent order, then skills in order, first wins, AC-26), `serializeProjectContext(entries)` producing byte-identical text incl. path per doc and empty entry for empty docs, `EMPTY -> undefined` (AC-29), and set token total incl. heading/delimiters (AC-22), over-8k flag (AC-23). Feed result to existing `PromptParts.specs` (one string per doc, path in the `wrapUntrusted` label -- adjust `assemblePrompt` label from `spec-${i}` to a path-bearing label only if tests in `prompt.test.ts` are updated). AC-21, 22, 23, 26, 28, 29, and Determinism NFR.

### 3. Git adapter: list/read/write within allowed folders and at base ref — module: server
- Files: `server/src/vendor/shared/adapters.ts` (GitClient additions: `listFilesAtRef`, `readFileAtRef`), `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`, new `server/src/adapters/context-docs/` (fs adapter: `list`, `read`, `write`, `create`, `delete` with path-confinement helpers) plus container wiring in `server/src/platform/container.ts` (`overrides.contextDocs`).
- Skill(s): typescript-expert, fastify-best-practices (error mapping)
- What: working-tree listing/CRUD confined to the 3 folders (traversal, symlink, `.md`-only, refused everywhere); base-branch read via `git show origin/<default>:<path>` for run time. Returns size + mtime/hash for concurrent-edit warning. AC-1, 2, 3, 4, 5, 6, 7 (file part), 10, 11, 25; Edge cases (traversal/symlink).

### 4. DB schema + migration — module: server
- Files: `server/src/db/schema/context.ts` (add table; file exists) or new `context-attachments` export, `server/src/db/schema.ts`, generated `server/src/db/migrations/0014_*.sql`.
- Skill(s): drizzle-orm-patterns, postgresql-table-design
- What: `context_attachments(id, repo_id FK cascade, owner_type, owner_id, path, order, created_at)`, unique `(repo_id, owner_type, owner_id, path)` and unique `(repo_id, owner_type, owner_id, order)` (deferrable or rewrite orders transactionally), index on `(repo_id, path)`. Owner deletion cleanup handled in agents/skills repositories (polymorphic, no FK). Run `cd server && pnpm db:generate` then `pnpm db:migrate`. AC-13, 14.

### 5. `context` server module (routes/service/repository) — module: server
- Files: `server/src/modules/context/{routes,service,repository,helpers,constants}.ts` + repository files under `repository/`, register in `server/src/modules/index.ts`.
- Skill(s): fastify-best-practices, drizzle-orm-patterns, zod, typescript-expert
- What: endpoints under `/repos/:repoId/context/`: `GET documents` (with tokens, used-by counts, missing flags), `GET/PUT document` (conflict warning if changed since load), `POST document` (create empty), `POST upload` (multipart, `.md` only), `DELETE document` (also removes attachments, AC-7), `POST refresh`; `GET/PUT /agents/:id/context?repo_id=` and `/skills/:id/context?repo_id=` (toggle/reorder, refuse >100 KB with explanatory error AC-24, flag missing AC-19), `GET` effective set + serialized preview + token total (AC-20, 22). "Used by N" = distinct enabled agents directly or via enabled skills (AC-9). Empty-clone/no-folder returns empty list with state hint, not error (AC-10). Detach on agent/skill delete in `agents`/`skills` repositories.

### 6. Run-time injection and trace snapshot — module: server
- Files: `server/src/modules/reviews/run-executor.ts` (add `buildProjectContext` next to `buildSkills`; pass `specs` into `reviewPullRequest`; fill `specs_read` + `project_context` in trace, also in the failure-path trace), `server/src/modules/reviews/repository/*` (attachment lookup via new context repo function), reviewer-core `reviewPullRequest` params if `specs` not already passed through (`reviewer-core/src/review/*`).
- Skill(s): typescript-expert, engineering-insights
- What: at run start, resolve effective set (agent own then enabled skills, dedupe), read once from base branch (snapshot, AC-25, 30), skip missing with a log line and `skipped` record (AC-31, 36), omit block when empty (AC-29), best-effort like other enrichment (failure logs and continues). Persist snapshot (AC-35). AC-25..31, 34..36.

### 7. Client hooks, i18n, API types — module: client
- Files: `client/src/lib/hooks/context.ts` (+ export from `hooks/index.ts`), `client/src/lib/types.ts`, `client/messages/en/context.json` (register in i18n loader), nav entry in app-shell.
- Skill(s): react-best-practices, react-nextjs-architecture, typescript-expert
- What: TanStack Query hooks for the endpoints in step 5, i18n strings for every UI string (NFR).

### 8. Project Context page — module: client
- Files: `client/src/app/repos/[repoId]/context/page.tsx` + `_components/` (DocumentList, DocumentViewer with Preview/Edit, AddMenu, UploadDialog, DeleteConfirm, EmptyState, ErrorState), following the `conventions/` page layout (`constants.ts`, `styles.ts`).
- Skill(s): next-best-practices, react-nextjs-architecture, react-best-practices
- What: per design `project-context-page.png` (coverage ring omitted). Preview renders as safe text/markdown (no raw HTML); unsaved edits preserved on error (AC-11); "Used by N agents"; refresh. AC-1..11, 21.

### 9. Agent and Skill Context tabs — module: client
- Files: `client/src/app/agents/[id]/_components/AgentEditor/` (new Context tab component), `client/src/app/skills/_components/SkillsLabView/_components/` (Context tab), shared `client/src/components/context-attachments/` (checklist, drag reorder, move up/down buttons with `aria-live` announcements, filter, inline read-only preview, "N of M attached", missing badge, token total + >8k warning, 100 KB refusal message, empty state linking to page; skill tab adds "Serializes as" preview).
- Skill(s): react-best-practices, react-nextjs-architecture, react-testing-library
- What: AC-12..24 with keyboard-operable reordering (AC-15).

### 10. Run trace UI — module: client
- Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` (+ new section component).
- Skill(s): react-best-practices, react-testing-library
- What: collapsible "Project context — attached specs (untrusted)" section with full text as plain text and Copy action; Configuration "Specs read" with paths and origin; skipped/missing list with reasons; tolerate old traces without the snapshot. AC-32..36.

### 11. Migration + docs hand-off — module: server
- What: run `cd server && pnpm db:migrate` locally; doc-writer adds the three glossary terms and the known-gap note to `CONTEXT.md`. (Not implementer scope beyond the migrate command.)

## Tests to run
- `cd reviewer-core && pnpm exec vitest run test/project-context.test.ts test/prompt.test.ts test/prompt-skill-trust.test.ts && pnpm typecheck`
- `cd server && pnpm exec vitest run src/modules/context src/modules/reviews && pnpm typecheck` (unit only; no `*.it.test.ts`)
- `cd client && pnpm exec vitest run src/app/repos src/app/agents src/app/skills src/components/context-attachments && pnpm typecheck`
- Integration (`*.it.test.ts`) and e2e belong to test-writer/CI.

## Out of scope
- Writing or changing the spec (specreator)
- Architectural review (separate agent)
- Security review (separate agent)
- Coverage ring, document rename, version pinning, token-usage stats, cross-repo attachments, RAG injection (spec Non-goals)
