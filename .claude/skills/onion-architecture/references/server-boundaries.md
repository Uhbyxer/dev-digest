# server/: the seams that already exist, and how to keep code behind them

`server/` (Fastify + Drizzle + Zod) doesn't have a textbook `domain/` folder
and isn't being pushed to grow one (see the scope note in
[SKILL.md](../SKILL.md)). It already has real onion/hexagonal seams;
this skill's job in `server/` is noticing when new code bypasses an
existing seam, not inventing new structure.

## The composition root: `server/src/platform/container.ts`

`container.ts` is the one file allowed to import both adapter interfaces
and their concrete implementations and wire them together — exactly the
composition-root role Microsoft's Clean Architecture guidance describes for
`Startup`/`Program.cs`: *"the UI project ... references the concrete types
defined in the Infrastructure project only in the composition root."*
([Microsoft Learn: Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures))

Concretely: `Container` holds config, `db`, and adapters behind interfaces
(`GitHubClient`, `LLMProvider`, `SecretsProvider`, `AuthProvider`,
`Embedder`, `CodeIndex`, imported as `type` from `@devdigest/shared`),
constructed once per app instance, with a `ContainerOverrides` mechanism so
tests can substitute mocks. Its own comment states the intent: *"Services
depend on these interfaces, not the concrete classes."*

**New external dependency checklist** (a new API, SDK, or filesystem
access needed from `server/`):

1. Define an interface for what the calling code actually needs (not a
   mirror of the SDK's own API — see Graça's caution in
   [fundamentals.md](fundamentals.md)).
2. Implement it in `server/src/adapters/<name>/`.
3. Wire the concrete implementation into `container.ts`.
4. `service.ts` / route handlers depend on the interface, injected via the
   container — never import the SDK/driver directly.

Before adding the interface, run Rentea's test (in
[fundamentals.md](fundamentals.md)): does it have >1 implementation, protect
an inner ring via DI (including testability via `ContainerOverrides`), or
ship as a client library? If yes to any, it's justified even with one
production implementation.

## Fastify: encapsulation is the outer-ring boundary, mostly for free

Fastify's **encapsulation context** governs what decorators/hooks/plugins a
route can see; child contexts inherit from parents but never the reverse.
([Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/))
This means a route handler is architecturally already the outermost ring —
nothing forces inner code to reach back into Fastify internals, since inner
code (services, repositories, `reviewer-core`) never receives the Fastify
`app`/`request`/`reply` objects at all.

- **`fastify.decorate(name, value)`** attaches shared services onto the
  server instance (a DI-container-like role) — official docs: for
  "attach[ing] a new method to the server instance" or config values, with
  an optional `dependencies` array so a missing dependency throws at boot,
  not at request time.
- **`decorateRequest`/`decorateReply`** do the same per-request, with an
  explicit warning against decorating with **reference types** (objects) —
  that "will impact all requests, potentially creating security
  vulnerabilities or memory leaks." Any per-request domain object must be
  constructed per-request, never shared via decoration.
  ([Fastify docs: Decorators](https://fastify.dev/docs/latest/Reference/Decorators/))
- **`fastify-plugin`** is the deliberate escape hatch that breaks
  encapsulation for the plugin it wraps — use it only for genuinely
  cross-cutting things (a DB client, config) that must be visible
  everywhere; plugins registered without it still get their own
  encapsulated context.
  ([Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/);
  [fastify/fastify-plugin](https://github.com/fastify/fastify-plugin))

In this repo, routes pull `container` off the Fastify app instance and
construct a service with it (e.g. `ReviewService` in
`modules/reviews/routes.ts`) — functionally Fastify's decorator mechanism
playing the composition-root role, with the container itself doing the
wiring rather than per-adapter `fastify.decorate` calls. Keep new routes
following this pattern: pull the container, construct/receive the service,
don't reach for a DB client or SDK directly in a route handler.

## Drizzle: keep it behind `*.repo.ts`

Official Drizzle docs are about schema/query syntax, not layering — there's
no official guidance on repository isolation. The one hard requirement:
**all models must be exported** so `drizzle-kit` can discover them for
migrations.
([Drizzle ORM docs: SQL Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration))

The repository-pattern convention — wrapping Drizzle queries in
per-resource functions so calling code never imports `drizzle-orm`
operators or `db` directly — is a **community convention**, not something
Drizzle's docs prescribe, but it's widely used specifically to "abstract the
data access layer from the business logic layer."
([Medium: Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) — secondary/community)

This repo already follows it: `server/src/db/schema/*.ts` holds table
definitions only; `server/src/db/rows.ts` exports inferred row types
(`$inferSelect`); query logic lives in
`server/src/modules/<feature>/repository/*.repo.ts` (e.g.
`review.repo.ts`, `pull.repo.ts`, `run.repo.ts`) — the only files that
should import `drizzle-orm` operators (`and`, `eq`, `desc`, `inArray`, etc.)
directly. Repo functions take a typed `Db` and return typed rows or shared
domain types, never raw Drizzle query builder objects. `service.ts` consumes
a repository (a class/module wrapping the repo functions), not `db`.

**Flag**: any `db.select()`/`db.insert()`/etc. or Drizzle operator import
appearing outside `db/` or a `*.repo.ts` file — most commonly a raw query
sneaking into `service.ts` or a route handler instead of going through the
repository.

## Zod: parse once, at the boundary

Zod's `.parse()` throws and returns "a strongly-typed deep clone of the
input" on success; `.safeParse()` returns a `{success, data}` /
`{success: false, error}` result instead of throwing.
([Zod docs: Basics](https://zod.dev/basics))

This is the mechanical form of Alexis King's **"Parse, don't validate"**:
a validator checks a condition and discards the evidence; a parser checks
the same condition but returns a more precise type that encodes the
guarantee, so downstream code never re-checks it. Her design principle:
**"Push the burden of proof upward as far as possible, but no further. Get
your data into the most precise representation you need as quickly as you
can."**
([Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/))

Applied here: a Zod schema at the Fastify route boundary
(`routes.ts`, via `fastify-type-provider-zod`'s `ZodTypeProvider`, or a
manual `Schema.parse(req.body)`) is the *parse* step — untyped JSON becomes
a typed, validated value exactly once, at the edge. Everything inward
(service, repository, `reviewer-core`) trusts the resulting type; don't
re-validate the same shape deeper in the call stack.

This repo's Zod contracts live in `server/src/vendor/shared/contracts/`,
shared across `server/`, `client/`, and `reviewer-core` — the shape of
domain-relevant data (`Finding`, `Review`, `RunEvent`, etc.) is defined once
and consumed as the common contract at every layer boundary, not only the
HTTP edge. Keep new domain-relevant types there rather than redefining an
ad hoc shape locally in a route or service.

**Flag**: a new route accepting a body/params/query without a Zod schema
attached, or the same shape re-validated with a second schema deeper in the
call stack instead of trusting the already-parsed type.
