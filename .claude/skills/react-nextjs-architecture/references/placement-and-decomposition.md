# Component placement & decomposition

## Where components live

**React itself has no opinion.** The React docs FAQ states plainly: *"React
doesn't have opinions on how you put files into folders."* It describes two
common patterns without endorsing either — group by feature/route, or group
by file type — and adds two pieces of advice that *are* prescriptive: avoid
deep nesting (max ~3–4 nested folders), and don't overthink it at project
start ("don't spend more than five minutes choosing a file structure").
([React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html))

**Next.js is also explicitly unopinionated about placement**, but gives you
the mechanisms to colocate safely. A route only becomes publicly accessible
when a `page.tsx`/`route.tsx` file exists in a segment, and only what those
files *return* is ever sent to the client — so any other file colocated in a
route segment folder is safe by default, never becoming a route or leaking
to the client just by being there.
([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

Next.js documents three strategies and says to pick one and be consistent,
not that one is "correct": (1) all shared code outside `app/`, purely
routing inside it; (2) shared code in top-level folders inside `app/`; (3) a
hybrid — globally shared code at `app/` root, route-specific code colocated
inside the segments that use it. Folder names like `components`/`lib` are
placeholders with no special meaning to the framework.
([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

Two mechanisms make colocation inside `app/` tidy:
- **Private folders** (`_folderName`) opt a subtree out of routing entirely
  — useful for separating UI logic from routing logic and avoiding naming
  collisions with Next.js conventions.
- **Route groups** (`(folderName)`) organize routes by section/team/intent
  without affecting the URL, and let a subset of routes share (or override)
  a layout.
([Next.js: Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups),
[Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

**Community consensus converges on "colocate first, extract later."** Josh
Comeau keeps a flat top-level split (`components/`, `hooks/`, `utils.ts`,
`constants.ts`) and pulls a component into its own directory — bundling
subcomponents, styles, and local hooks together — once it's non-trivial.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))

Kent C. Dodds' **colocation principle** (credited to Dan Abramov)
generalizes this beyond components: *"Place code as close to where it's
relevant as possible."* Stated benefits: maintainability (nothing orphaned
when a feature is deleted), discoverability, reduced context-switching.
([Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation))

Bulletproof React (~30k stars) formalizes a **feature-based** structure at
scale: `src/features/<feature>/` holding that feature's own `api`,
`components`, `hooks`, `stores`, `types`, `utils` — *"you don't need all of
these folders for every feature. Only include the ones that are
necessary."* Plus a top-level `shared` tier for cross-feature code, and an
`app/` layer that composes everything. **No cross-feature imports** — compose
different features at the application level instead. Unidirectional flow:
**shared → features → app**.
([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md))

Feature-Sliced Design (FSD) takes this further with an enforced layered
hierarchy (`app` → `pages` → `widgets` → `features` → `entities` →
`shared`) where modules on one layer may only import from layers *strictly
below*, and slices can't import siblings on the same layer. This is
heavier-weight than bulletproof-react's convention-only approach — treat
FSD's strictness as optional rigor for teams that want enforced guardrails,
not a universal requirement.
([Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview))

**Bottom line:** no primary source prescribes an exact folder layout. All
sources converge on the *principle* (colocate what changes together, lift
only when ≥2 consumers need it) and disagree only on how much formal
structure to wrap around it — none (React/Next.js), a fair amount
(bulletproof-react), a lot (FSD). Pick based on team size and appetite for
ceremony; none of these is "more correct" per any primary source.

## How to decide where a *new* component goes

1. Default to colocating it inside the route/feature that uses it.
2. If this codebase already has an established tier (a `features/` folder,
   a `shared/` folder, a flat `components/`), match that — consistency with
   what's already there beats any of the patterns above in isolation.
3. Only lift a component to a shared location once a second real consumer
   needs it. Don't pre-emptively generalize a component for hypothetical
   reuse.

## How to decide when to split a component

**Primary guidance (React): single responsibility, decompose along the data
model.** React's "Thinking in React" gives the canonical rule:

> *"A component should ideally only be concerned with one thing. If it ends
> up growing, it should be decomposed into smaller subcomponents."*

Three lenses for where to cut: a **programming** lens (same reasoning as
splitting a function), a **CSS** lens (what would you make a class selector
for), a **design** lens (how would a designer organize their layers). And a
structural principle:

> *"UI and data models often have the same information architecture — that
> is, the same shape. Separate your UI into components, where each
> component matches one piece of your data model."*

The doc's worked example: a table header stays inlined inside `ProductTable`
until it grows complex (e.g. gains sorting), at which point it's extracted
into `ProductTableHeader` — **decompose reactively, when growth demands it,
not preemptively.**
([React: Thinking in React](https://react.dev/learn/thinking-in-react))

**No primary source gives a line-count threshold.** The consistent signal
across primary and secondary sources is *behavioral*: split when a
component starts doing more than "one thing," or when a sub-part gains its
own concerns (sorting, interactivity), or informally "when it's
non-trivial" (Comeau). If a numeric line-count rule exists elsewhere in this
codebase's own conventions, that's a team decision layered on top of this
principle, not something React or Next.js mandates — treat it as a useful
proxy, not the actual test.

**Container vs. presentational is a deprecated pattern, per its own
author.** This split (data-fetching "smart" container wrapping a "dumb"
rendering component) was popularized by Dan Abramov in 2015 and was common
advice for years. Since Hooks, Abramov has publicly walked it back: hooks
let you extract stateful/data logic into a custom hook without a wrapper
component at all — *"better encapsulation... and no arbitrary division
between business logic and UI logic."* **Confidence note:** the original
Medium post returned HTTP 403 during research and couldn't be fetched
directly; this rests on search-result snippets and a corroborating
secondary article, not a verified direct quote. Still, treat
container/presentational as legacy, not current best practice — reach for a
custom hook instead when you see this split proposed.
([corroborating discussion: dev.to — RSC and the Echo of "Presentational and Container Components"](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i);
original: [Dan Abramov's post, HTTP 403 on direct fetch](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0))

## Barrel files (`index.ts` re-exports): avoid in application code

Unusually well-evidenced for a style question:

- Vercel's own blog documents barrel files as a **measured build/dev-server
  performance problem** — enough that the Next.js team shipped
  `optimizePackageImports` specifically to work around it. That
  optimization only works on "pure" barrels (files that do nothing but
  re-export); once a barrel contains any other code, it can't be optimized.
  ([Vercel: How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js))
- TkDodo adds two structural risks: barrels can create **circular imports**
  when a sibling module imports from its own directory's barrel instead of
  directly, and documents a real Next.js case where removing internal
  barrels cut module count ~68% (11k → 3.5k) and fixed a 5–10s startup
  regression. Recommendation: reserve `index.ts` barrels for genuine
  *library* entry points defined in `package.json`; use direct imports
  everywhere in application code.
  ([TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files))
- Bulletproof React reaches the same conclusion independently for feature
  folders: barrels *"can cause issues for tree shaking and can lead to
  performance issues [so] it's recommended to import files directly."*
  ([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md))

**Caveat:** this is the one recommendation in this skill justified mainly by
a *performance* rationale even though it's an organizational/structural
question (whether to use re-export files at all). The primary source
(Vercel) ships a mitigation rather than banning the pattern; secondary
sources go further and recommend avoiding barrels entirely. Treat it as a
difference of degree, not disagreement of fact.

## File naming (unresolved — flag, don't invent a rule)

No primary source (React or Next.js) prescribes file/folder casing. Next.js
uses lowercase for special files (`page.tsx`, `layout.tsx`) by
convention/requirement, and PascalCase for component files by widespread
(not mandated) practice. Community sources split between kebab-case
(Comeau, explicitly framed as personal preference) and PascalCase matching
the exported component name. Defer to whatever this codebase already does
rather than asserting one is correct.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))
