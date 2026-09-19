# Spec: Conventions (repo-derived Skills)

## Problem

Every review currently relies on Skills that someone typed by hand or
imported from a file. But a codebase's real house style — "always
async/await, never `.then()` chains," "Redis access goes through a
singleton" — already lives in the code itself. Nobody writes it down, so
new agents (and new teammates) don't get told about it until a reviewer
catches a violation by hand.

## Goal

Let a user scan a repo for recurring code-style patterns, review the
detected candidates (accept/reject/edit), and turn the accepted ones into a
new Skill — without hand-authoring anything from scratch.

## Non-goals

- Detecting anything beyond code-style/house-convention patterns (no
  security, perf, or correctness findings — that's `findings`/PR review).
- Merging accepted conventions into an *existing* Skill. Every batch
  produces a new Skill.
- Cross-session/embedding-based memory of conventions (that's
  `memory.kind='convention'`, a separate subsystem — see `CONTEXT.md`).
- A configurable/tunable confidence floor for v1. All detected candidates
  are shown, sorted, with a confidence indicator; filtering is a reviewer
  judgment call, not a system gate.

## Domain model

Full definitions live in `CONTEXT.md` (`## Convention`, `## Create skill
from conventions`) — written there as part of this design so they don't
drift from the code. Summary:

- **Convention**: a repo-scoped detection candidate — `rule`,
  `evidencePath`, `evidenceSnippet`, `confidence`, `status: pending |
  accepted | rejected`.
- Accepting a Convention **is** selecting it for the next Skill — there is
  no separate selection state.
- Rejecting is a soft-delete (row kept, excluded from future scans via
  dedupe) — never a hard delete.
- A Skill created from Conventions is always `source: extracted` (ADR-0001
  trust tier), even after user edits.

## Data model

Extend the existing, currently-unused `conventions` table
(`server/src/db/schema/knowledge.ts`) rather than introducing a new table
or reusing `memory`:

```
conventions
  id              uuid, pk
  workspaceId     uuid, fk -> workspaces
  repoId          uuid, fk -> repos
  rule            text            -- user-editable
  evidencePath    text            -- read-only, detection output
  evidenceSnippet text            -- read-only, detection output
  confidence      double          -- read-only, detection output
  status          enum('pending','accepted','rejected')  -- was: accepted boolean
  createdAt       timestamp
  updatedAt       timestamp
```

Migration: drop `accepted: boolean`, add `status` enum (default `pending`).
No other schema changes needed — `evidencePath`/`evidenceSnippet`/
`confidence` already exist and already match the shape this feature needs.

No new "scan" table. A scan run doesn't need its own persisted entity —
"last scanned" is derivable from `max(conventions.createdAt)` per repo, and
a scan is a synchronous-enough operation (bounded by `getConventionSamples`'
file count) that it doesn't need a job/run record for v1. Revisit if scans
become async/long-running.

## Detection pipeline

Two-step LLM flow, formalizing the pattern already named (but not
implemented) in `server/src/adapters/mocks.ts`:

1. **File sampling**: reuse `repoIntel.getConventionSamples(repoId, n)`
   (`server/src/modules/repo-intel/service.ts:630`) — already implemented,
   already excludes tests/configs/migrations, already ranks by
   PageRank + git hotness. Do not reimplement file selection.
2. **`ConventionFileSelection`** (LLM call, structured output): given the
   sample set, narrow/group files by likely shared pattern.
3. **`ConventionExtraction`** (LLM call, structured output): per group,
   extract `{rule, evidencePath, evidenceSnippet, confidence}` candidates.
4. **Dedupe against existing rows**: before inserting, match new candidates
   against this repo's existing `conventions` rows by evidence-location
   overlap + normalized rule-text similarity. A match against a `rejected`
   row is dropped silently (not resurfaced). A match against an
   `accepted`/`pending` row is dropped too (avoid duplicate candidates).
   Only genuinely new candidates are inserted as `pending`.

**Placement** (matches the existing `reviewer-core` / `server` split used
by PR review):

- `reviewer-core/src/conventions/` — pure prompt-building + schema
  definitions for `ConventionFileSelection` and `ConventionExtraction`, no
  I/O, provider-agnostic. Mirrors `reviewer-core/src/prompt.ts`.
- `server/src/modules/conventions/` — orchestration: calls
  `repoIntel.getConventionSamples`, calls the two LLM steps via the
  existing LLM adapter, runs dedupe, persists rows, exposes routes.

A re-scan is **additive**: it never mutates existing `accepted`/`rejected`
rows, only inserts new `pending` candidates (post-dedupe).

## API (server/src/modules/conventions/routes.ts)

| Method | Path                                | Purpose |
|--------|-------------------------------------|---------|
| POST   | `/repos/:id/conventions/scan`       | Run detection pipeline, insert new `pending` rows |
| GET    | `/repos/:id/conventions`            | List all conventions for a repo (all statuses) |
| PATCH  | `/conventions/:id`                  | Edit `rule` text and/or `status` (accept/reject) |
| POST   | `/repos/:id/conventions/create-skill` | Body: `skillIds?`-equivalent — takes currently-`accepted` conventions for the repo, merges into a new Skill |

`create-skill` reads the repo's `accepted` conventions server-side rather
than taking an explicit id list from the client — acceptance already *is*
selection, so there's nothing else for the client to pass beyond the repo
id and the editable skill name/description the user typed in the modal.

## Review workflow (client)

New route under the existing Skills Lab nav (`client/src/app/conventions/`
or nested under `skills/`, peer to the existing `SkillsLabView` pattern:
`_components/`, `lib/hooks/conventions.ts`):

1. **Conventions page** (per repo): list of detected conventions, each
   showing rule text, evidence file:line + snippet, confidence bar, and
   Accept/Reject actions. Header shows sample count and last-scan time,
   with a "Re-scan" action.
2. **Accept** flips `status: pending -> accepted` (also removes it from
   view if you filter by pending, but stays visible/counted as accepted).
3. **Reject** flips `status: pending -> rejected` (soft-delete; excluded
   from future scan resurfacing).
4. **Edit**: inline edit of `rule` text only. Evidence/confidence are
   display-only. Does not change `status`.
5. **"Create skill"** button (enabled once ≥1 convention is `accepted`)
   opens the Skill Editor modal, pre-filled by merging all `accepted`
   conventions' `rule` text (grouped under headings, each citing its
   `evidencePath:line`) into the skill body. Name/description default to
   `<repo-slug>-conventions` / "N house conventions extracted from
   `<repo-slug>`", both editable. `type` defaults to `convention`,
   `source` is fixed to `extracted` (not exposed as an editable field — see
   Domain model).
