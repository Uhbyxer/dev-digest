# Spec: PR Brief (Why + Risk)

Status: ready-for-agent

Related: `CONTEXT.md` (PR Brief), `docs/adr/0004-pr-brief-generation.md`, `docs/specs/pr-brief.md` (short reference).

## Problem Statement

A reviewer who opens someone else's pull request "cold" does not know why the change exists, what is risky in it, or which file to read first. DevDigest already answers parts of this — Intent, Smart Diff roles and Blast radius — but they are scattered and none of them says where to start or what could go wrong.

## Solution

On the PR's Overview tab the reviewer sees one **PR Brief** card. Until a Brief exists it shows a **Generate brief** button. After generation it shows a short summary (what the PR does and why), **Risk areas** (each with a title and file) and **Review focus** (an ordered "read these first" list of `file:line — reason`), next to the PR's Intent and Blast radius. Clicking a Review focus item opens Files changed on that file. The Brief is stored, so it is there immediately after a reload; a refresh button regenerates it, and it is marked stale when the PR gets a new commit. The model is called exactly once, receives only computed facts (never diff hunk bodies), and everything it names is verified against the PR.

## User Stories

1. As a reviewer, I want a PR Brief card on the Overview tab, so that I get oriented before reading the diff.
2. As a reviewer, I want a Generate brief button while no Brief exists, so that I decide when the model is called.
3. As a reviewer, I want a progress state while the Brief is generating, so that I know it is working.
4. As a reviewer, I want a short summary of what the PR does and why, so that I understand the purpose without reading the description.
5. As a reviewer, I want Risk areas listed with a title and the file each one concerns, so that I know what could go wrong and where.
6. As a reviewer, I want each risk's icon coloured by severity, so that I can spot the serious ones at a glance.
7. As a reviewer, I want to expand a risk to read its explanation, so that I can judge it without leaving the card.
8. As a reviewer, I want a Review focus list of `file:line — reason` in reading order, so that I know where to start.
9. As a reviewer, I want to click a Review focus item and land on Files changed at that file, so that I go straight to the code.
10. As a reviewer, I want the diff to expand that file and scroll to the line when the line is known, so that I do not hunt for it.
11. As a reviewer, I want an item whose line could not be verified to show only the file, so that I am never sent to a wrong line.
12. As a reviewer, I want Intent and Blast radius shown beside the summary, so that the whole picture is on one card.
13. As a reviewer, I want the Brief to say explicitly when Intent or Blast radius data is missing, so that I know what it was built without.
14. As a reviewer, I want the Brief to still generate when Intent or Blast radius is missing, so that a partially analysed PR is still useful.
15. As a reviewer, I want every file in Risk areas and Review focus to really be in the PR or its Blast radius, so that I can trust the paths.
16. As a reviewer, I want unverifiable items dropped rather than shown, so that no invented path reaches me.
17. As a reviewer, I want the same Brief after reloading the page, so that I do not pay for regeneration.
18. As a reviewer, I want a refresh button that regenerates the Brief, so that I can get a new one on demand.
19. As a reviewer, I want a stale marker when the PR head commit changed since generation, so that I do not trust an outdated Brief.
20. As a reviewer, I want stale Briefs never to regenerate on their own, so that no model cost happens without my action.
21. As a reviewer, I want the verdict and PR score of the latest review above the summary when a review exists, so that the card shows the current state.
22. As a reviewer, I want "no notable risks" shown when nothing survives verification, so that an empty list is not mistaken for a failure.
23. As a reviewer, I want a clear error with a retry when generation fails, so that a failure does not leave a broken card.
24. As a workspace admin, I want the Brief to use the model I chose for Risk Brief in Settings, so that cost and quality are under my control.
25. As a workspace admin, I want generation to be exactly one model call with a bounded input, so that cost is predictable.
26. As a security-conscious user, I want the PR description, Intent and attached specs treated as untrusted data, so that text in them cannot steer the model.
27. As a security-conscious user, I want diff hunk bodies never sent to the model, so that code in the diff cannot inject instructions.
28. As a repo owner, I want the specs attached to my agents to inform the Brief, so that risks reflect my project's rules.

## Implementation Decisions

