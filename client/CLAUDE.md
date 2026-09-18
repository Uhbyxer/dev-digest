# client — CLAUDE.md

`@devdigest/web` — Next.js 15 web app (the studio). Port `:3000`.

## Stack
- Next.js 15 (App Router), React 19
- TypeScript 5.7, Vitest 2 + jsdom
- Zod 3, `@tanstack/react-query`, `next-intl` (i18n), `mermaid` (diagrams),
  `react-markdown`

## Commands
- `pnpm dev` — web on `:3000`
- `pnpm build` / `pnpm start`
- `pnpm test` — Vitest
- `pnpm typecheck`

## Map
- `src/app/` — routes (App Router)
- `src/components/` — UI components
- `src/lib/` — client-side logic, API calls
- `src/i18n/` + `messages/` — localization via `next-intl`
- `src/vendor/ui/` — third-party UI kit, not our code — see its own
  `src/vendor/ui/README.md`

## Non-default conventions
- UI strings go through `next-intl` (`messages/en/*`), not hardcoded in
  components

## Read when
- UI route map, screen diagram → `README.md`
- Feature/behavior specs → `specs/`
- Non-deterministic observations from working on this module → `INSIGHTS.md`
- Full end-to-end architecture, testing strategy → root `../README.md`,
  `../TESTING.md`
