# Spec: Onboarding Tour

Status: ready-for-agent

Related: `CONTEXT.md` (Onboarding Tour), `docs/adr/0003-onboarding-tour-generation.md`, `docs/specs/onboarding-tour.md` (short reference, SPEC-02).

## Problem Statement

A developer who opens an unfamiliar repository in DevDigest has no map. They do not know how the system is structured, which files carry the most weight, how to run it, what to read first, or what small task to start with. DevDigest has already indexed the repo, but that knowledge is not turned into anything a newcomer can follow.

## Solution

For each repo, the user can generate an **Onboarding Tour**: one stored guide with exactly five sections — Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks. Facts (critical paths, run commands) come from the repo index and manifests; the LLM only writes the overview, reading order and first tasks, and every file it names is checked against the index. The Tour is created and refreshed only by explicit user action, shows when it is stale, and can be copied as Markdown or shared as a local link.

## User Stories

1. As a new contributor, I want a five-section Onboarding Tour for a repo, so that I get oriented without reading the whole codebase.
2. As a new contributor, I want an Architecture overview, so that I understand how requests and data flow through the system.
3. As a new contributor, I want Critical paths ranked by how many files depend on them, so that I know which files carry the most weight.
4. As a new contributor, I want each critical path to show its dependents count and a one-line role, so that I can judge its importance at a glance.
5. As a new contributor, I want an Open action on each critical path, so that I can jump straight to the file.
6. As a new contributor, I want How to run locally to list only commands that really exist in the repo's files, so that I can paste them without fear of invented steps.
7. As a new contributor, I want a copy button on every run command, so that setup is quick.
8. As a new contributor, I want a Guided reading path with a reason for each file, so that I read in a sensible order.
9. As a new contributor, I want First tasks with concrete anchor files, so that I know where to start contributing.
10. As a user, I want tour files that do not exist in the repo never to be shown, so that I can trust every path.
11. As a user, I want a section that could not be generated to say so without hiding the others, so that a partial result is still useful.
12. As a user, I want to press Generate tour from an empty state, so that I control when LLM cost is incurred.
13. As a user, I want Generate to be disabled with a reason while the repo index is not ready, so that I do not start a doomed run.
14. As a user, I want a "built from partial index" banner when the index is incomplete, so that I know the Tour may miss parts.
15. As a user, I want the header to say "Generated from index of N files" and when it was refreshed, so that I know what the Tour is based on.
16. As a user, I want a stale badge when the index is newer than the Tour, so that I know when to regenerate.
17. As a user, I want the Tour never to regenerate by itself, so that nothing spends tokens behind my back.
18. As a user, I want Regenerate to replace the current Tour, so that there is one current version per repo.
19. As a user, I want Copy as Markdown, so that I can paste the Tour into a wiki or message.
20. As a user, I want a Share link that copies the Tour's local URL, so that I can send it to myself or a teammate on the same machine.
21. As a user, I want a sticky "On this page" navigation and collapsible sections, so that I can move around a long Tour.
22. As a user, I want an Onboarding Tour sidebar item that goes to the active repo's Tour, or a repo picker when none is active, so that I can always reach it.
23. As a maintainer, I want repo text sent to the LLM to be wrapped as untrusted and the output schema-constrained, so that a hostile repo cannot steer the Tour.
24. As a maintainer, I want the Tour kept out of agent prompts and MCP responses, so that generated text cannot become an injection path.
25. As a maintainer, I want the existing Add repository screen at `/onboarding` left untouched, so that this feature does not break the add-repo flow.

## Implementation Decisions

- **New server module "onboarding tour"** following the existing module layout (routes, service, repository), registered with the other modules. Tenancy resolved like other repo-scoped routes.
- **API**: read the current Tour of a repo (empty result when none); generate/regenerate a Tour, which replaces the stored one. Generation is refused with a clear error when the index is not ready; a partial index is allowed and flagged.
- **Persistence**: one row per repo holding the Tour content (five sections with per-section status), the index commit it was built from, generation time, and how many files/tokens were sent to the LLM. Regenerate overwrites; no history. Requires a DB migration (server does not migrate on boot).
- **Deterministic parts**: Critical paths ranked by dependents from the existing dependency graph; run commands extracted from package manifests, compose file and README. Run commands are never LLM-written.
- **LLM parts**: overview, reading path, first tasks (each with 1–3 anchor files). Input is a token-budgeted selection: top files by dependents, root manifests, README, top-two-level tree, truncated bodies. Input is delimiter-wrapped as untrusted, per ADR-0001/0002 conventions; output is schema-constrained. Uses the existing LLM adapter and its mock.
- **Verification step**: every path in LLM output is checked against the index; unknown paths are dropped; a section left empty is marked as not generated.
- **Staleness**: computed by comparing the Tour's index commit with the current one; display only.
- **Diagram** from the mockup is optional in this version; overview text is required.
- **Contracts**: Tour shape lives in the shared contracts area used by both server and client, like other features.
- **Client**: new page under the repo's route, five collapsible sections, sticky "On this page" nav, header actions (Regenerate, Share link, Copy as Markdown), sidebar item under Workspace. Open uses an in-app read-only file view if one exists, otherwise copies the relative path.
- **Not touched**: the `/onboarding` Add repository route; agent prompt assembly; MCP server.
- **ADR-0003** records the hybrid generation and DB-storage decision.

## Testing Decisions

- A good test drives external behavior only — HTTP in, JSON out; rendered UI in, visible result out — and does not assert on internal helpers, prompts' exact wording, or ranking internals.
- **Primary seam: the onboarding-tour HTTP routes**, as a server integration test on real Postgres with the LLM stubbed via the shared mocks and a prepared index. Covers: Tour has five sections in order; critical paths ordered by dependents with counts; run commands come only from repo files; invented paths are dropped; empty section is flagged not generated and others survive; generate refused when index not ready; partial index flagged; regenerate replaces the row; stale flag when the index commit differs; no auto-regeneration.
- **Secondary seam: the client Tour page component** (React Testing Library, mocked `fetch`): empty state, disabled Generate with reason, sections render, stale badge, partial banner, Copy as Markdown, Share link copies the local URL, Open fallback copies path.
- Prior art: server `*.it.test.ts` route tests (blast route, pr-history route) and the client component tests described in `TESTING.md`.
- No dedicated e2e flow (the e2e suite runs with no LLM in the loop); file-selection budgeting is verified only through the primary seam.

## Out of Scope

- Tour history/versions and auto-generation after indexing.
- Per-section retry (only whole-Tour Regenerate).
- First tasks sourced from GitHub issues or `.scratch/`.
- Injecting the Tour into agent prompts; an MCP tool for it.
- Renaming the `/onboarding` Add repository route.
- Any sharing beyond a local URL.

## Further Notes

- Open items for the implementer: whether an in-app read-only file viewer exists (decides Open behavior), and the exact token budget and file count for the LLM input.
- Terms to keep consistent: **Onboarding Tour** (artifact), **Onboarding Generator** (feature name only), **Critical path**, **stale**.