- **Terms** follow `CONTEXT.md` (PR Brief, Risk area, Review focus, Missing data, stale) and the decision in ADR-0004.
- **New backend module** for the Brief, in the same shape as the Onboarding Tour module: routes, service, repository, prompt building and result verification. It composes existing capabilities (intent lookup, Blast radius, Smart Diff roles, Project Context attachments, feature-model resolution, structured LLM completion) rather than duplicating them.
- **API:** read the current Brief (with a `stale` flag, or an empty result when none exists) and generate/regenerate it. Regenerate overwrites the single stored Brief.
- **Contract:** the composed Brief gains `summary` and `review_focus` (`file`, optional `line`, `reason`, max 5) in **both** copies of the shared contract, identical. Risks are capped at 5, each with at least one verified file. The stored snapshot also records the head commit SHA, generation time and which of Intent/Blast were missing. The model's own output schema is only `summary`, `risks`, `review_focus`.
- **Storage:** the existing Brief table (PR id + JSON). The commit SHA lives inside the JSON; no schema migration.
- **Model input** (computed facts only): PR title and description, Intent, Blast radius summary and top callers (capped), the PR's files with additions/deletions and Smart Diff role, changed line **ranges** per file, existing finding lines, and attached specs. Specs are the deduplicated Attachments of the repo's enabled agents and their linked skills, read from the base branch, with per-document and total size caps. An overall input budget of about 6,000 estimated tokens applies. Diff hunk bodies are never included.
- **Trust:** PR description, Intent and specs are delimiter-wrapped as untrusted data; no quarantine step.
- **Model call:** exactly one structured completion; model resolved from the Risk Brief feature setting, never hardcoded. Internal schema-validation retries count as the same call.
- **Verification after the call:** a risk or focus item whose file is not in the PR's files or the Blast radius callers is dropped; a risk with no remaining file is dropped; a `line` outside the changed ranges of its file is cleared and the item keeps only its file. The model is never re-asked.
- **Missing data:** absence of Intent or Blast radius is recorded, told to the model as "not available", and shown on the card.
- **Staleness:** Brief head SHA ≠ PR head SHA ⇒ stale; display only.
- **Overview UI:** a PR Brief card with empty state + Generate brief, generating and error states, refresh, stale badge, missing-data notice, Intent and Blast radius side by side, the existing verdict banner reused when a review exists, Risk areas with severity-coloured icons and expandable explanations, Review focus list. "Prior PRs touching these files" is not part of this card.
- **Navigation:** Review focus links open the Files changed tab with the file (and line, if verified) in the URL; the diff tab reads them, expands that file and scrolls to the line. A missing line or file falls back to just opening the tab.
- **Copy:** labels come from the existing brief message catalogue, extended with the new strings.

## Testing Decisions

- A good test asserts external behaviour only: what the API returns / what the user sees and can click — not internal helpers, prompts' exact wording, or call ordering.
- **Seam 1 — server HTTP routes** with the mocked LLM adapter and a real-Postgres integration test, following the existing per-workflow integration tests and the mocks used across the server. Cases: no Brief → empty; generate → stored and returned; reload returns the same without a model call; regenerate replaces it; exactly one model call per generation; invented paths dropped; out-of-range line cleared; risk with no valid file dropped; Intent/Blast absent → still generated with `missing` set; new head SHA → `stale`; model comes from the Risk Brief setting; no hunk bodies in the model input.
- **Seam 2 — client component** for the Overview Brief card (React Testing Library, mocked `fetch`), following the Onboarding Tour view test: empty → Generate → Brief shown; refresh; stale badge; missing-data notice; error + retry; clicking a Review focus item navigates to the Files changed tab with file and line.
- No unit tests of internal functions and no e2e in this spec (chosen seams: route + Overview UI).

## Out of Scope

- Prior PRs touching these files (P3 from L04).
- Brief history/versions; automatic regeneration on new commits.
- Letting the model read diff hunks; verifying that a line's content matches the reason.
- Exposing the Brief over MCP/CI or injecting it into agent prompts.
- Brief for PRs on repos without a local clone beyond what Intent/Blast already provide.

## Further Notes

- "Exactly one call" is one logical structured completion; its internal validation retries are not counted (ADR-0004).
- Deliverables outside the code, per the assignment: spec and plan committed before the feature code, a cross-model review note in the PR description, and a plan-verifier report attached to the PR.
- The line the model gives is only a hint, since it never sees code; the server decides whether it is shown.
