# Development Plan: Intent Layer

## Context

The "Intent Layer" derives the motivation/scope behind a PR — a one-line
paraphrase plus IN SCOPE / OUT OF SCOPE lists — from the PR's title,
description, linked ticket, and (when referenced) a linked plan/spec
document, using a separate cheap LLM model. It surfaces in a new INTENT panel
on the PR Overview tab. RISK AREAS (`risk_brief`) is a separate,
already-scaffolded feature and is explicitly untouched by this plan.

Scaffolding already exists and is reused rather than rebuilt: the
`review_intent` `FeatureModelId` (`server/src/vendor/shared/contracts/platform.ts:14-79`),
`resolveFeatureModel` (`server/src/modules/settings/feature-models.ts:36-57`),
the client Settings model picker (`client/src/lib/feature-models.ts`,
`SettingsModels.tsx`), the `prIntent` table and `Intent` Zod contract
(`server/src/db/schema/reviews.ts:48-55`, `server/src/vendor/shared/contracts/brief.ts:8-14`),
and the `upsertIntent`/`getIntent` repo functions
(`server/src/modules/reviews/repository/pull.repo.ts:49-68`), which currently
have zero callers. This plan wires all of it together, adds the
confidence/provenance field the schema is missing, adds the linked-spec
fetch adapter (new surface — nothing like it exists), and adds a minimal
read-only INTENT panel.

No GitHub issue is linked to this task.

## Architectural constraints

- `reviewer-core/` stays pure: prompt construction for both the intent-model
  call and the quarantine extraction call, plus the deterministic
  stated-vs-inferred confidence scoring, are pure functions with no DB/fs/
  network access (`reviewer-core/CLAUDE.md`). All I/O — the cheap-model LLM
  calls, the linked-URL fetch, and persistence — lives in
  `server/src/modules` (service layer) and `server/src/adapters` (per
  `onion-architecture`).
- `server/clones/**` is not touched by this feature at all.
- The server does not migrate on boot (`CLAUDE.md`) — the schema change
  needs an explicit `pnpm db:migrate` step called out for whoever deploys it.
- Untrusted external content (PR description, linked issue body, and now
  fetched linked-spec content) must go through `wrapUntrusted`/`INJECTION_GUARD`
  (`reviewer-core/src/prompt.ts:16-40`) before reaching any prompt — this
  already explicitly names "derived intent/scope" as untrusted-to-others, so
  the *inputs* to intent derivation must be handled with the same care.

## ADR conflicts

None. This plan extends the provenance/trust-tier precedent set by
ADR-0001 (`docs/adr/0001-skill-trust-tiers.md`) to a new content class
(fetched external URLs) rather than contradicting it — see step 10 (new ADR
entry), which documents this extension instead of silently overriding
ADR-0001's existing `imported_url` tier.

## Decisions (resolving the open questions up front)

1. **Confidence field**: `Intent` gets `confidence: 'stated' | 'inferred'`
   and `sources: string[]` (drawn from a closed
   `'description' | 'linked_ticket' | 'linked_spec' | 'diff_stats' | 'commit_messages' | 'title'`
   enum). Both are computed **deterministically in reviewer-core**, not
   self-reported by the LLM — a cheap model's own confidence claim is not
   trustworthy enough to gate a UI badge; whether the author actually wrote a
   substantive description is a fact the server already knows before calling
   the LLM at all.
2. **No automatic escalation to a stronger model for v1.** Confidence marking
   is the sole mechanism (per ARCTIC's finding that single-pass cheap
   extraction is already close to expensive agentic extraction, and per the
   user's explicit ask for a static per-feature model setting, not a
   cascade). A future plan can add escalation if `inferred` intents prove too
   noisy in practice.
