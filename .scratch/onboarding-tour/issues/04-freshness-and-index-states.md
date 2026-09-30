# 04 — Stale badge, partial-index banner, Regenerate

Status: done
Blocked by: 01, 02
Spec: ../spec.md

## What to build

Make the Tour honest about its freshness. The server reports whether the Tour is stale (its index commit differs from the current index) and whether it was built from a partial index. The page shows a stale badge and a "built from partial index" banner, and a header **Regenerate** action that replaces the Tour. Nothing ever regenerates automatically.

## Acceptance criteria

- [x] Stale badge appears when the index is newer than the Tour; no automatic regeneration (AC-9).
- [x] Partial index shows the banner; generation is still allowed (AC-13).
- [x] Regenerate replaces the Tour and updates the refresh time (AC-3).
- [x] Server integration test covers stale and partial flags; client test covers badge, banner and Regenerate.

## Comments

- `GET` now returns `{ tour, stale }`; `stale` = current index `lastIndexedSha` differs from the Tour's. `POST` returns `stale: false`. Display only.
- Regenerate was already in the header from ticket 02; this ticket added its test plus the stale badge and partial-index banner.
