---
name: react-nextjs-architecture
description: "Architectural guidance for React and Next.js codebases — where components, constants, utils/helpers, hooks, and business logic should live, how to decompose a growing component, and Next.js App Router conventions (Server vs Client Components, route groups, the Data Access Layer pattern, Server Actions). Grounded in primary sources (react.dev, nextjs.org/docs) and well-known community conventions (bulletproof-react, Feature-Sliced Design, Kent C. Dodds, Josh Comeau, TkDodo) — every claim is cited in references/ and README.md. Use this whenever the user asks where a new component/file/constant/util should go, how to structure or reorganize a `src/` or `app/` folder, whether a component is too big and needs splitting, whether something should be a hook vs a plain function vs a service, where business logic or data-fetching belongs, or how to lay out Server Actions and a Data Access Layer — even if they don't say 'architecture' explicitly (e.g. 'where should this live', 'is this component doing too much', 'should this be a hook'). This is about structure and organization, not performance optimization."
---

# React & Next.js Architecture

Answers *where code lives* and *how it's split* in a React or Next.js
codebase — not performance (memoization, bundle size, rendering speed).
Every recommendation below traces back to a cited source in
[README.md](README.md); read a topic's reference file before making a
placement call you're not confident about, since the reasoning and the
disagreements between sources both matter more than the bullet points.

## The one principle everything else follows

**Colocate first, extract later.** Neither React nor Next.js prescribes a
folder layout — both say so explicitly. What they agree on instead: put code
next to the thing that uses it, and only lift it to a shared location once
a second consumer actually needs it. Don't design a folder taxonomy up
front; let usage tell you where the seams are.

This one idea is the reasoning behind almost every rule in this skill. When
a question isn't answered directly below, fall back to it: *would this code
be easier to find, safer to delete, and less of a context-switch if it lived
next to what uses it, or does ≥2 real consumers justify lifting it out?*

See [references/placement-and-decomposition.md](references/placement-and-decomposition.md)
for the full reasoning and the concrete Next.js mechanisms (private folders,
route groups) that make colocation safe inside `app/`.

## Quick decision guide

| Question | Default answer | Details |
|---|---|---|
| Where does a new component go? | Next to its route/feature until ≥2 places need it, then lift to a shared tier | [placement-and-decomposition.md](references/placement-and-decomposition.md) |
| When do I split a component? | When it stops doing "one thing" — not at a line-count threshold | [placement-and-decomposition.md](references/placement-and-decomposition.md) |
| Container/presentational split? | Treat as legacy — use a custom hook instead | [placement-and-decomposition.md](references/placement-and-decomposition.md) |
| Where do constants live? | Colocated by default; a root `constants.ts` only for truly cross-cutting values (design tokens, route names) | [constants-utils-hooks-services.md](references/constants-utils-hooks-services.md) |
| Is this a hook, a util, or a service? | Calls a Hook → `useX` hook. Talks to an external system → service. Pure input→output → util. | [constants-utils-hooks-services.md](references/constants-utils-hooks-services.md) |
| Where does business logic live? | Client: a custom hook. Server (Next.js): a `server-only` Data Access Layer behind a thin `"use server"` action. | [business-logic-and-data-access.md](references/business-logic-and-data-access.md) |
| Server or Client Component? | Server by default; push `'use client'` to the smallest interactive leaf, not an ancestor | [nextjs-app-router.md](references/nextjs-app-router.md) |
| Should I use a barrel (`index.ts`) file? | Not in application code — direct imports only; reserve barrels for real library entry points | [placement-and-decomposition.md](references/placement-and-decomposition.md) |

## How to use this when reviewing or writing code

1. **Identify which question is actually being asked** — placement,
   decomposition, or "what kind of function/module is this" — and open the
   matching reference file rather than guessing from the table alone. The
   table is a summary; the reasoning in each file is what lets you handle
   the case that doesn't fit neatly.
2. **Prefer the primary-source rule when one exists** (e.g. the hook-naming
   test, or Next.js's Server/Client Component decision rule) — these are
   unambiguous and traceable to official docs.
3. **When only community convention exists** (folder taxonomy strictness,
   file casing, "utils" vs "helpers"), say so, and default to whatever this
   codebase already does. Don't impose a stricter convention (e.g.
   Feature-Sliced Design's enforced layering) on a codebase that hasn't
   opted into it — check [placement-and-decomposition.md](references/placement-and-decomposition.md)
   for why enforced layering is a real tradeoff, not a strictly-better
   choice.
4. **Flag genuine disagreements rather than picking silently** — several
   questions here (barrel files, folder strictness, "helpers" vs "utils")
   don't have a single right answer; each reference file names where
   sources diverge so you can surface the tradeoff instead of asserting one
   side as fact.

## Sources

Every claim in the reference files is cited inline. The full source list
(primary/official vs secondary/community, with what each one is good for)
lives in [README.md](README.md) — read it before adding a new claim to this
skill, so new material is anchored the same way.

The original research this skill was built from is at
`docs/research/react-nextjs-architecture.md` in this repo, including a
"where sources disagree" section with more detail than fits here.
