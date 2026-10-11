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
- Diff deep links (`?tab=diff&file=&line=`): `parseDiffTarget` (`components/diff-viewer/target.ts`) → `DiffTab target` → `SmartDiffViewer`/`DiffViewer` → `FileCard`, which force-opens and `scrollIntoView`s `[data-new-line]`; jsdom has no `scrollIntoView`, so tests must stub `Element.prototype.scrollIntoView`. The PR Brief card receives Intent/Blast panels as an `aside` slot and must render it in every state, or those panels vanish before a Brief exists.

- Multi-Agent Review (`src/app/multi-agent-review/`): the read endpoint `GET /pulls/:id/multi-agent` is PR-scoped, so the results route is `/multi-agent-review/[multiRunId]?pr=<prId>` (helper `resultsHref`). A failed `AgentColumn` carries its error text in `summary` (server maps run.error there), there is no `error` field. Global nav items use an href without `:repoId` (`resolveHref` passes it through); `activeKeyFor` already maps `/multi-agent*` to key `multi-agent`.
- `@devdigest/ui` `Checkbox`/`Toggle` give no way to right-align siblings or add an accessible name; for rows needing layout/labels use a native `<input type="checkbox">` in a `<label>` and a `role="switch"` button.
- Export to CI: `messages/en/ci.json` and the `ci-runs` nav key/`activeKeyFor` entry predate the feature; the sidebar NAV lives in `src/vendor/ui/nav.ts` (not `app-shell/constants.ts`), so a new sidebar item is added there (plus `shell.json` `nav.<key>`). `pnpm typecheck` can fail only on stale `.next/types/validator.ts` for a brand-new route until `next dev/build` regenerates it.

## Tool & Library Notes
- `@testing-library/user-event` is NOT installed in client; write RTL tests with `fireEvent` (use `fireEvent.change` on textareas). Importing user-event fails at vite import-analysis.
- `messages/en/context.json` predates the Project Context feature (old spec-file strings, `useContextFiles` in `hooks/core.ts` is unused legacy); new feature keys were added alongside. Tests rendering `SkillEditorModal` now need `context` messages in the provider (it has a Context tab).
- Export Wizard / CiTab RTL tests: stub global `fetch` with a path router (real React Query hooks, `QueryClientProvider` + `NextIntlClientProvider messages={{ ci }}`). The repo `TextInput` has a `list` attr so its role is `combobox` (query `getByLabelText`, not `textbox`); after changing triggers the Continue button is disabled until the regenerated preview loads, so `waitFor(...toBeEnabled())` before advancing; stub `URL.createObjectURL` and spy `HTMLAnchorElement.prototype.click` for the zip download.

## Recurring Errors & Fixes
- A test asserting "renders nothing when a query resolves to X" via `waitFor(() => expect(fetch).toHaveBeenCalled())` + `toBeEmptyDOMElement()` is a false positive if the component also renders `null` before the query resolves (e.g. `if (!intent) return null` covers both `data: undefined` and `data: null`) — it can't tell "not loaded yet" from "loaded and correctly empty." Fix: render with a locally-created `QueryClient` (return it from your render helper alongside the RTL result), then `await waitFor(() => expect(qc.getQueryState(["your-query-key", ...args]))?.status).toBe("success"))` before asserting DOM emptiness — this proves the query actually reached a resolved state, not just that `fetch` fired. See `IntentPanel.test.tsx`'s `["pr-intent", prId]` key (from `useIntent` in `src/lib/hooks/core.ts`).

## Session Notes

## Open Questions
- Multi-Agent Review start errors: `mutateAsync` rejections must be caught in the component (`startErrorKey(err)` in `app/multi-agent-review/helpers.ts` -> `startError.<key>` i18n); `?pr=<id>` deep links outside the active repo resolve through `usePullDetail(id)` (GET /pulls/:id), so tests mocking `@/lib/hooks/core` must also mock `usePullDetail`.
