# 04 — Stale badge, partial-index banner, Regenerate

Status: ready-for-agent
Blocked by: 01, 02
Spec: ../spec.md

## What to build

Make the Tour honest about its freshness. The server reports whether the Tour is stale (its index commit differs from the current index) and whether it was built from a partial index. The page shows a stale badge and a "built from partial index" banner, and a header **Regenerate** action that replaces the Tour. Nothing ever regenerates automatically.

## Acceptance criteria

- [ ] Stale badge appears when the index is newer than the Tour; no automatic regeneration (AC-9).
- [ ] Partial index shows the banner; generation is still allowed (AC-13).
- [ ] Regenerate replaces the Tour and updates the refresh time (AC-3).
- [ ] Server integration test covers stale and partial flags; client test covers badge, banner and Regenerate.
