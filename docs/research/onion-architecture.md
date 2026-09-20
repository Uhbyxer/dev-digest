# Onion Architecture — Research Notes

**Scope:** This document covers the *architectural* pattern known as Onion
Architecture — its origin, its dependency-direction rule, and how its
concepts map onto this repo's actual tools (Fastify, Drizzle ORM, Zod) in
`server/` and the already-pure `reviewer-core/`. It deliberately excludes
unrelated topics (auth design, testing strategy, deployment) except where a
source's architectural advice touches them directly.

**Date of research:** 2026-09-18. The core pattern (Palermo, 2008) is stable
and unlikely to change; the Node/TypeScript community pieces and library docs
(Fastify, Drizzle, Zod) are more time-sensitive — Fastify and Drizzle in
particular ship frequent releases, so re-check version-specific claims before
building a skill on them long after this date.

This is a primary input for a future Claude Code skill ("Onion Architecture"),
not the skill itself. Where sources disagree, or where a claim is the
researcher's own analysis rather than something sourced, that is called out
explicitly rather than resolved by fiat.

---

## 1. What Onion Architecture is (fundamentals, cited)

Jeffrey Palermo coined and named "Onion Architecture" in a four-part blog
series starting 2008-07-29. **Part 1** lays out the core structure: concentric
layers with the **Domain Model** at the absolute center, "which represents
the state and behavior combination that models truth for the organization"
and which is "only coupled to itself." Surrounding it are **Domain Services**,
then **Application Services**, with **Infrastructure, UI, and Tests** as the
outermost layer(s).
([Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/))