6. Saving creates a new Skill (never updates an existing one — see
   Non-goals) and closes the modal.

## Rejected alternatives

- **`memory` table (`kind: 'convention'`) as the storage layer**: rejected
  — it's a RAG/embedding-scoped subsystem for cross-session memory, a
  different lifecycle (no `pending`/`accepted`/`rejected` review states,
  no per-repo evidence-location dedupe). Reusing it would mean bolting
  review-workflow semantics onto a system not designed for them.
  Overlap flagged in `CONTEXT.md` so it isn't rediscovered as a bug later.
- **Trusting user-edited conventions as `manual`**: rejected per ADR-0001's
  own conservative stance — a user accepting/editing detected text is not
  the same guarantee as typing it from scratch in the Skill Editor.
  Keeping it `extracted` avoids reopening the injection-guard question
  ADR-0001 already settled.
- **Separate "selected" flag distinct from `accepted`**: rejected as an
  unrequested third state. Accept/reject is already a review decision;
  making selection separate would mean two independent decisions to track
  and explain in the UI for no expressed use case.
- **Hard-deleting rejected conventions**: rejected — would cause identical
  noise to resurface on every re-scan, defeating the point of letting a
  user reject anything.
- **A dedicated `convention_scans` run table**: rejected for v1 — scanning
  is bounded/synchronous enough that `max(createdAt)` per repo answers
  "when was this last scanned" without a new entity. Add one later if scans
  become async/queued.

## Open questions for ticket breakdown

- Exact `n` (sample file count) passed to `getConventionSamples` — needs a
  starting default, tunable later.
- Whether `POST .../scan` should be synchronous (blocks until LLM calls
  finish) or return immediately and let the client poll — depends on
  measured latency of the two-step LLM flow once built; not a domain
  decision, an implementation one to make once the calls exist.
- Exact confidence-bar color thresholds (screenshot shows green ~91%/85%,
  orange ~78%) — a UI/copy detail, not a data-model one.

## Future improvements (not committed scope)

Ideas for increasing the quantity and quality of detected conventions,
raised as the bonus product question in the original ask:

- **Cross-file corroboration as a confidence signal**: weight `confidence`
  up when the same pattern is independently detected across multiple
  unrelated files/directories (today confidence likely reflects only the
  LLM's per-extraction certainty, not corroboration count).
- **Git-history signal**: use `repoIntel`'s existing git-hotness data (used
  for `rank.ts`) to prioritize sampling files that changed most/recently —
  conventions in actively-touched code are more likely still enforced than
  ones only in stale files.
- **Negative-example mining**: explicitly prompt the extraction step to
  also look for *violations* of a candidate convention elsewhere in the
  sample (a file breaking the async/await rule) — a convention with zero
  counter-examples in-sample is stronger evidence than one that's actually
  inconsistently followed, and surfacing the counter-example as extra
  evidence would help the user judge it.
- **PR-review feedback loop**: once a Skill created from Conventions is
  live, agents applying it during PR review generate `findings`. A
  convention whose corresponding finding is frequently reverted/dismissed
  by reviewers is a signal the extracted rule was wrong or too strict —
  could surface as "this convention may need editing" back on the
  Conventions page. Deliberately out of v1 (depends on a findings-outcome
  signal that doesn't exist yet), but the data model doesn't preclude it.
- **Multi-repo pattern aggregation**: for workspaces with several repos
  sharing a team, promote a convention detected independently in multiple
  repos as a stronger "team-wide" candidate, rather than treating each
  repo's conventions in total isolation.

## Implementation order (spec → tickets → build)

Suggested ticket slicing for the next phase:
1. Migration: `conventions.accepted` boolean → `status` enum.
2. `reviewer-core/src/conventions/`: schemas + prompt-building for the two
   LLM steps (unit-testable without any I/O).
3. `server/src/modules/conventions/`: service + repository + dedupe logic
   + routes (scan, list, patch).
4. `create-skill` route: merge logic + `source: extracted` skill creation.
5. Client: Conventions list page (`client/src/app/conventions/`).
6. Client: "Create skill" modal (adapt `SkillEditorModal` pattern,
   pre-filled body).
7. E2E: scan → accept/reject/edit → create skill, deterministic against
   the mock LLM provider.
