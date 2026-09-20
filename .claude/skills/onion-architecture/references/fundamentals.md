# Fundamentals: what Onion Architecture is and how strict to be

## The core pattern

Jeffrey Palermo named Onion Architecture in a 2008 four-part blog series.
The structure: concentric layers with the **Domain Model** at the center
("only coupled to itself"), surrounded by Domain Services, then Application
Services, with Infrastructure/UI/Tests as the outermost layer.
([Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/))

The rule, in Palermo's own words: **"All code can depend on layers more
central, but code cannot depend on layers further out from the core."** His
stated motivation: data-access technology changes far more often than
business logic, so traditional layered (N-tier) architecture — where
everything transitively depends on the database — makes the most volatile,
least important layer the thing everything else is built on. Onion inverts
this: infrastructure becomes a plug-in detail at the outside; the domain
model is the stable center everything else depends on.
([Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/))

**Part 2** shows the mechanism: a controller depends only on interfaces
defined in the application core (e.g. `IConferenceRepository`); concrete
implementations live in outer layers and implement those interfaces. The
compile-time dependency points inward even though the runtime call flows
outward. An IoC container/composition root, wired at the app's entry point,
resolves and injects the concrete types. Palermo's summary: **"Remember that
all dependencies are toward the center."**
([Jeffrey Palermo: The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/))

## Microsoft's adoption (as "Clean Architecture") — a concrete layer→type checklist

Microsoft's own ASP.NET Core architecture guidance explicitly cites Palermo's
Onion Architecture (alongside Hexagonal/Ports-and-Adapters) as the lineage of
what it calls Clean Architecture: *"infrastructure and implementation
details depend on the Application Core... achieved by defining abstractions,
or interfaces, in the Application Core, which are then implemented by types
defined in the Infrastructure layer."* Its mapping, useful as a template:

- **Application Core**: entities, interfaces, domain services, custom
  exceptions/guard clauses.
- **Infrastructure**: ORM/migrations, repository implementations,
  infra-specific services.
- **UI**: controllers, middleware, and the **composition root** — the one
  place allowed to know about both the Application Core interfaces *and*
  the Infrastructure implementations, in order to wire them together.
([Microsoft Learn: Common web application architectures — Clean architecture](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures))

In this repo, `server/src/platform/container.ts` plays exactly the
composition-root role: it's the file allowed to import both adapter
interfaces and their concrete implementations and wire them together.
Nothing else should.

## Vocabulary: Onion, Hexagonal, Clean, Ports & Adapters

Herberto Graça's synthesis is the most-cited attempt to reconcile these
near-synonymous patterns: **"the Onion Architecture picks up the DDD layers
and incorporates them into the Ports & Adapters Architecture,"** and more
generally the shared principle across all of them is **"the direction of
dependencies is towards the centre."** His Hexagonal vocabulary maps onto
Onion's layers directly: *Ports* are interfaces owned by the application
core describing what it needs from the outside world; *Adapters* are the
outer-layer implementations — *Primary/Driving* adapters call into the app
(HTTP routes), *Secondary/Driven* adapters are called by the app (a
database, an external API).
([Herberto Graça: DDD, Hexagonal, Onion, Clean, CQRS... How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/))

His caution, worth carrying into any review: **"the Ports are created to fit
the Application Core needs and not simply mimic the tools APIs"** — don't
let an interface's shape be dictated by, say, Drizzle's or Octokit's API
surface. Shape it around what the calling code actually needs.
([Herberto Graça: DDD, Hexagonal, Onion, Clean, CQRS... How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/))

This skill uses "Onion Architecture" as its name (matching what the user
asked for) but treats Hexagonal/Ports-and-Adapters/Clean Architecture as the
same underlying rule under different names — don't treat a source using one
of the other terms as off-topic.

## When NOT to be strict: overengineering signals

Onion/Hexagonal works best for **complex, long-lived systems with rich
business logic**, and is a poor fit for small, purely technical services.
([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

Victor Rentea's test for when a new interface/port actually earns its keep —
apply this before suggesting a new abstraction:

> "An interface deserves to exist if and only if: (1) it has more than one
> implementation in the project, (2) it implements Dependency Inversion to
> protect an Inner Ring, or (3) it is packaged in a client library."

A single-implementation interface that exists purely so tests can substitute
a mock (e.g. via `ContainerOverrides` in this repo's `container.ts`)
satisfies criterion #2 — **that's a justified interface, not
overengineering**, even with one production implementation. Rentea also
warns against the **"Middle Man" smell** (forcing pass-through wrapper
methods across every layer with no added value) and against maintaining a
separate persistence model from the domain model "unless multiple delivery
channels exist" — calling that duplication "one of the most expensive
decisions" in a project.
([Victor Rentea: Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/))

## Why folder convention alone isn't enough (and why this skill doesn't try to be the only enforcement)

TypeScript/JS has no compiler-level module boundary the way Java/C# do.
Allegro's engineering blog names this directly: **"there is no mechanism
preventing you from using a class defined in the application layer in the
domain layer, thus breaking the direction of the dependencies"** when
relying on folder convention alone — the two remedies are code-review
discipline or a build-tool-enforced module boundary (an ESLint rule such as
`eslint-plugin-boundaries`, or separate packages with restricted
dependencies).
([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

This repo has deliberately chosen **review-time guidance only** (this
skill) rather than adding an ESLint boundary rule — see the scope note at
the top of [SKILL.md](../SKILL.md). That means this skill *is* the Allegro
article's weaker remedy by design; catch violations by actually reading
import directions during review, not by assuming a tool will catch them.
