# Insights — reviewer-core

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
- New pure feature modules (e.g. `src/intent/`) follow the `src/conventions/` split exactly: `schema.ts` (Zod shapes + `*_SCHEMA_NAME` constants), `prompt.ts`/`*-prompt.ts` (pure `ChatMessage[]` builders using `wrapUntrusted` from `../prompt.js`), plus a barrel `index.ts` re-exported from the top-level `src/index.ts`. Deterministic non-LLM logic (e.g. confidence/provenance scoring) also belongs here as a pure function, not in the server — keeps it unit-testable without mocking an LLM.

## Tool & Library Notes
- `@devdigest/shared` types (e.g. `IntentSource`, `IntentConfidence`) are importable directly in reviewer-core via the `@devdigest/shared` tsconfig path alias (`reviewer-core/tsconfig.json` maps it to `../server/src/vendor/shared/index.ts`) — no need to duplicate enum-like union types locally.
- Despite the plan doc saying `reviewer-core/src/intent/*.test.ts`, this repo's actual reviewer-core test convention is a flat, non-colocated `reviewer-core/test/` directory (see `test/conventions.test.ts`, `test/prompt-skill-trust.test.ts`) — new intent tests were added there as `test/intent-confidence.test.ts`, `test/intent-link-detection.test.ts`, `test/intent-prompt.test.ts`, `test/intent-schema.test.ts` to match, importing from `../src/intent/index.js`.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
