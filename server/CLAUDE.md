# server — CLAUDE.md

`@devdigest/api` — Fastify API + Drizzle/Postgres (pgvector). Port `:3001`.

## Stack
- Fastify 5, `@fastify/autoload`, `@fastify/cors`, `@fastify/helmet`
- Drizzle ORM + Postgres (pgvector extension)
- TypeScript 5.7 (`tsx` for dev/scripts, no build step in dev)
- Vitest 2, Zod 3 (shared contracts — `src/vendor/shared`)
- `@anthropic-ai/sdk`, `@ast-grep/napi` (for `repo-intel`)

## Commands
- `pnpm dev` — API on `:3001` (`tsx watch`)
- `pnpm db:migrate` — apply migrations (NOT run automatically on boot)
- `pnpm db:generate` — generate a migration from the drizzle schema
- `pnpm db:seed` — idempotent demo data
- `pnpm test` — unit; `pnpm exec vitest run --exclude '**/*.it.test.ts'` for
  unit-only, `pnpm exec vitest run .it.test` — integration (needs
  Postgres/testcontainers)
- `pnpm typecheck`

## Map
- `src/modules/` — feature domains (including `repo-intel` — the codebase
  indexer)
- `src/adapters/` — integrations with external systems (GitHub, LLM
  providers)
- `src/platform/` — infrastructure code (Fastify plugins, config)
- `src/prompts/` — system prompts for reviewer agents
- `src/vendor/shared` — `@devdigest/shared`, Zod contracts shared with
  client/reviewer-core
- `clones/` — **do-not-touch**: cloned user repositories for `repo-intel`,
  generated at runtime, never edit by hand

## Gotchas
- The server **does not migrate the DB on boot** — forget `pnpm db:migrate`
  → `relation ... does not exist`
- `*.it.test.ts` files need a live Postgres (testcontainers) — not hermetic
- The pgvector extension is enabled by migration `0000`

## Read when
- Detailed API map, module diagram → `README.md`
- Codebase indexer architecture → `src/modules/repo-intel/README.md`
- Feature specs → `specs/`
- Non-deterministic observations from working on this module → `INSIGHTS.md`
- Full end-to-end architecture, testing strategy → root `../README.md`,
  `../TESTING.md`
