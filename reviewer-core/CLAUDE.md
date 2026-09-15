# reviewer-core — CLAUDE.md

`@devdigest/reviewer-core` — pure review engine: diff → prompt → LLM →
findings. No port, no HTTP — called by the server.

## Stack
- Plain TypeScript (no framework), `tsx` for scripts
- TypeScript 5.7, Vitest 2
- Zod 3, `openai` SDK (LLM calls via an OpenAI/OpenRouter-compatible API)

## Commands
- `pnpm test` — `vitest run --passWithNoTests`
- `pnpm typecheck` / `pnpm build` (both are `tsc --noEmit`, no build output)

## Map
- `src/llm/` — LLM providers
- `src/review/` — diff + repo map → prompt → LLM pipeline
- `src/output/` — validates findings against the diff (grounding gate),
  structured results

## Non-default conventions
- Pure functions: no side effects, no direct DB/HTTP/filesystem access —
  everything (diff, repo map, LLM client) is injected by the server

## Read when
- Review pipeline diagram → `README.md`
- Feature/behavior specs → `specs/`
- Non-deterministic observations from working on this module → `INSIGHTS.md`
- Full end-to-end architecture → root `../README.md`