3. **Linked-spec fetch uses the dual-LLM quarantine pattern**: the fetch
   adapter returns raw text; a *separate*, schema-constrained LLM call (using
   the same cheap `review_intent` model) reduces it to
   `{ summary: string, key_requirements: string[] }` before that content ever
   reaches the main intent-derivation prompt, and even that structured output
   is still delimiter-wrapped as untrusted going into the main prompt (belt +
   suspenders — schema constraints don't make it trusted).
4. **Linked-spec detection is a simple, explicit heuristic for v1**: the
   first `http(s)://` URL in the PR body that is not a same-repo GitHub
   issue/PR self-reference (`#123`, already handled by
   `resolveLinkedIssue`) is treated as a candidate spec link. No NLP
   "is this really a spec" classification — documented as a known
   simplification, refinable later.
5. **Intent generation happens once per review run**, immediately after
   `loadDiff` in `run-executor.ts`, shared across all agents in that run —
   matching the stale comments already there ("Loads the diff + intent
   once"). It is **best-effort**: unlike the diff (which is required — no
   diff, no review possible), a failure to derive intent logs a warning and
   the run(s) proceed without it. This plan does **not** feed intent into the
   per-agent review prompt or wire a diff-vs-intent drift finding — that's a
   deliberate scope cut (see Out of scope) since none of the reused
   scaffolding (prompt.ts, run-executor comments) implies that wiring exists
   yet, and it is a separable, higher-risk follow-up.
6. **New endpoint** `GET /pulls/:id/intent` (not folded into `PrDetail`,
   since intent is generated asynchronously during a review run, not
   available at PR-import time) returning `Intent | null`.
7. **Client panel**: a minimal `IntentPanel` in the existing `OverviewTab`,
   reusing its `SectionLabel` pattern — one-line intent, IN SCOPE / OUT OF
   SCOPE bullet lists, and a small "inferred" badge when
   `confidence === 'inferred'`. No RISK AREAS section (out of scope).

## Steps

### 1. Migration — add confidence/source to `pr_intent` — module: server
- Files: `server/src/db/schema/reviews.ts`, new
  `server/src/db/migrations/0012_pr_intent_confidence.sql` (generated via
  `pnpm db:generate`, not hand-written SQL), `server/src/db/migrations/meta/*`.
- Skill(s): `drizzle-orm-patterns`, `postgresql-table-design`.
- What: add two columns to `prIntent`:
  `confidence: text('confidence', { enum: ['stated', 'inferred'] }).notNull().default('inferred')`
  and `sources: jsonb('sources').$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)`
  (mirrors the existing `inScope`/`outOfScope` jsonb-array pattern in the same
  table). Default `'inferred'`/`'[]'` keeps any pre-existing rows (there are
  none today, since nothing calls `upsertIntent` yet, but keep it
  non-breaking regardless). Run `pnpm db:generate` then `pnpm db:migrate`
  locally to produce and verify the migration; do not hand-edit the
  generated SQL beyond what Drizzle produces.

### 2. Shared contract — extend `Intent` — module: server (shared contracts, consumed by client + reviewer-core)
- Files: `server/src/vendor/shared/contracts/brief.ts`,
  `client/src/vendor/shared` mirror if the client vendors a copy (check
  `client/src/vendor/shared/contracts/brief.ts` — if it exists, keep it in
  sync, same pattern already used for `client/src/lib/feature-models.ts`
  mirroring `FEATURE_MODELS`).
- Skill(s): `zod`, `typescript-expert`.
- What: extend `Intent`:
  ```ts
  export const IntentConfidence = z.enum(['stated', 'inferred']);
  export const IntentSource = z.enum([
    'title', 'description', 'linked_ticket', 'linked_spec',
    'diff_stats', 'commit_messages',
  ]);
  export const Intent = z.object({
    intent: z.string(),
    in_scope: z.array(z.string()),
    out_of_scope: z.array(z.string()),
    confidence: IntentConfidence,
    sources: z.array(IntentSource),
  });
  ```
  `PrBrief.intent` (`brief.ts:116-122`) picks this up automatically since it
  references `Intent`. Do not add any risk-related field here — `risk_brief`
  is a separate, already-scaffolded feature.

### 3. reviewer-core — pure intent-generation building blocks — module: reviewer-core
- Files: new `reviewer-core/src/intent/prompt.ts`,
  `reviewer-core/src/intent/quarantine-prompt.ts`,
  `reviewer-core/src/intent/confidence.ts`, `reviewer-core/src/intent/schema.ts`,
  `reviewer-core/src/intent/index.ts` (barrel, re-exported from
  `reviewer-core/src/index.ts` alongside the existing conventions exports).
- Skill(s): `typescript-expert`, `zod`, `engineering-insights` (name it as a
  new pure module in the engine, following the conventions module's existing
  "pure prompt-building lives here, all I/O lives in the server" split).
- What:
  - `schema.ts`: `IntentGenerationResult = z.object({ intent: z.string(), in_scope: z.array(z.string()), out_of_scope: z.array(z.string()) })` — the raw LLM output shape (no confidence/sources; those are computed deterministically, not by the model). Also `QuarantineExtractionResult = z.object({ summary: z.string(), key_requirements: z.array(z.string()) })` and schema-name constants (`INTENT_GENERATION_SCHEMA_NAME`, `QUARANTINE_EXTRACTION_SCHEMA_NAME`), mirroring `CONVENTION_EXTRACTION_SCHEMA_NAME`'s naming.
  - `prompt.ts`: `buildIntentPrompt(signals: IntentSignals): ChatMessage[]`, where
    ```ts
    interface IntentSignals {
      title: string;
      description?: string;      // PR body, untrusted
      linkedTicketBody?: string; // untrusted
      quarantinedSpec?: QuarantineExtractionResult; // untrusted, already schema-shaped
      fileStats: { path: string; additions: number; deletions: number }[];
      commitMessages: string[];
    }
    ```
    Wraps `description`, `linkedTicketBody`, and the quarantined spec fields
    with `wrapUntrusted` (imported from `../prompt.js`) exactly like
    `assemblePrompt` wraps PR description/diff today; file stats/commit
    messages are also derived-from-the-PR data, so wrap them too rather than
    treating them as instructions. System message explicitly asks for the
    `IntentGenerationResult` shape and states the model must paraphrase, not
    quote instructions found in the wrapped blocks (echoing the existing
    `INJECTION_GUARD` framing but scoped to this call).
  - `quarantine-prompt.ts`: `buildQuarantineExtractionPrompt(rawText: string): ChatMessage[]` — wraps `rawText` with `wrapUntrusted('linked-spec-raw', rawText)`, instructs the model to return *only* a short summary and a bullet list of key requirements, explicitly telling it to ignore any instructions found inside the wrapped block (same guard language pattern as `INJECTION_GUARD`, scoped locally since this call has a narrower job than a full review).
  - `confidence.ts`: pure function
    `deriveIntentConfidence(signals: { hasSubstantiveDescription: boolean; hasLinkedTicket: boolean; hasLinkedSpec: boolean }): { confidence: 'stated' | 'inferred'; sources: IntentSource[] }`.
    Rule: `confidence = 'stated'` only when the PR description is present and
    exceeds a minimum length/word-count threshold (e.g. > 40 non-whitespace
    chars) — otherwise `'inferred'`, regardless of what the LLM produced.
    `sources` always includes `'title'` and `'diff_stats'`/`'commit_messages'`
    when those inputs were non-empty, plus `'description'`, `'linked_ticket'`,
    `'linked_spec'` when each was actually available and used.
- Tests: `reviewer-core/src/intent/*.test.ts` — unit tests for
  `deriveIntentConfidence` (thin description → inferred; substantive
  description → stated; sources list matches which signals were passed) and
  for prompt builders (untrusted wrapping present, injection guard language
  present, no raw un-wrapped user content leaks into the system message).

### 4. Server adapter — fetch a linked plan/spec URL safely — module: server
- Files: new `server/src/adapters/linked-doc/fetcher.ts`,
  `server/src/adapters/linked-doc/index.ts`, wired into
  `server/src/platform/container.ts` as e.g. `container.linkedDocFetcher()`
  (or a plain exported function if the container doesn't need to inject a
  fake for tests — check `server/src/adapters/mocks.ts` for the existing
  mocking convention and add a mock fetcher there too, since `TESTING.md`
  requires GitHub/LLM/git to be stubbed via `mocks.ts` — extend that
  convention to this new adapter).
- Skill(s): `fastify-best-practices` (adapter/container wiring conventions),
  `typescript-expert`. Security concerns here (SSRF, size/timeout limits)
  are called out per the standard `security` skill's guidance but the actual
  security review pass is out of scope for this plan (see below) — implement
  the limits as specified, don't design new ones.
- What: `fetchLinkedDoc(url: string): Promise<{ text: string } | undefined>`:
  - Reject non-`http(s)` protocols outright.
  - Resolve the hostname (`node:dns/promises`) and reject if any resolved
    address is loopback, link-local, or a private range (`10.0.0.0/8`,
    `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, and
    IPv6 equivalents) — basic SSRF guard, no allowlist needed for v1.
  - Fetch with a hard timeout (`AbortController`, ~5s) and a hard byte cap
    (abort the stream once a ~200KB threshold is exceeded) via the
    response body reader, not `Content-Length` alone (a server can lie about
    it).
  - Handle redirects manually (`redirect: 'manual'`, max 3 hops), re-running
    the protocol + DNS/private-IP check on each `Location` header before
    following it.
  - Accept only `text/*` (markdown, plain, html) content types; for `html`,
    strip tags to plain text with a minimal regex/DOM-free approach (no new
    heavy HTML-parsing dependency) rather than passing raw HTML into the LLM.
  - Any failure (network, timeout, rejected host, disallowed content-type)
    returns `undefined` — never throws up into the caller; this is
    best-effort enrichment, matching `run-executor.ts`'s existing pattern for
    `repoIntel` fallbacks.
- Tests: `server/src/adapters/linked-doc/fetcher.test.ts` — unit tests
  covering: non-http(s) rejected, private/loopback IP rejected, oversized
  body aborted, redirect to a private IP rejected, happy path returns text.
  Mock DNS resolution and `fetch` — no real network calls (per `TESTING.md`
  "hermetic" server-unit convention).

### 5. reviewer-core — linked-spec URL detection — module: reviewer-core
- Files: `reviewer-core/src/intent/link-detection.ts` (pure — regex/string
  matching only, no fetch).
- Skill(s): `typescript-expert`.
- What: `detectLinkedSpecUrl(prBody: string, repoFullName: string): string | undefined` —
  finds the first `http(s)://` URL in `prBody`, excluding ones that are a
  same-repo GitHub issue/PR self-reference (`github.com/<repoFullName>/(issues|pull)/\d+`,
  mirroring what `resolveLinkedIssue` already treats as "the linked issue,"
  so this doesn't double-fetch what `linked_issue` already covers).
- Tests: unit tests — bare URL, markdown-link URL, GitHub self-reference
  excluded, no URL present → `undefined`.

### 6. Server service — the intent-generation orchestrator — module: server
- Files: new `server/src/modules/reviews/intent/service.ts` (or
  `server/src/modules/reviews/intent-service.ts` if the module prefers flat
  files — follow whichever the `reviews` module's existing layout favors;
  `repository/pull.repo.ts` suggests a `repository/` subfolder pattern, so
  mirror with an `intent/` service subfolder for symmetry). Update
  `server/src/modules/reviews/repository/pull.repo.ts`'s `upsertIntent`/
  `getIntent` to carry `confidence`/`sources` through to/from the DB row and
  the `Intent` contract.
- Skill(s): `fastify-best-practices` (service/container conventions),
  `zod`, `typescript-expert`. Model this directly on
  `ConventionsService.detectAndInsert` (`server/src/modules/conventions/service.ts:74-139`):
  resolve the feature model, call the LLM, keep all I/O here, keep prompt
  construction in reviewer-core.
- What: `generateIntent(container, workspaceId, pull, repo, diff): Promise<Intent>`:
  1. `const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');`
     then `const llm = await container.llm(provider);`.
  2. If `pull.body` contains a candidate URL (`detectLinkedSpecUrl`), call
     `container.linkedDocFetcher().fetchLinkedDoc(url)`; if it returns text,
     run the quarantine extraction call
     (`llm.completeStructured({ model, schema: QuarantineExtractionResult, schemaName: QUARANTINE_EXTRACTION_SCHEMA_NAME, messages: buildQuarantineExtractionPrompt(text) })`)
     and keep only its structured `{ summary, key_requirements }` — the raw
     fetched text is discarded after this call, never passed further.
  3. Assemble `IntentSignals` (title, description, linked issue body from
     `pull.linked_issue` if already resolved upstream — or re-resolve via the
     existing GitHub adapter path, whichever is already available on the
     `pull`/`repo` objects at this call site — quarantined spec result, diff
     file stats from `diff.files`, commit messages from `pull.commits` if
     available at this point in `run-executor.ts`, else omit) and call
     `buildIntentPrompt`.
  4. `llm.completeStructured({ model, schema: IntentGenerationResult, schemaName: INTENT_GENERATION_SCHEMA_NAME, messages })`.
  5. Compute `{ confidence, sources }` via `deriveIntentConfidence` from
     which signals were actually available (not from the LLM's output).
  6. Return the full `Intent` (LLM's `intent`/`in_scope`/`out_of_scope` +
     computed `confidence`/`sources`); persist via
     `upsertIntent(container.db, pull.id, intent)`.
  7. Any LLM/fetch error propagates to the caller (`run-executor.ts`), which
     treats it as best-effort per decision #5 — this function itself does
     not swallow errors, so unit tests can assert failure behavior cleanly.
- Tests: `server/src/modules/reviews/intent/service.test.ts` — mock
  `container.llm` (per `server/src/adapters/mocks.ts` convention) and the
  linked-doc fetcher; cover: no description/no link → inferred, minimal
  sources; substantive description → stated; linked spec present → quarantine
  call happens and its raw text never appears in the second (intent) prompt's
  messages (assert on the mock's captured call args); LLM failure propagates.

### 7. Wire into `run-executor.ts` — module: server
- Files: `server/src/modules/reviews/run-executor.ts`.
- Skill(s): `fastify-best-practices`, `typescript-expert`.
- What: after `loadDiff` succeeds (around line 105), add a best-effort step:
  ```ts
  try {
    await runLog.step('Deriving PR intent', () => generateIntent(this.container, workspaceId, pull, repo, diff), { kind: 'tool' });
  } catch (err) {
    runLog.info(`Intent derivation skipped — ${(err as Error).message}`);
  }
  ```
  placed so its events land in the shared pre-work log fanned out to every
  job (same buffer the stale comments already describe). Reconcile the
  existing "Loads the diff + intent once" / "shared diff/intent events"
  comments (lines 39, 52-53, 63-64, 148-150, 296-298) so they describe what
  is now actually true, instead of describing a wiring that didn't exist
  before this change. Do not pass the generated intent into
  `reviewPullRequest`'s `PromptParts` — per decision #5, intent is not yet
  fed into the per-agent review prompt in this plan.

### 8. New route — `GET /pulls/:id/intent` — module: server
- Files: `server/src/modules/pulls/routes.ts`.
- Skill(s): `fastify-best-practices`, `zod`.
- What: add
  ```ts
  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<Intent | null> => {
    const { workspaceId } = await getContext(container, req);
    const { pr } = await resolvePrAndRepo(req.params.id, workspaceId); // reuse existing helper
    const intent = await getIntent(container.db, pr.id);
    return intent ?? null;
  });
  ```
  (import `getIntent` from `../reviews/repository/pull.repo.js`, `Intent`
  type from `@devdigest/shared`). Returns `null` (not 404) when no run has
  generated intent yet — the panel treats that as "not yet analyzed," not an
  error.
- Tests: extend `server/src/modules/pulls/*.it.test.ts` (integration, real
  Postgres per `TESTING.md`) with a case seeding a `pr_intent` row and
  asserting the route returns it, and a case with no row asserting `null`.

### 9. Client — Settings model picker verification — module: client
- Files: `client/src/lib/feature-models.ts`,
  `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx`.
- Skill(s): `react-nextjs-architecture`, `typescript-expert`.
- What: verify (no code change expected unless the default model changes) —
  if step 1's server-side default for `review_intent` in `FEATURE_MODELS`
  (`platform.ts:52-57`) is changed to a genuinely cheap model (e.g. a
  cheaper OpenAI/OpenRouter tier — pick per whatever the workspace already
  uses elsewhere, do not introduce a new provider), update the client mirror
  in `client/src/lib/feature-models.ts` to match, keeping the two registries
  in sync as the file's own comment already mandates. Confirm the picker
  renders `review_intent` correctly (it should require no new code — this is
  a verification, not a build, step).

### 10. Client — INTENT panel on PR Overview — module: client
- Files: new
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentPanel/IntentPanel.tsx`
  (+ `styles.ts`/`index.ts` following the existing `OverviewTab`/
  `PrDetailHeader` folder convention), edits to
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`,
  new hook in `client/src/lib/hooks/core.ts` (`useIntent(prId)`, same shape
  as `usePullDetail`), and a type addition in `client/src/lib/types.ts` or
  wherever `PrDetail`/`Intent` client types are re-exported from the vendored
  shared contracts.
- Skill(s): `react-best-practices`, `react-nextjs-architecture`,
  `react-testing-library`.
- What: `useIntent(prId)`:
  ```ts
  export function useIntent(prId: string | number | null | undefined) {
    return useQuery({
      queryKey: ["pr-intent", prId],
      queryFn: () => api.get<Intent | null>(`/pulls/${prId}/intent`),
      enabled: prId != null,
    });
  }
  ```
  `IntentPanel` renders (as a client component, `"use client"` like
  `OverviewTab`): a `SectionLabel` header ("Intent"), the one-line
  `intent` paraphrase, two bullet lists (IN SCOPE / OUT OF SCOPE), and a
  small inline badge reading "Inferred" when `confidence === 'inferred'`
  (no badge, or a "Stated" badge, otherwise — keep it minimal). Renders
  nothing when `data` is `null`/`undefined`/loading-with-no-cache (no
  placeholder skeleton needed for a v1 panel — match `OverviewTab`'s existing
  `{prBody && (...)}` early-return style). Wire it into `OverviewTab.tsx`
  alongside the existing description section, passing `prId` down from
  `page.tsx` (`OverviewTab` already receives `prBody`; add `prId` as a new
  prop). No RISK AREAS section — that belongs to the separate `risk_brief`
  feature's own future panel.
- Tests: `IntentPanel.test.tsx` (React Testing Library, `client/CLAUDE.md`
  conventions: mock `fetch`) — renders intent/in-scope/out-of-scope text,
  shows the "Inferred" badge only when `confidence === 'inferred'`, renders
  nothing when the query returns `null`.

### 11. ADR — extend trust-tier precedent to fetched linked-spec content — module: server (docs)
- Files: new `docs/adr/0002-linked-doc-trust-tier.md`.
- Skill(s): none (docs-only) — cite `onion-architecture`'s and `security`'s
  concerns inline rather than re-deriving them.
- What: a short ADR (same format as `0001-skill-trust-tiers.md`) stating:
  content fetched from a PR-body-linked URL is treated as untrusted,
  analogous to ADR-0001's `imported_url` tier — but additionally goes through
  a quarantine LLM call (schema-constrained extraction) before ever reaching
  a privileged prompt, because unlike a Skill (which is directive content a
  user chose to attach), a linked spec is arbitrary third-party content
  nobody in the workspace authored or vetted. Note the SSRF mitigations
  (protocol/private-IP/size/timeout limits) as the adapter-level counterpart
  to this prompt-level trust decision.

## Tests to run

- `cd reviewer-core && pnpm test` — new intent prompt/confidence/link-
  detection unit tests, plus the existing suite (`--passWithNoTests` safe).
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — new
  `linked-doc/fetcher.test.ts` and `intent/service.test.ts` unit tests
  (mocked LLM/fetch/DNS), plus existing unit suite.
- `cd server && pnpm exec vitest run .it.test` — extended `pulls` integration
  test for `GET /pulls/:id/intent` (needs Docker/testcontainers).
- `cd server && pnpm db:migrate` (after `pnpm db:generate`) — apply the new
  `pr_intent` columns locally before running integration tests.
- `cd client && pnpm test` — new `IntentPanel.test.tsx`.
- `cd server && pnpm typecheck` / `cd client && pnpm typecheck` /
  `cd reviewer-core && pnpm typecheck` — the `Intent` contract change and new
  route/hook types must typecheck across all three packages.

## Out of scope

- Wiring intent into the per-agent review prompt or adding an actual
  diff-vs-stated-intent "drift" finding (ARCTIC-style backtranslation
  scoring). This plan generates, persists, and displays intent only;
  drift-detection is a separable follow-up plan once this foundation exists.
- The RISK AREAS panel / `risk_brief` feature — already scaffolded
  separately, not touched here.
- Architectural review (separate `onion-architecture`-review agent pass).
- Security review (separate `security` skill / `pr-self-review` pass) — this
  plan specifies concrete SSRF/injection mitigations to implement, but a
  dedicated review of them is a separate step, not folded into
  implementation.
