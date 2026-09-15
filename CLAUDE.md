# dev-digest — CLAUDE.md

Local-first AI pull-request review. Not a monorepo workspace — 4 independent
packages, each with its own `package.json`/lockfile; shared code goes through
tsconfig path aliases, not published modules.

## Stack
- Node ≥ 22, pnpm ≥ 10, Docker (Postgres/pgvector only — API and web run
  on the host via `pnpm dev`)

## Packages
| Folder           | Package                     | What it is                            | Port |
|------------------|------------------------------|----------------------------------------|------|
| `server/`        | `@devdigest/api`            | Fastify API + Drizzle/Postgres        | 3001 |
| `client/`        | `@devdigest/web`            | Next.js 15 web app (the studio)       | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core`  | Pure review engine                    | —    |
| `e2e/`           | `@devdigest/e2e`            | Deterministic browser e2e             | —    |

## Commands
- `./scripts/dev.sh` — Postgres + migrations + seed + API + web, from zero
- `docker compose up -d` — Postgres only
- `cd server && pnpm db:migrate` — the server does **not** migrate on boot

## Gotchas
- Port `5432` already in use by another Postgres → change the host port in
  `docker-compose.yml`
- `relation ... does not exist` on first run → forgot `pnpm db:migrate`
- Reset everything → `docker compose down -v` + `./scripts/dev.sh`

## Do-not-touch
- `server/clones/**` — cloned user repositories for `repo-intel`, generated
  at runtime

## Read when
- Working inside a specific package → its `<package>/CLAUDE.md`
- Full end-to-end flow architecture (add repo → index → import PR → review) →
  `README.md#architecture`
- Testing strategy (unit/integration/e2e, CI workflows) → `TESTING.md`
- Course scope: what's already in the starter vs what each lesson adds →
  `README.md#what-you-build-in-the-course`
