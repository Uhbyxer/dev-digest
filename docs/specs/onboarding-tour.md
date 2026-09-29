# Spec: Onboarding Tour   |   Spec ID: SPEC-02   |   Status: draft
Supersedes: n/a
Full spec (source of truth for implementation): `.scratch/onboarding-tour/spec.md`

## Problem and why

A developer opening an unfamiliar repo has no map: what the architecture is, which files matter, how to run it, what to read first, what to work on. DevDigest already indexes repos (repo-intel); the Onboarding Tour turns that index into a five-section guide.

Terms live in `CONTEXT.md` (**Onboarding Tour**). Decision record: `docs/adr/0003-onboarding-tour-generation.md`. Design mockups: the two Onboarding Tour screenshots supplied with the request (not committed yet; add under `docs/design/onboarding-tour-*.png`).

## Goals / Non-goals

Goals:
- One stored Tour per repo with exactly five sections: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.
- Generate on demand; Regenerate replaces the Tour; show "stale" when the index is newer.
- Page at `/repos/[repoId]/onboarding`, sidebar entry, sticky "On this page" nav, collapsible sections.
- Copy as Markdown, Share link (copies the local URL), copy button per run command, Open per critical path.

Non-goals (v1, kept minimal on purpose):
- Tour history/versions; auto-generation after indexing.
- Per-section retry (only whole-Tour Regenerate). Sections that fail show "could not be generated".
- Injecting the Tour into agent prompts; MCP tool for it.
- First tasks from GitHub issues or `.scratch/`.
- Renaming the existing `/onboarding` (Add repository) route.

## Behaviour

1. **Generate**: button (empty state) enabled only when the repo index is `ready`. If the index is partial, allow it and show a "built from partial index" banner. Data from `GET /repos/:id/index-state`.
2. **Deterministic parts**: Critical paths = top files by number of dependents (depgraph), each with dependents count and one-line role. How to run locally = commands extracted from `package.json` scripts, `docker-compose`, README; never LLM-written.
3. **LLM parts**: Architecture overview (text; diagram optional/out), Guided reading path, First tasks (each with 1–3 anchor files). Input is a token-budgeted selection: top-N files by dependents, root manifests, README, top-two-level tree, truncated bodies. Input is delimiter-wrapped as untrusted; output is schema-constrained.
4. **Verification**: every path in LLM output must exist in the index; invalid ones are dropped. A section left empty renders "could not be generated".
5. **Stored**: one row per repo (`repo_id`, `content_json`, `index_commit_sha`, `generated_at`, per-section status, files/tokens sent). Regenerate overwrites.
6. **Stale**: shown when `index_commit_sha` differs from the current index; never auto-regenerates.
7. **Open**: opens the file in an existing in-app read-only viewer if one exists; otherwise copies the relative path.
8. **Placement**: sidebar item (Workspace group) → active repo's Tour; no active repo → repo picker.

## Acceptance criteria

- AC-1: Route `/repos/[repoId]/onboarding` renders the five sections in the fixed order with a sticky "On this page" nav.
- AC-2: With no stored Tour, the page shows an empty state with **Generate tour**; the button is disabled with a reason while the index is not `ready`.
- AC-3: Generating stores one Tour per repo; Regenerate replaces it and updates "last refreshed".
- AC-4: Header shows "Generated from index of N files" and relative refresh time.
- AC-5: Critical paths are ordered by dependents count and display that count.
- AC-6: How to run locally contains only commands found in repo files; each has a copy button.
- AC-7: No path from LLM output that is missing in the index is ever displayed.
- AC-8: A failed/empty section shows "could not be generated" and does not hide the others.
- AC-9: Stale badge appears when the index is newer than the Tour; nothing regenerates automatically.
- AC-10: Copy as Markdown copies all five sections; Share link copies the page's local URL.
- AC-11: Repo text sent to the LLM is delimiter-wrapped as untrusted, per ADR-0001/0002 conventions.
- AC-12: The Tour is not included in any agent prompt or MCP response.
- AC-13: A partial index shows the "built from partial index" banner.

## Open items (for planning, not blocking)

- Whether an in-app read-only file viewer exists (check the PR diff view) — decides Open behaviour (Behaviour 7).
- Exact token budget and N for file selection.
