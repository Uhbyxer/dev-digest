# mcp — CLAUDE.md

`@devdigest/mcp` — MCP server (stdio) that exposes dev-digest's review
pipeline as tools for an MCP-capable coding agent. No port: it talks stdio,
not HTTP.

## Stack
- `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`)
- TypeScript 5.7, `tsx` for dev, Vitest 2
- Zod 3, `dotenv`
- Testcontainers (`@testcontainers/postgresql`) for integration tests

## Commands
- `pnpm dev` — run the server over stdio (`tsx src/index.ts`)
- `pnpm build` / `pnpm start` — compile to `dist/` and run `dist/index.js`
- `pnpm inspect` — open the MCP Inspector against the server
- `pnpm test` — `vitest run`; `*.it.test.ts` need Docker (testcontainers)
- `pnpm typecheck`

## Map
- `src/index.ts` — stdio entrypoint
- `src/register.ts` — registers the tools on the server
- `src/tools/` — one file per tool (`list_agents`, `run_review`,
  `get_findings`, `get_conventions`, `get_blast_radius` — the last is a
  `not_implemented` stub with its final schema)
- `src/resolvers/` — `owner/name` + PR number (or a GitHub PR URL) →
  dev-digest's internal repo/PR/agent ids
- `src/platform/context.ts` — builds the server's `Container` (same
  composition root as the API)
- `test/` — unit (`*.test.ts`) and integration (`*.it.test.ts`) tests

## Gotchas
- Needs Postgres up **and migrated** (`cd ../server && pnpm db:migrate`);
  it does **not** need the API (`:3001`) or web (`:3000`) dev servers
- `run_review` needs the LLM provider key(s) your Agents use
  (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) plus
  `DATABASE_URL`, copied from `server/.env`
- A review started here runs in **this** process, so the studio's live
  SSE feed (`container.runBus`, in-memory per process) does not show it
  while running — cosmetic; the findings land in the same Postgres once done
- An unknown repo/PR returns an error naming the missing step (add the
  repo / import the PR) — the tools never clone or import automatically

## Non-default conventions
- Code from other packages comes in through tsconfig path aliases, not
  published modules: `@devdigest/shared`, `@devdigest/reviewer-core`, and
  `@devdigest/server/*` (the server's `src/`)

## Read when
- Tool list, setup, MCP client wiring → `README.md`
- Full end-to-end architecture, testing strategy → root `../README.md`,
  `../TESTING.md`
