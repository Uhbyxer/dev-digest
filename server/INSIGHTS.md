# Insights — server

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
- `ReviewRepository.completeAgentRun` (`src/modules/reviews/repository.ts`) redeclares its own inline `values` object type instead of importing it from `src/modules/reviews/repository/run.repo.ts`'s `completeAgentRun` — adding a field to one and not the other typechecks as a duplicate-but-unrelated-type error only at the call site in `run-executor.ts`, not where you'd expect. When changing that function's params, update both.
- GitHub's `linked_issue` (resolved by `OctokitGitHubClient.resolveLinkedIssue`) is only ever attached to the in-memory `PrDetail` returned from `getPullRequest` — it is NOT persisted anywhere (no `linked_issue` column on `pull_requests`, no separate table). Any service running later (e.g. during a review run, off `PullRow`) that wants the linked ticket body has to re-fetch it via `container.github()` + re-derive the issue number itself; it cannot read it back off the PR row. `pr_commits`/`pr_files`, by contrast, ARE persisted and can be queried directly (see `pulls/routes.ts`'s `GET /pulls/:id` fallback path).
- New "best-effort adapter, mockable via container" additions (e.g. `container.linkedDocFetcher()`) follow the same shape as `repoIntel`/`depgraph`/`tokenizer`: a small interface, a lazy-constructed default field, an `overrides.<name>` on `ContainerOverrides`, and a matching `Mock<Name>` class added to `adapters/mocks.ts` — even when the interface has exactly one method.
- `OctokitGitHubClient.resolveLinkedIssue` (the `#123`/`closes #123` regex + `getIssue` call) is a *private* method, not part of the `GitHubClient` interface — a service that needs to re-resolve a linked issue later (e.g. `intent/service.ts`) cannot call it directly and must re-implement the same regex locally, then call the public `github.getIssue(repo, n)` through `container.github()` (wrapped in try/catch — `container.github()` throws `ConfigError` when no token is configured, and this must stay best-effort, non-blocking enrichment).
- Services under `src/modules/**` must never import `drizzle-orm` or touch `container.db`/`t.<table>` directly for queries — even a single-line `select ... where` — that belongs in the module's `repository/*.repo.ts` file as a named function (e.g. `getCommitMessages(db, prId)` in `reviews/repository/pull.repo.ts`), mirroring `ConventionsService`, which only ever calls `this.repo`/`this.reposRepo`.

## Tool & Library Notes
- Unit-testing a service like `intent/service.ts` that only receives `Container` needs a fake `container.db` chain, not a real Drizzle instance — build `{ select: () => ({ from: (table) => ({ where: () => Promise.resolve(rowsFor(table)) }) }), insert: (table) => ({ values: (v) => ({ onConflictDoUpdate: () => { capture(table, v); return Promise.resolve(); } }) }) }` and branch on table identity (`table === t.settings` etc., imported from `../../db/schema.js`) to return the right fixture per call site (`resolveFeatureModel` reads `t.settings`, `getCommitMessages` reads `t.prCommits`, `upsertIntent` writes `t.prIntent`) — no testcontainers needed for a pure-mock unit test.
- `fetcher.ts`'s hard `AbortController` timeout (real `setTimeout`, not injectable) makes its timeout test take the full 5s wall-clock unless you `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(5_000)` around the pending promise before awaiting it — a plain `await fetchLinkedDoc(...)` with real timers actually sleeps 5s per test.
- `fetcher.ts`'s original SSRF guard (`isUrlAllowed`) resolved `url.hostname` via `dns.lookup()` to validate against the private/loopback blocklist, then called global `fetch(url, ...)` with the bare hostname — but Node's built-in `fetch` (backed by an internal undici) does its OWN independent DNS resolution when opening the socket, so a DNS-rebinding attacker can answer the validation lookup with a safe public IP and the real connection's lookup with a private one (e.g. `169.254.169.254`), bypassing the check per-hop. Fix: resolve once (`resolveAllowedAddresses`), then build a per-request `undici.Agent` (added as an explicit `undici` dependency — it's not resolvable as a bare import even though it's Node's fetch backend, since Node doesn't expose its internal copy) whose `connect.lookup` option is a closure that always returns the pre-validated addresses, ignoring whatever hostname/options the connector passes it — `Host` header and TLS SNI are untouched since `lookup` only affects which IP the socket dials. Pass it via `fetch(url, { dispatcher: agent })`; `dispatcher` is an undici-specific extension to `RequestInit` that Node's global `fetch` honors.
- Passing an `Agent` constructed from the explicit `undici` npm dependency as `fetch`'s `dispatcher` option fails `tsc` even though it works correctly at runtime: `@types/node`'s global `fetch` typings source their `Dispatcher`/`RequestInit['dispatcher']` type from a separate, pinned `undici-types` package, which is structurally close but not identical to the actual installed `undici` package's types (deep mismatches appear in nested fields like `FormData`). Cast at the call site — `dispatcher: dispatcher as unknown as NonNullable<RequestInit['dispatcher']>` — rather than trying to satisfy the structural type; there's no version of the two type packages that will make this align exactly.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
