# Insights — client

Append-only. Read the relevant section(s) before starting work in this
module; add an entry here only if something substantial and not already
recorded was learned this session. Never rewrite or delete existing entries
— if something is superseded, add a new entry noting that.

Once an observation becomes a stable rule, don't leave it here: move it to
`CLAUDE.md` (if it's a map fact) or a skill/slash command (if it's a
process).

## What Works

## What Doesn't Work

## Codebase Patterns
- `@devdigest/ui`'s `SectionLabel` takes a `right` prop (`React.ReactNode`, right-aligned via `marginLeft: auto`) — use it to place a status `Badge` next to a section header instead of adding custom flex markup (see `IntentPanel`).
- The vendored `client/src/vendor/shared/contracts/*.ts` files are meant to be byte-identical mirrors of `server/src/vendor/shared/contracts/*.ts` (not hand-ported field-by-field) — when a shared contract changes, `cp` the server file over the client one rather than re-typing the diff, to guarantee they don't drift.

## Tool & Library Notes

## Recurring Errors & Fixes
- A test asserting "renders nothing when a query resolves to X" via `waitFor(() => expect(fetch).toHaveBeenCalled())` + `toBeEmptyDOMElement()` is a false positive if the component also renders `null` before the query resolves (e.g. `if (!intent) return null` covers both `data: undefined` and `data: null`) — it can't tell "not loaded yet" from "loaded and correctly empty." Fix: render with a locally-created `QueryClient` (return it from your render helper alongside the RTL result), then `await waitFor(() => expect(qc.getQueryState(["your-query-key", ...args]))?.status).toBe("success"))` before asserting DOM emptiness — this proves the query actually reached a resolved state, not just that `fetch` fired. See `IntentPanel.test.tsx`'s `["pr-intent", prId]` key (from `useIntent` in `src/lib/hooks/core.ts`).

## Session Notes

## Open Questions
