# 01 — Generate and store a Tour with deterministic sections

Status: done
Blocked by: none
Spec: ../spec.md

## What to build

The thinnest end-to-end server slice. A new "onboarding tour" module with a shared Tour contract and a DB migration (one row per repo). Two routes: read the current Tour (empty result when none) and generate/regenerate. Generation fills only the deterministic sections — **Critical paths** (ranked by dependents from the dependency graph, with dependents count and one-line role) and **How to run locally** (commands found in package manifests, compose file, README). The other three sections are stored as "not generated" placeholders for ticket 03. Generation is refused with a clear error when the repo index is not `ready`. Regenerate overwrites the row.

## Acceptance criteria

- [x] Reading a Tour for a repo with none returns an empty result, not an error.
- [x] Generating stores exactly one Tour per repo; generating again replaces it.
- [x] Critical paths are ordered by dependents count and include that count (spec AC-5).
- [x] Run commands come only from repo files; nothing is invented (AC-6).
- [x] Generating while the index is not `ready` is refused with a clear reason (AC-2).
- [x] Server integration test on real Postgres covers the above through the HTTP routes (primary seam).
- [x] Migration included; API does not migrate on boot.

## Comments

- Reused the existing, previously unused `onboarding` table (`repo_id` PK, `json`, `generated_at`) — **no migration needed**. Index commit, file count and partial flag live inside the jsonb Tour.
- Run commands come from `package.json` (+ lockfile → package manager), `.env.example`, compose file. **README is not parsed** (kept simplest); revisit if wanted.
- Critical paths: candidates from `getTopFilesByRank`, re-ranked by `file_edges` dependents; files with zero dependents are dropped; `role` is `null` (nothing fills it yet — ticket 03 may).
- Contract added as `OnboardingTour` in `contracts/onboarding.ts`, copied to `client/src/vendor/shared` (the two vendor copies already differed before this work).
