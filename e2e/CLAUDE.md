# e2e — CLAUDE.md

`@devdigest/e2e` — deterministic browser e2e tests (`agent-browser`), no
LLM calls.

## Stack
- `agent-browser` (deterministic driver, no LLM)
- TypeScript 5.7, `tsx`

## Commands
- `pnpm test` — `tsx run.ts` (runs all scenarios from `specs/`)
- `pnpm e2e:hermetic` — `../scripts/e2e.sh` (brings up the full stack and
  runs the tests)
- `pnpm typecheck`

## Map
- `specs/` — test `.spec.ts` scenarios (Playwright-style; test files only,
  not documentation specs)
- `lib/` — scenario helpers
- `run.ts` — runner that collects and executes scenarios from `specs/`

## Gotchas
- Needs the full stack running (Docker + API + web) — see the `e2e-web.yml`
  workflow at the repo root
- No LLM calls — scenarios are deterministic, not model-dependent

## Read when
- Scenarios, e2e strategy → `README.md`
- Non-deterministic observations from working on this module → `INSIGHTS.md`
- Full end-to-end architecture, testing strategy → root `../README.md`,
  `../TESTING.md`
