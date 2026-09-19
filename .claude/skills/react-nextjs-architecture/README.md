# react-nextjs-architecture

Claude Code skill: architectural guidance for React and Next.js codebases —
where components, constants, utils/helpers, hooks, and business logic
should live, and Next.js App Router conventions. Scope is **architecture,
not performance** (no memoization/bundle-splitting/rendering-speed advice,
except where a structural recommendation — like avoiding barrel files — has
a stated performance rationale worth flagging).

Built from the research at
`docs/research/react-nextjs-architecture.md` in this repo, researched
2026-09-18. React and Next.js docs version quickly — re-verify anything
here that's more than a year old before trusting it as current.

## Layout

```
react-nextjs-architecture/
├── SKILL.md                                   entry point + quick decision table
├── README.md                                  this file — full source list
└── references/
    ├── placement-and-decomposition.md         where components live, when to split them, barrel files
    ├── constants-utils-hooks-services.md      constants, hooks vs. utils vs. services
    ├── business-logic-and-data-access.md      client hooks, Next.js Data Access Layer, Server Actions
    └── nextjs-app-router.md                   Server/Client Components, route groups, context
```

## Relationship to other skills in this repo

`react-best-practices` and `next-best-practices` (marketplace skills, see
`.claude/skills-lock.json`) already cover a "Code Organization" /
"File Conventions" section each, but as short uncited rules — this skill is
independent and deeper: every claim here traces to a specific primary or
secondary source below, and it goes into the *reasoning* and the *places
sources disagree*, which a short rule list can't carry. Don't merge them;
this skill is meant to be consulted for the "why" and the edge cases the
other two don't cover.

## Sources

### Primary / Official

- [React: Thinking in React](https://react.dev/learn/thinking-in-react) —
  component decomposition algorithm (single responsibility, "UI mirrors the
  data model").
- [React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) —
  the hook-vs-util naming test; when to reach for a hook at all.
- [React FAQ: File Structure (legacy docs, still the only official statement on this topic)](https://legacy.reactjs.org/docs/faq-structure.html) —
  React has no folder-structure opinion; the two common patterns.
- [Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) —
  the three placement strategies; private folders; colocation safety inside `app/`.
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) —
  Server/Client decision rule, boundary-pushing, interleaving, `server-only`/`client-only`.
- [Next.js: Route Groups (file convention reference)](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) —
  `(folderName)` semantics.
- [Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions) —
  Server Action placement, trust-boundary behavior, sequential dispatch.
- [Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security) —
  the Data Access Layer pattern; the three data-fetching approaches and when each applies.
- [Vercel: How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) —
  first-party acknowledgment of barrel-file build-performance costs.

### Secondary / Community

- [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation) —
  the "place code as close to where it's relevant as possible" formulation, credited to Dan Abramov.
- [Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) —
  flat top-level folder system; promote a component to its own directory once non-trivial; root `constants.ts` for cross-cutting values.
- [bulletproof-react: Project Structure (alan2207/bulletproof-react)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) —
  feature-based structure at scale; no cross-feature imports; unidirectional `shared → features → app` flow; barrel-file tree-shaking concerns.
- [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview) —
  enforced layered hierarchy (`app`/`pages`/`widgets`/`features`/`entities`/`shared`); strictest of the taxonomies surveyed.
- [TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) —
  circular-import risk and a real-world Next.js case study (68% module-count reduction after removing barrels).
- [Dan Abramov: Presentational and Container Components (original 2015 post; update note referenced secondhand — direct fetch returned HTTP 403)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) —
  the pattern's origin and its author's later reversal in favor of hooks. **Lower confidence**: fetched only via search snippets, not a direct quote.
- [dev.to: RSC and the Echo of "Presentational and Container Components"](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i) —
  corroborates the container/presentational reversal above.
- [dev.to: Services vs Utils — What is the difference?](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6) —
  representative (not unanimous) community distinction between utils/services/helpers.

## Where sources disagree

See the "Where sources disagree or depend on context" section of
`docs/research/react-nextjs-architecture.md` for the full list — summarized
briefly per-topic in each reference file above. In short: exact folder
taxonomy, container/presentational's status, "helpers" vs. "utils", file
casing, which Next.js data-fetching approach to use, and how strictly to
enforce layering are all genuinely context-dependent or unresolved — this
skill flags them rather than picking a side.

## Updating this skill

When adding a new claim, cite its source the same way the existing content
does (inline markdown link, primary source preferred over a secondary
write-up of it), and add the source to the appropriate list above so the
citation trail stays complete.
