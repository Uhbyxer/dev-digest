---
name: onion-architecture
description: "Enforces Onion Architecture (a.k.a. Hexagonal/Ports-and-Adapters/Clean Architecture) for this repo's backend modules — reviewer-core (the pure domain core) and server/ (Fastify + Drizzle + Zod). Use when writing or reviewing backend code that touches reviewer-core/src/**, server/src/modules/**, server/src/adapters/**, server/src/platform/container.ts, or server/src/db/**; when deciding whether a new dependency (fs, a DB driver, fetch/undici, an SDK, a Fastify type) belongs in reviewer-core; when adding or changing a Drizzle query, a repository function, or an adapter interface in server/; when adding a new HTTP route and deciding what Zod validates and where; or when the user asks whether something 'belongs in the domain', 'leaks infrastructure', 'needs a port/interface', or is 'architecturally clean'. Grounded in primary sources (Jeffrey Palermo's original Onion Architecture posts, Microsoft's Clean Architecture guidance, official Fastify/Drizzle/Zod docs) plus well-known practitioner writeups (Herberto Graça, Victor Rentea, Allegro Tech) — every claim is cited in references/ and the research doc it's built from. This is enforcement guidance for review/authoring, not a lint rule — it does not block builds."
---

# Onion Architecture

Keeps dependencies pointing inward: the business logic in `reviewer-core`
and the persistence/orchestration logic in `server/` must never depend on
infrastructure — infrastructure depends on them, not the other way around.
Every rule below traces to a cited source in [README.md](README.md) or the
original research at `docs/research/onion-architecture.md`.

**Scope decisions already made for this repo** (don't re-litigate these —
they were decided deliberately, see `docs/research/onion-architecture.md`
§8 for the reasoning):

- This skill enforces **existing boundaries**, not build-time boundaries.
  There is no ESLint import-boundary rule backing this — it's review-time
  guidance only. If you find repeated violations, that's a signal to
  reconsider this decision, not to silently add lint config.
- `reviewer-core` is treated as the pure **domain core** already. `server/`
  is **not** pushed to extract a separate `domain/` folder —
  `server/src/modules/<feature>/service.ts` is legitimate
  application/orchestration layer as long as it stays behind the seams
  described below (repository functions, adapter interfaces, Zod
  contracts). Don't suggest extracting a `domain/` folder in `server/`;
  suggest moving genuinely pure, reusable logic into `reviewer-core`
  instead.

## The one rule everything else follows

**Dependencies point inward only.** Code closer to the domain can't depend
on code further out. Concretely in this repo: `reviewer-core` depends on
nothing infrastructural; `server/src/modules/*/service.ts` depends on
repository/adapter *interfaces*, never on `drizzle-orm`, a DB driver, or a
third-party SDK directly; only `server/src/platform/container.ts` (the
**composition root**) and the adapter implementations themselves are
allowed to import concrete infrastructure.
([Jeffrey Palermo: Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/);
see [references/fundamentals.md](references/fundamentals.md))

## Quick decision guide

| Question | Default answer | Details |
|---|---|---|
| Can I add `fs`, `pg`/`postgres`, `fetch`/`undici`, or a Fastify import inside `reviewer-core/src/**`? | **No.** `reviewer-core` must stay a pure function library — everything (LLM client, diff, repo map) is injected by the caller. | [references/reviewer-core-purity.md](references/reviewer-core-purity.md) |
| I need to run a Drizzle query in a service. | Add/extend a function in `server/src/modules/<feature>/repository/*.repo.ts`. Never call `db`/`drizzle-orm` operators directly from `service.ts` or `routes.ts`. | [references/server-boundaries.md](references/server-boundaries.md) |
| I need to call a new external system (an API, the filesystem, a new SDK) from `server/`. | Define an interface in `@devdigest/shared` (or alongside the adapter), implement it in `server/src/adapters/<name>/`, wire the concrete implementation into `server/src/platform/container.ts`. `service.ts` depends on the interface only. | [references/server-boundaries.md](references/server-boundaries.md) |
| Do I need a new interface/port for this adapter? | Only if it has >1 implementation, protects an inner ring via dependency injection (e.g. so tests can swap it via `ContainerOverrides`), or ships as a client library. A single-implementation interface used for DI/testability is still justified — don't flag it as overengineering on its own. | [references/server-boundaries.md](references/server-boundaries.md) |
| Where does request validation go? | A Zod schema at the Fastify route boundary (`routes.ts`), parsed once. Everything inward trusts the resulting type — no re-validating deeper in the call stack. | [references/server-boundaries.md](references/server-boundaries.md) |
| Business logic feels reusable/pure — where should it live? | If it truly has zero infra dependency (no DB, no HTTP, no FS), it belongs in `reviewer-core`, not a new `server/` domain folder. If it's orchestration (calling a repo, then an adapter, then shaping a response), it stays in `modules/<feature>/service.ts`. | [references/reviewer-core-purity.md](references/reviewer-core-purity.md) |
| Fastify plugin needs to share something across routes. | `fastify.decorate()` for stateless services/config; never decorate with a mutable object shared across requests (`decorateRequest`/`decorateReply` must be per-request). Use `fastify-plugin` only for genuinely cross-cutting things (DB client, config) that must break encapsulation on purpose. | [references/server-boundaries.md](references/server-boundaries.md) |

## How to use this when reviewing or writing code

1. **Identify which ring the file you're touching belongs to** before
   judging it: `reviewer-core/src/**` is the domain core; `server/src/db/schema/**`
   and `server/src/adapters/**` are infrastructure; `server/src/modules/*/repository/*.repo.ts`
   is the persistence seam; `server/src/modules/*/service.ts` is
   application/orchestration; `server/src/modules/*/routes.ts` and
   `server/src/platform/container.ts` are the outermost ring (HTTP +
   composition root).
2. **Check the direction of the new import, not just its existence.** An
   inward file (domain/application) importing an outward concrete type
   (a DB driver, an SDK, `fastify`) is the violation to flag — the reverse
   direction (an adapter importing a domain interface to implement it) is
   correct and expected.
3. **`reviewer-core` gets the strictest, most mechanical check**: scan any
   new import in `reviewer-core/src/**` for `fs`, `path` (filesystem),
   `pg`/`postgres`, `fetch`/`undici`/any HTTP client, or `fastify` — these
   should never appear there. See
   [references/reviewer-core-purity.md](references/reviewer-core-purity.md).
4. **`server/` gets a judgment check, not a mechanical one** — the seams
   (repository functions, adapter interfaces, the container, Zod contracts)
   already exist in this codebase; the job is noticing when new code
   bypasses them (e.g. a raw `db.select()` inside `service.ts`, or a new
   SDK call inline in a route handler instead of behind an adapter). See
   [references/server-boundaries.md](references/server-boundaries.md).
5. **Don't invent stricter layering than this repo has adopted.** No
   `domain/` folder inside `server/`, no requirement for Palermo's full
   four-ring split, no DTO-per-layer duplication. Apply Victor Rentea's
   overengineering test before suggesting a new interface/port — see
   [references/fundamentals.md](references/fundamentals.md).

## Sources

Every claim is cited inline in the reference files. Full source list in
[README.md](README.md). Original research (including the "what's already
in place vs. what's missing" analysis this skill's scope decisions came
from) is at `docs/research/onion-architecture.md` in this repo.
