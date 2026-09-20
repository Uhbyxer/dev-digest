# reviewer-core: the mechanically-checkable rule

`reviewer-core`'s own `CLAUDE.md` states its non-default convention
directly: *"Pure functions: no side effects, no direct DB/HTTP/filesystem
access — everything (diff, repo map, LLM client) is injected by the
server."* This is already, structurally, Palermo's domain-core ring: it
holds the actual business logic of "what makes a good code review" (prompt
assembly, grounding/validation, structured output) with zero infrastructure
dependency.

Mapped onto the pattern:

- `reviewer-core` as a whole = **Application Core / Domain + Application
  Services rings**.
- Its dependency on an **injected LLM client** (not a concrete SDK call) is
  the Dependency Inversion rule in miniature — the LLM provider is a *port*
  reviewer-core depends on the shape of; `server/` supplies the *adapter*
  (`server/src/adapters/llm/...`) at the composition root
  (`server/src/platform/container.ts`).
  ([Jeffrey Palermo: The Onion Architecture, part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/))
- Same for diff and repo-map inputs — `reviewer-core` doesn't read git or
  the filesystem itself; `server/` gathers that data and hands it in as
  plain values.

## What's missing: enforcement

The purity above is currently a documented convention (prose in
`CLAUDE.md`), not something checked. This is exactly the gap Allegro's
article calls out generally for TS/JS onion implementations — folder
convention alone doesn't stop an errant import.
([Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html))

**This is the single most mechanically-checkable rule this skill has.**
When reviewing or writing anything under `reviewer-core/src/**`
(`src/llm/`, `src/review/`, `src/output/`), check new imports for:

- `fs`, `node:fs`, `path` used for filesystem access (not just types)
- `pg`, `postgres`, or any Drizzle import (`drizzle-orm`, `drizzle-kit`)
- `fetch`, `undici`, `axios`, or any other raw HTTP client
- `fastify` or any Fastify type
- A concrete LLM SDK (`openai`, `@anthropic-ai/sdk`) imported directly
  instead of received as an injected parameter

If any of these appear, the fix is **not** "add it to reviewer-core" — it's
either: (a) the data/client should be gathered by `server/` and passed in as
a parameter, or (b) if the operation is genuinely infrastructural, it
doesn't belong in `reviewer-core` at all, and the calling code in `server/`
should do it and pass the result in.

## What's still structurally loose

`reviewer-core` doesn't (and, per its "no port, no HTTP" design, structurally
can't) distinguish Domain-Model-the-noun from Application-Services-the-verbs
the way Palermo's original four-ring model does — it's closer to one
undifferentiated "core" ring than three nested ones. For a codebase this
size, treat that as acceptable pragmatic collapsing (see Rentea's
overengineering test in [fundamentals.md](fundamentals.md)) rather than a
gap to fix — **don't suggest splitting `reviewer-core` into
domain/application sub-layers**; the purity boundary at its outer edge is
the rule that matters, not internal ring subdivision.

## Business logic placement test

When someone asks "where should this logic live?": if it has **zero**
infrastructure dependency (no DB, no HTTP, no FS, no Fastify) and is
reusable review-domain logic, it belongs in `reviewer-core`. If it
orchestrates — calls a repository, then an adapter, then shapes a response —
it belongs in `server/src/modules/<feature>/service.ts`. Don't suggest a new
`domain/` folder inside `server/` for this; see the scope note at the top of
[SKILL.md](../SKILL.md).
