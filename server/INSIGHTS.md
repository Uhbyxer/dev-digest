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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
