# onion-architecture

Claude Code skill: enforces Onion Architecture (a.k.a. Hexagonal /
Ports-and-Adapters / Clean Architecture) for this repo's backend modules —
`reviewer-core` (the pure domain core) and `server/` (Fastify + Drizzle +
Zod). Scope is the **dependency-direction rule and this repo's existing
seams**, not a push toward a textbook four-ring folder structure or an
ESLint-enforced boundary — see the scope note at the top of `SKILL.md`.

Built from the research at `docs/research/onion-architecture.md` in this
repo, researched 2026-09-18. The core pattern (Palermo, 2008) is stable;
the library-specific claims (Fastify, Drizzle, Zod docs) are more
time-sensitive — re-verify version-specific claims before trusting them as
current.

## Layout

```
onion-architecture/
├── SKILL.md                          entry point + scope decisions + quick decision table
├── README.md                         this file — full source list
└── references/
    ├── fundamentals.md               the pattern itself, vocabulary, overengineering test
    ├── reviewer-core-purity.md       the mechanical check: reviewer-core must stay infra-free
    └── server-boundaries.md          composition root, Fastify encapsulation, Drizzle repos, Zod boundary
```

## Two scope decisions this skill embeds (don't re-litigate without reason)

1. **Enforcement mechanism: review-time guidance only, no ESLint boundary
   rule.** The alternative (an import-boundary lint rule like
   `eslint-plugin-boundaries`) was considered and deliberately not added —
   see `docs/research/onion-architecture.md` §8.1 for the tradeoff.
2. **`server/` is not pushed toward a dedicated `domain/` folder.**
   `reviewer-core` is treated as the pure domain core; `server/src/modules/*/service.ts`
   is legitimate application/orchestration layer as long as it stays behind
   the existing seams (repository functions, adapter interfaces via the
   container, Zod contracts). See `docs/research/onion-architecture.md` §8.2.

## Sources

### Primary / Official

- [Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) —
  the originating post: layer model, the dependency-inward rule, motivation
  (data access changes more than business logic).
- [Jeffrey Palermo: The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) —
  the interface/IoC mechanism that makes the inward-only rule work at
  runtime.
- [Microsoft Learn: Common web application architectures — Clean architecture](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) —
  explicit adoption of Onion/Hexagonal lineage for ASP.NET Core; the
  layer→type checklist and composition-root definition this skill's
  `container.ts` guidance is modeled on.
- [Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) —
  the plugin encapsulation model that makes a route handler architecturally
  the outermost ring.
- [Fastify docs: Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) —
  `fastify.decorate`/`decorateRequest`/`decorateReply` semantics, including
  the reference-type warning.
- [fastify/fastify-plugin (GitHub)](https://github.com/fastify/fastify-plugin) —
  the deliberate escape hatch for cross-cutting plugins.
- [Drizzle ORM docs: SQL Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration) —
  schema-file requirements (all models must be exported for `drizzle-kit`);
  no official layering guidance beyond this.
- [Zod docs: Basics](https://zod.dev/basics) —
  `.parse()`/`.safeParse()` semantics underpinning the boundary-validation
  guidance.

### Secondary / Community / Practitioner

- [Ayende @ Rahien: Onion Architecture](https://ayende.com/blog/3464/onion-architecture) —
  contemporary (2008) endorsement of Palermo's articulation from a
  well-known .NET architecture blogger; corroborates the pattern wasn't
  novel so much as well-named.
- [Herberto Graça: DDD, Hexagonal, Onion, Clean, CQRS... How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) —
  vocabulary reconciliation (Ports/Adapters mapped onto Onion's layers);
  the "don't mimic the tool's API" caution for port design.
- [Victor Rentea: Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/) —
  the three-part test for when an interface/port is justified; the "Middle
  Man" smell; the cost of duplicating persistence and domain models.
- [Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html) —
  the TS/JS-relevant enforcement problem (no compiler-level module
  boundary) and the two remedies; "when NOT to use this" guidance.
- [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) —
  originating source of "parse, don't validate"; the principle behind
  parsing once at the boundary instead of re-validating downstream.
- [Medium: Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) —
  community convention (not official Drizzle guidance) for isolating
  persistence behind repository functions.

### Not independently verified — flagged, not used as a claim

- A search snippet claiming Palermo's own original project abandoned Onion
  Architecture after ~6 months for not scaling was **not** confirmed
  against a primary source. Don't repeat it as fact; see
  `docs/research/onion-architecture.md` §7.5 if you want to chase it down
  further.
