# 07: Refresh, stale marker and error handling

**What to build:** The reviewer can press a refresh button to generate the Brief again, replacing the stored one. When the PR's head commit differs from the one the Brief was generated for, the card shows a stale marker; it never regenerates by itself. While generating the card shows progress, and a failed generation shows a clear error with a retry, leaving any previous Brief in place.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Refresh regenerates and replaces the stored Brief
- [ ] New head commit → stale marker; no automatic regeneration
- [ ] Generating and error-with-retry states; a failure keeps the previous Brief
- [ ] Route tests (regenerate, stale flag) and component tests (refresh, stale, error)