The core rule, stated directly by Palermo: **"All code can depend on layers
more central, but code cannot depend on layers further out from the core."**
This is the Dependency Inversion rule applied architecturally — dependencies
point inward only, never outward. Palermo's stated motivation is that
**data-access technology changes far more often than business logic** ("Data
access changes frequently. Historically, the industry has modified data
access techniques at least every three years."), so traditional layered
(N-tier) architecture — where the UI depends on Business Logic which depends
on Data Access, and the DB is implicitly "at the center" of everything — makes
the most volatile, least important layer the thing everything else transitively
depends on. Onion Architecture inverts this: the database, UI, and other
infrastructure become plug-in details at the *outside*, while the domain
model, the actual business truth, becomes the stable center everything else
depends on.
([Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/))

**Part 2** works through a concrete example: a controller depends only on
interfaces (`IConferenceRepository`, `IUserSession`) that are *defined in the
application core*; concrete implementations (`ConferenceRepository`,
`UserSession`) live in outer layers and implement those interfaces, so the
compile-time dependency still points inward even though the runtime call
flows outward. An IoC container, wired up at the application's entry point
("composition root" in later terminology — see §3), resolves the concrete
types and injects them. Palermo's own summary line: **"Remember that all
dependencies are toward the center."**
([Jeffrey Palermo: The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/))

Notably, Oren "Ayende" Eini — a well-known .NET architecture blogger —
publicly endorsed Palermo's articulation at the time, not as a novel idea but
as clear communication of principles ("persistence ignorance to dependency
injection") the community already valued but hadn't named well.
([Ayende @ Rahien: Onion Architecture](https://ayende.com/blog/3464/onion-architecture))

**Microsoft's own architecture guidance explicitly adopted this pattern**
(calling it "Clean Architecture" but citing Palermo's Onion Architecture by
name as one of its lineages, alongside Hexagonal/Ports-and-Adapters) for
ASP.NET Core. Direct quotes from Microsoft Learn:

> "Applications that follow the Dependency Inversion Principle as well as the
> Domain-Driven Design (DDD) principles tend to arrive at a similar
> architecture. This architecture has gone by many names over the years. One
> of the first names was Hexagonal Architecture, followed by
> Ports-and-Adapters. More recently, it's been cited as the Onion
> Architecture or Clean Architecture."

> "Clean architecture puts the business logic and application model at the
> center of the application. Instead of having business logic depend on data
> access or other infrastructure concerns, this dependency is inverted:
> infrastructure and implementation details depend on the Application Core.
> This functionality is achieved by defining abstractions, or interfaces, in
> the Application Core, which are then implemented by types defined in the
> Infrastructure layer."

Microsoft's layer→type mapping is useful as a concrete checklist later:

- **Application Core**: entities, aggregates, interfaces, domain services,
  specifications, custom exceptions/guard clauses, domain events/handlers.
- **Infrastructure**: ORM context/migrations, repository implementations,
  infrastructure-specific services (e.g. `FileLogger`, `SmtpNotifier`).
- **UI**: controllers, filters, middleware, views/viewmodels, and the
  **composition root** (`Startup`/`Program.cs`) — the one place allowed to
  know about both the Application Core interfaces *and* the Infrastructure
  implementations, in order to wire them together via DI.

([Microsoft Learn: Common web application architectures — Clean architecture](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures))

**Herberto Graça's synthesis** ("DDD, Hexagonal, Onion, Clean, CQRS... How I
put it all together") is the most-cited attempt to reconcile these related
patterns under one vocabulary. His framing: **"the Onion Architecture picks up
the DDD layers and incorporates them into the Ports & Adapters
Architecture,"** and more generally, **"the direction of dependencies is
towards the centre, it's the inversion of control principle at the
architectural level."** He maps Hexagonal's vocabulary onto Onion's layers:
*Ports* are interfaces owned by the application core describing what it needs
from the outside world; *Adapters* are the outer-layer implementations,
split into *Primary/Driving* (things that call into the app, e.g. HTTP
controllers) and *Secondary/Driven* (things the app calls out to, e.g. a
database). His caution, worth carrying into the skill: **"The map is not the
territory... these are just guidelines!"** and **"the Ports are created to
fit the Application Core needs and not simply mimic the tools APIs"** — i.e.
don't let an interface's shape be dictated by e.g. Drizzle's or Octokit's API
surface; shape it around what the domain logic actually needs.
([Herberto Graça: DDD, Hexagonal, Onion, Clean, CQRS, … How I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/))

---

## 2. Layer model applied to a TypeScript/Node backend generally

None of the primary sources above are Node/TS-specific — they're .NET/Java in
origin. The Node/TS community writeups found (see §7) generally translate the
same three-to-four rings without changing the dependency rule:

- **Domain** — plain types/entities/value objects and pure domain logic, zero
  imports from framework or infra code.
- **Application** (sometimes folded into Domain in smaller codebases) — use
  cases/services that orchestrate domain logic, defining the *interfaces*
  (ports) the domain/application needs from the outside world (a repository
  interface, an LLM-client interface, etc.).
- **Infrastructure** — concrete implementations of those interfaces: DB
  access (Drizzle), external API clients (Octokit, OpenAI SDK), filesystem,
  etc.
- **Presentation/UI** — in a backend, this is the HTTP layer: Fastify routes,
  request/response shaping.

A recurring caution across sources (Allegro engineering blog, in particular,
citing this as the central implementation risk in TS/JS specifically, which
lacks Java/C#'s module-level compiler enforcement): **plain package/folder
naming conventions don't prevent a domain file from importing an
infrastructure file** — "there is no mechanism preventing you from using a
class defined in the application layer in the domain layer, thus breaking the
direction of the dependencies" when relying on folder convention alone,
versus a build-tool-enforced module boundary (Gradle/Maven modules in their
JVM context; the direct TS-ecosystem analogue would be a lint rule such as
`eslint-plugin-boundaries`/`import/no-restricted-paths`, or separate
packages/workspaces with restricted dependencies — not confirmed by a primary
source in this research pass, noted as an open question in §8).
([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

The same article's strictness guidance: Onion works best for **complex,
long-lived systems with rich business logic**, and is explicitly a poor fit
for **"technical-oriented services, e.g. a high-throughput proxy written in a
reactive framework"** — i.e. it's a judgment call per-service, not a
repo-wide mandate.
([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

---

## 3. Fastify-specific seams for enforcing it

Fastify's own architecture gives a natural infrastructure/outer-layer
boundary almost for free, via its **encapsulation model**:

> "A fundamental feature of Fastify is the 'encapsulation context.' It
> governs which decorators, registered hooks, and plugins are available to
> routes." Child plugin contexts inherit from parent contexts but never the
> reverse: "the containing child context does not have access to the child
> plugins registered within its grandchild context."

([Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/))

This means a Fastify route handler is *architecturally* already the
outermost ring — it's registered inside a plugin context that can see
whatever was decorated onto it, but nothing forces (or even allows, without
deliberate `fastify-plugin` opt-out) inner domain code to reach back into
Fastify internals. **`fastify.decorate(name, value)`** is the mechanism for
attaching shared services (a DI-container-like role) onto the server
instance so route handlers can consume them without constructing them
inline — official docs: it's for "attach[ing] a new method to the server
instance" or non-function config values, and supports an optional
`dependencies` array so that "if a required dependency is missing, the
`decorate` method throws an exception" at boot rather than failing at
request time. `decorateRequest`/`decorateReply` do the same for the
per-request objects, with an explicit warning against decorating with
**reference types** (objects) because that "will impact all requests,
potentially creating security vulnerabilities or memory leaks" — i.e. any
per-request domain object needs to be constructed per-request, not shared
via decoration.
([Fastify docs: Decorators](https://fastify.dev/docs/latest/Reference/Decorators/))

`fastify-plugin` is the deliberate escape hatch — it "breaks encapsulation
only for the plugin it wraps," used for cross-cutting things (like a DB
client or config) that genuinely need to be visible everywhere, while
"[p]lugins registered inside it without fastify-plugin still create new
encapsulated contexts."
([Fastify docs: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/); [fastify/fastify-plugin on GitHub](https://github.com/fastify/fastify-plugin))

**Observed in this repo:** `server/src/platform/container.ts` already
implements almost exactly the composition-root pattern Microsoft's guidance
describes — it's a single `Container` class holding config, `db`, adapters
(behind interfaces like `GitHubClient`, `LLMProvider`, `SecretsProvider`,
`AuthProvider`, `Embedder`, `CodeIndex`, imported as `type` from
`@devdigest/shared`), constructed once per app instance, with a documented
`ContainerOverrides` mechanism specifically so tests can substitute mock
adapters. Its own top comment states this intent directly: *"Services depend
on these interfaces, not the concrete classes."* Routes
(`server/src/modules/reviews/routes.ts`) pull `container` off the Fastify
app instance and construct a `ReviewService` with it — this is functionally
Fastify's decorator mechanism playing the composition-root role, though the
container itself is a plain class rather than individual `fastify.decorate`
calls per adapter. (This grounding observation is the researcher's own
reading of the code, not a cited claim.)

---

## 4. Drizzle-specific seams for enforcing it

Official Drizzle docs are primarily about *how* to write schema and queries,
not about layering discipline — there is no official Drizzle guidance on
repository-pattern isolation. What the docs do establish, useful as
grounding for a skill:

- Schema can live in one file or be split across many; the only hard
  requirement is that **all models must be exported** so `drizzle-kit` can
  discover them for migrations: "The only thing you must ensure is that you
  export all the models from those files so that the Drizzle kit can import
  them and use them in migrations." A `schema` folder path in
  `drizzle.config.ts` is read recursively.
  ([Drizzle ORM docs: SQL Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration))
- Drizzle explicitly supports factoring out reusable column groups (e.g.
  shared timestamp columns) into separate files and spreading them into table
  definitions — a composition pattern, not a layering one.
  ([Drizzle ORM docs: SQL Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration))

**Community opinion (secondary, not official):** the repository-pattern
convention — wrapping Drizzle queries in per-resource repository
modules/functions so calling code never imports `drizzle-orm` operators or
`db` directly — appears repeatedly in community writeups as *the* way people
isolate persistence in Drizzle projects, described as helping "abstract the
data access layer from the business logic layer." This is a widely-repeated
community convention, not something Drizzle's own docs prescribe.
([Medium: Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) — secondary/community)

**Observed in this repo:** `server/` already does almost exactly this.
`server/src/db/schema/*.ts` holds Drizzle table definitions only (split by
domain area: `core.ts`, `pulls.ts`, `reviews.ts`, `repos.ts`, `agents.ts`,
etc. — one file re-exporting all via `schema.ts`). `server/src/db/rows.ts`
exports row types (e.g. `FindingRow`, `PullRow`) inferred from the schema via
Drizzle's `$inferSelect`. Query logic is isolated one level further, in
`server/src/modules/reviews/repository/*.repo.ts` (`review.repo.ts`,
`pull.repo.ts`, `run.repo.ts`), which are the only files observed importing
`drizzle-orm` operators (`and`, `desc`, `eq`, `inArray`) directly — e.g.
`review.repo.ts`'s `insertReview`/`insertFindings`/`reviewsForPull` functions
take a typed `Db` and return typed rows or `Finding` domain types (from
`@devdigest/shared`), not raw Drizzle query builder objects. `ReviewService`
in `service.ts` consumes `ReviewRepository` (a class wrapping the repo
functions) rather than `db` directly. This is the repository-pattern
"secondary/community" convention already in active use — grounding, not a
citation, since it's the researcher's reading of the actual files.

---

## 5. Zod's role at the boundary

Official Zod docs establish the two core parsing methods relevant to
boundary validation:

- **`.parse()`** — throws a `ZodError` on failure; on success, "Zod returns
  a strongly-typed *deep clone* of the input."
- **`.safeParse()`** — returns a discriminated-union result object
  (`{success, data}` or `{success: false, error}`) instead of throwing, "to
  avoid a try/catch block."

([Zod docs: Basics](https://zod.dev/basics))

This maps directly onto **Alexis King's "Parse, don't validate"** principle
— the phrase's originating source, confirmed via her own blog post (a
secondary excerpt site, figure.ink, republished portions of it but is *not*
the origin — the original is King's own blog). Her core distinction: a
*validator* checks a condition and discards the evidence (returns `void`/
`unit`); a *parser* checks the same condition but returns a more precise type
that encodes the guarantee, so downstream code can rely on it without
re-checking. Her stated design principle: **"Push the burden of proof upward
as far as possible, but no further. Get your data into the most precise
representation you need as quickly as you can."** She also names the
practical payoff directly: "validation-based approaches make it extremely
difficult or impossible to determine if everything was actually validated up
front," whereas parsing "stratif[ies]" a program into an input-validation
phase and an execution phase where "failure due to invalid input can only
happen in the first phase."
([Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/))

Applied to Onion Architecture specifically: Zod schemas at the HTTP boundary
(Fastify route body/params/query schemas) are the *parse* step — untyped
`unknown` JSON becomes a typed, validated domain-shaped value exactly once,
at the edge, and everything inward from there (service, repository, domain
logic) can trust the shape without re-validating. This is the same "burden of
proof pushed to the boundary" idea Zod's own docs gesture at implicitly
(schemas as the gate between "external data" and application types) but
don't name with that phrase — the "parse, don't validate" framing itself is
King's, not Zod's.

**Observed in this repo:** `server/src/modules/reviews/routes.ts` uses Zod
schemas as Fastify route schema (`{ schema: { params: IdParams } }`, via
`fastify-type-provider-zod`'s `ZodTypeProvider`), and also does a manual
`RunRequest.parse(req.body ?? {})` inside the handler for a tolerant/optional
body. Zod contracts live in `server/src/vendor/shared/contracts/`, shared
with `client/` and `reviewer-core/` — meaning the *shape* of the
domain-relevant data (Finding, Review, RunEvent, etc.) is defined once, in
Zod, and consumed as the common contract at every layer boundary, not just
the HTTP edge. This is a notably strong existing pattern for a
"Zod-as-boundary" convention already baked into the repo (researcher's own
reading, not a citation).

---

## 6. How `reviewer-core` already fits — researcher's own analysis

**This section is the researcher's own analysis, not a sourced claim.**

`reviewer-core`'s own `CLAUDE.md` states its non-default convention
explicitly: *"Pure functions: no side effects, no direct DB/HTTP/filesystem
access — everything (diff, repo map, LLM client) is injected by the
server."* Its `src/` is split into `llm/` (LLM providers — but as consumed
interfaces, injected in, not concretely owned), `review/` (diff + repo map →
prompt → LLM pipeline), and `output/` (grounding/validation of findings
against the diff, structured results).

Mapped onto Palermo's rings:

- `reviewer-core` as a whole is functionally the **Application Core /
  Domain + Application Services rings**: it contains the actual business
  logic of "what makes a good code review" (prompt assembly, grounding
  gate, structured output validation) with zero infrastructure dependency —
  no `pg`/`postgres` driver, no Fastify, no filesystem calls found in its
  `src/` tree.
- Its dependency on an **injected LLM client** rather than a concrete SDK
  call is exactly the Dependency Inversion rule in miniature: the LLM
  provider is a *port* reviewer-core depends on the *shape* of, and `server/`
  supplies the *adapter* (`server/src/adapters/llm/openai.ts`,
  `anthropic.ts`) at the composition root (`container.ts`).
- The same is true for the diff and repo-map inputs — reviewer-core doesn't
  read git or the filesystem itself; `server/` (specifically
  `server/src/modules/reviews/diff-loader.ts` and `repo-intel`) gathers that
  data and hands it in as plain values.

**What's structurally still missing, if the goal is to *formalize* this
rather than rely on convention:**

1. **No enforcement mechanism.** The purity is currently a documented
   convention (`CLAUDE.md` prose) with no lint rule, import restriction, or
   test that would catch a future PR adding, say, a direct `fetch()` call or
   `fs.readFile` inside `reviewer-core/src/review/`. This is the same gap
   Allegro's article calls out generally for TS/JS onion implementations
   (§2) — folder convention alone doesn't stop an errant import.
2. **`reviewer-core` doesn't (and structurally can't, given "no port, no
   HTTP") distinguish Domain-Model-the-noun from Application-Services-the-
   verbs the way Palermo's original four-ring model does** — it's closer to
   a single undifferentiated "core" ring than Domain Model → Domain Services
   → Application Services as three distinct rings. For a codebase this size
   that's arguably correct pragmatic collapsing (see Victor Rentea's
   "question any interface with a single implementation" caution, §7) rather
   than a gap — but it means a skill enforcing "onion layering" can't
   literally check for three nested rings inside `reviewer-core`; it's really
   checking for one thing: **does anything in `src/llm`, `src/review`,
   `src/output` import a concrete infra/HTTP/DB/FS module instead of
   receiving it as a parameter.**
3. **`server/`, by contrast, does not have anything this clean.** It has the
   *seams* (adapters/ behind interfaces, a composition-root Container,
   Zod contracts, repository functions wrapping Drizzle) but no single
   `domain/` folder holding pure business rules independent of `modules/`'s
   per-feature services — business logic in `server/` currently lives mixed
   into `modules/<feature>/service.ts` files alongside orchestration
   concerns (persistence calls, container wiring), which is much closer to
   Palermo's collapsed "Application Services doing double duty" than a
   textbook Domain-Model-at-the-center split. Whether that's a real problem
   worth fixing, or acceptable pragmatism for this app's size, is exactly the
   kind of judgment call §7's sources say to make deliberately rather than by
   default.

---

## 7. General best-practice articles found

1. **Victor Rentea — "Overengineering in Onion/Hexagonal Architectures."**
   The most directly useful pitfalls-and-restraint piece found. Concrete,
   falsifiable criteria for *when an interface/port is actually earning its
   keep*: **"An interface deserves to exist if and only if: (1) it has more
   than one implementation in the project, (2) it implements Dependency
   Inversion to protect an Inner Ring, or (3) it is packaged in a client
   library."** Also warns against the **"Middle Man" smell** from strict
   layer-to-layer-only calling (forcing pass-through wrapper methods with no
   added value), against duplicating DTOs across every layer "unless
   multiple delivery channels exist," and against maintaining a separate
   persistence model from the domain model, calling that duplication **"one
   of the most expensive decisions"** in a project (roughly 4x the code for
   CRUD-shaped work). Directly useful for calibrating how strict a skill
   should be about ports/interfaces in `server/`'s adapters.
   ([Victor Rentea: Overengineering in Onion/Hexagonal Architectures](https://victorrentea.ro/blog/overengineering-in-onion-hexagonal-architectures/))

2. **Allegro Tech engineering blog — "Onion Architecture."** Best source
   found for TS/JS(JVM-adjacent)-relevant enforcement mechanics: names the
   exact problem a Claude Code skill would need to solve (folder convention
   alone doesn't prevent an inward-layer file from importing an outer-layer
   one) and the two remedies (code-review discipline vs. a
   compiler/tool-enforced module boundary). Also gives the clearest
   "when NOT to use this" guidance found: skip it for small,
   technical/infra-shaped services; use it for complex, long-lived,
   business-logic-heavy ones.
   ([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

3. **Herberto Graça — "DDD, Hexagonal, Onion, Clean, CQRS... How I put it
   all together."** Best source for vocabulary reconciliation (Ports vs.
   Adapters vs. Onion's "Domain/Application Services" naming) and for the
   explicit caution against over-fitting ports to tool APIs. Long and
   somewhat academic; the useful part for a skill is narrow (the
   terminology-mapping table and the "map is not the territory" caution),
   the rest is broader DDD/CQRS material out of scope here.
   ([Herberto Graça: Explicit Architecture 01](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/))

4. **Microsoft Learn — "Common web application architectures."** Not
   Node-specific (it's ASP.NET Core), but the single clearest concrete
   type-to-layer checklist found (§1) and the source most likely to be
   already-familiar prior art for anyone who has touched .NET. Useful as a
   template for writing an equivalent TS-specific checklist, not as a
   drop-in prescription — the "UI project references Infrastructure only at
   the composition root" note is directly transferable to how
   `server/src/platform/container.ts` should be treated (the *one* file
   allowed to import concrete adapters).
   ([Microsoft Learn: Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures))

5. **Note on a claim not independently verified in this pass:** a search
   result surfaced a widely-repeated claim that "the project that originated
   the definition [Palermo's own project] ripped out this style of
   architecture after about 6 months because... it didn't scale with
   complexity," attributed loosely to discussion around Palermo's own later
   experience and CQRS-style alternatives. This was **not confirmed against
   a primary source** in this research pass (it surfaced only as a search
   snippet, not fetched from an original post) — flag it as a claim to
   verify before repeating it in the skill, not as established fact.

**Not independently pursued further in this pass, but worth flagging as
candidate reading if the skill author wants more:** community Node/TS
onion-architecture boilerplates (e.g. the `Melzar/onion-architecture-boilerplate`
and Sankhadip Samanta's Medium walkthrough) turned up in search but were not
fetched/verified — they're concrete folder-structure examples, useful for
"what would this literally look like in a `src/` tree" reference, but are
personal-project-quality sources, not vetted here as best-practice.

---

## 8. Open questions / tradeoffs to resolve before writing the enforcement skill

1. **Enforcement mechanism: lint rule vs. skill-as-reviewer vs. convention
   doc.** None of the sources above resolve this for a Claude Code skill
   specifically — Allegro's article (§2, §7.2) explicitly frames it as a
   binary between "package convention + code review" and "compiler/build-tool
   enforced module boundary," neither of which maps cleanly onto "a skill
   that reviews PRs." A skill that flags violations at review time is closer
   to their first option (code-review discipline) unless paired with an
   actual import-boundary lint rule (e.g. `eslint-plugin-boundaries`) as a
   second, automated layer — worth deciding explicitly rather than assuming
   the skill alone is sufficient enforcement.
2. **Does `server/` need a distinct `domain/` folder**, or is
   `modules/<feature>/service.ts` an acceptable place for business logic to
   live pragmatically collapsed with application-service orchestration? Per
   §6, this repo currently has no separate domain layer in `server/`;
   `reviewer-core` is the closest thing to a "pure domain" package that
   exists today, and it's a separate *package*, not a folder inside
   `server/`. A skill could either (a) push `server/` toward extracting a
   `domain/` layer of its own, or (b) treat "business logic that's pure and
   reusable belongs in `reviewer-core`, everything else in `server/modules/`
   is legitimately orchestration" as the intended architecture already in
   place and just enforce *that* boundary instead. These are materially
   different skills.
3. **How strict about interfaces/ports in `server/adapters/`?** Rentea's
   three-part test (§7.1) gives a concrete bar: does a given adapter
   interface (`GitHubClient`, `LLMProvider`, etc.) have >1 implementation,
   protect an inner ring via DI, or ship as a client library? Several
   interfaces in `container.ts` (`AuthProvider`, `SecretsProvider`,
   `CodeIndex`, `Embedder`) currently appear to have exactly one production
   implementation each (`LocalNoAuthProvider`, `LocalSecretsProvider`,
   `RipgrepCodeIndex`, `OpenAIEmbedder`) plus a test double via
   `ContainerOverrides` — which satisfies Rentea's criterion #2 (DI to
   protect an inner ring / enable testing) even with a single production
   implementation, so this looks like justified use, not overengineering —
   but the skill should probably articulate that test explicitly rather than
   flag "single-implementation interface" as a smell on its own.
4. **Should the skill check `reviewer-core`'s purity automatically** (e.g.
   flag any new import of `fs`, `pg`/`postgres`, `undici`/`fetch`, or
   Fastify types inside `reviewer-core/src/**`)? This is the single most
   mechanically checkable rule surfaced by this research (§6, point 1) and
   would be a natural first concrete check for the skill, independent of the
   harder judgment calls above.
5. **Terminology to standardize on in the skill.** Sources use Onion,
   Hexagonal/Ports-and-Adapters, and Clean Architecture near-interchangeably
   (Graça §1, Microsoft §1). The skill should probably pick one vocabulary
   (likely Onion, since that's the name the user asked for) and gloss the
   others as synonyms up front, rather than switching terms mid-document.
