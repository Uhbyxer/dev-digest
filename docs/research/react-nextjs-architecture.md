# React + Next.js Codebase Architecture — Research Notes

**Scope:** This document covers *architectural* conventions only — where code
lives, how it's split, and how responsibilities are separated. It deliberately
excludes performance optimization (memoization, bundle splitting for speed,
rendering performance, etc.) except where a source's architectural advice
(e.g. barrel files) has a stated structural rationale.

**Date of research:** 2026-09-18. React and Next.js docs churn quickly —
Next.js's own docs are versioned per release (fetched pages below report
`version: 16.3.5`, last updated mid-2026), so treat anything more than a
year old with suspicion and re-check before building a skill on it.

This is a primary input for a future Claude Code skill, not the skill itself.
Where sources disagree or guidance is context-dependent, that is called out
explicitly rather than resolved by fiat.

---

## 1. Where should components live?

**React itself has no opinion.** The (now-archived, but still the clearest
official statement on this) React docs FAQ says plainly: *"React doesn't have
opinions on how you put files into folders."* It describes exactly two common
patterns without endorsing either:

- **Group by feature/route** — colocate CSS, JS, and tests inside folders
  grouped by feature or route.
- **Group by file type** — group similar files together, e.g. `api/`,
  `components/`.

It adds two pieces of concrete advice that *are* prescriptive: avoid deep
nesting (*"consider limiting yourself to a maximum of three or four nested
folders"*), and don't overthink it at project start (*"don't spend more than
five minutes choosing a file structure"*), because *"choosing the 'right' one
in the beginning isn't very important."*
([React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html))

**Next.js (App Router) is also explicitly unopinionated about placement**,
but gives you the *mechanisms* to colocate safely. Because a route only
becomes publicly accessible when a `page.tsx`/`route.tsx` file exists in a
segment, and only the content those files *return* is ever sent to the
client, **any other file colocated in a route segment folder is safe by
default** — it will never become a route or leak to the client just by being
there. The docs state this directly: *"project files can be safely
colocated inside route segments in the `app` directory without accidentally
being routable."*
([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

Next.js documents three concrete high-level strategies and says to pick one
and be consistent, not that one is "correct":

1. **Store project files outside `app`** — all shared code (`components/`,
   `lib/`, etc.) lives at the project root; `app/` is purely routing.
2. **Store project files in top-level folders inside `app`** — shared code
   lives at the root of `app/` itself.
3. **Split project files by feature or route** — globally shared code stays
   at the `app/` root; route-specific code is colocated inside the route
   segments that use it.

The docs are careful to note the folder *names* (`components`, `lib`) are
placeholders with no special meaning to the framework — teams also use `ui`,
`utils`, `hooks`, `styles`, etc.
([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

**Two mechanisms Next.js provides specifically to make colocation safe and
tidy:**

- **Private folders** (`_folderName`) opt a folder and its subtree out of
  routing entirely. Not required for colocation (colocation is already safe
  by default), but useful for *"separating UI logic from routing logic,"*
  consistent organization, editor sorting, and avoiding future naming
  collisions with Next.js file conventions.
  ([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))
- **Route groups** (`(folderName)`) organize routes without affecting the
  URL — useful for grouping *"by site section, intent, or team"* and for
  giving a subset of routes their own (possibly root) layout.
  ([Next.js: Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups),
  [Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

**Secondary/community consensus converges on "colocate first, extract
later."** Josh Comeau's widely-cited file-structure guide keeps a flat
top-level split (`components/`, `hooks/`, `utils.ts`, `constants.ts`) and
pulls a component into its own directory once it's non-trivial, bundling its
subcomponents, styles, and local hooks together in that directory rather than
splitting by file type across the tree.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))

Kent C. Dodds' **colocation principle** (a rule he attributes to Dan Abramov)
generalizes this beyond components: *"Place code as close to where it's
relevant as possible"*, or *"things that change together should be located as
close as reasonable."* His stated benefits are maintainability (nothing gets
orphaned when you delete a feature), discoverability (you see related code
and remember to update it), and reduced context-switching.
([Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation))

Bulletproof React (community style guide, ~30k GitHub stars, one of the most
copied React structures) formalizes a **feature-based** structure at scale: a
`src/features/<feature>/` folder holding that feature's own `api`,
`components`, `hooks`, `stores`, `types`, `utils`, with a top-level `shared`
tier (`components/`, `hooks/`, `lib/`, `utils/`, `types/`) for cross-feature
code, plus an `app/` layer that composes everything.
([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md))

Feature-Sliced Design (FSD) — a more formal, methodology-level secondary
source — takes this further with an explicit layered hierarchy (`app` →
`pages` → `widgets` → `features` → `entities` → `shared`, plus a
now-deprecated `processes` layer) where *"modules on one layer can only know
about and import from modules from the layers strictly below."* Each
feature/entity "slice" is further split into `ui`, `api`, `model`, `lib`, and
`config` segments.
([Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview))

**Bottom line:** no primary source prescribes an exact folder layout for
components. All of them converge on the same *principle* — colocate what
changes together, only lift shared code up when ≥2 consumers need it — and
disagree only on how much *formal structure* to wrap around that principle
(none, in React/Next.js's case; a fair amount, in FSD's case).

---

## 2. How should components be split/decomposed?

**Primary guidance (React): single responsibility, decompose along the data
model.** React's own tutorial, "Thinking in React," gives the canonical
decomposition algorithm:

> *"A component should ideally only be concerned with one thing. If it ends
> up growing, it should be decomposed into smaller subcomponents."*

It suggests three lenses for deciding where to cut a design into components:
a **programming** lens (separation of concerns, same as deciding whether to
split a function), a **CSS** lens (what would you make a class selector for),
and a **design** lens (how would a designer organize their layers). It also
states a structural principle worth quoting directly for this question:

> *"UI and data models often have the same information architecture — that
> is, the same shape. Separate your UI into components, where each component
> matches one piece of your data model."*

The doc's own worked example is instructive: a table header stays inlined
inside `ProductTable` until it grows complex (e.g. gains sorting), at which
point it's extracted into its own `ProductTableHeader` — i.e., *decompose
reactively, when growth demands it*, not preemptively.
([React: Thinking in React](https://react.dev/learn/thinking-in-react))

**Container vs. presentational is a deprecated pattern, per its own author.**
This split (data-fetching "smart" container wrapping a "dumb" rendering
component) was popularized by Dan Abramov in 2015 and was extremely common
advice for years. Since the introduction of Hooks, Abramov has publicly
walked it back: hooks let you extract stateful/data logic into a custom hook
without introducing a wrapper component at all, giving *"better
encapsulation... and no arbitrary division between business logic and UI
logic."* Secondary write-ups confirm and describe the update note added
directly to his original post.
([Dan Abramov's original post, with self-added update note — summarized secondhand via search snapshot](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0);
corroborating discussion: [dev.to: RSC and the Echo of "Presentational and Container Components"](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i))
Note: the Medium URL itself returned HTTP 403 on direct fetch during this
research pass, so this claim rests on search-result snippets and a secondary
corroborating article rather than a verified direct quote — flagged as lower
confidence pending re-verification.

**Feature-based vs. type-based organization** — see Section 1; this is the
same axis. Community consensus (bulletproof-react, FSD, Robin Wieruch,
developerway.com-style guides surfaced in search) leans toward feature-based
once a project passes trivial size, precisely because it keeps "what changes
together" together and bounds the blast radius of a change — but no primary
source (React or Next.js) mandates this; both explicitly leave it to the
team.

**Size as a decomposition trigger, not a hard rule.** No primary source gives
a line-count or complexity threshold. The consistent primary/secondary
signal is *behavioral*: split when a component starts doing more than "one
thing" (React docs), when a sub-part of a component's UI gains its own
concerns like sorting/interactivity (React docs' `ProductTableHeader`
example), or informally, "when it's non-trivial" (Comeau).

---

## 3. Where should constants live?

There is **no primary/official guidance** from React or Next.js specifically
about a `constants` folder or file — this is squarely community convention
territory, and it inherits directly from the colocation principle in
Sections 1–2 rather than being a distinct rule.

- **Colocate first.** The same "colocate first, extract later" logic search
  results converge on for components applies to constants: keep a constant
  next to the single component/module that uses it; only promote it to a
  shared location once ≥2 consumers need it.
- **A shared/global constants file for cross-cutting values.** Josh Comeau's
  guide keeps a project-root `constants.ts` for genuinely app-wide values —
  his examples are style tokens (colors, font sizes, breakpoints) and public
  keys.
  ([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))
- **Bulletproof-react** and FSD both encode this as a real folder in their
  layered structures: a top-level `config`/`shared` tier for global
  constants and config, plus per-feature/per-slice space for
  feature-specific constants (bulletproof-react's per-feature folders don't
  explicitly list "constants" as a first-class subfolder, but its
  "only include what's necessary" rule and general shared/feature split
  apply the same way as for utils/types).
  ([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md);
  [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview))

**Naming:** no primary source prescribes a naming convention for constants
specifically (e.g. `SCREAMING_SNAKE_CASE` vs. `camelCase` object). This is
standard JS/TS style-guide territory (ESLint, Prettier, team convention), not
something React/Next.js docs weigh in on — flagged as a gap rather than
invented guidance.

**Disagreement/nuance:** the split between "colocate constants next to
usage" and "put them in one global file" is genuinely a size/team-size
tradeoff, not a resolved question. Small apps get away with one
`constants.ts`; larger, feature-organized apps push constants down into
feature folders and reserve the root file for truly global values (design
tokens, route names, API base URLs).

---

## 4. Utils/helpers vs. hooks vs. services — where's the line?

This is another area with **no single primary-source ruling**, but the
signal converges strongly enough across sources to state clear defaults.

**The React team draws the hooks line by one test: does it call a Hook?**
From the official custom-hooks guide:

> *"If your function doesn't call any Hooks, avoid the `use` prefix. Instead,
> write it as a regular function without the `use` prefix... This convention
> guarantees that you can always look at a component and know where its
> state, Effects, and other React features might 'hide.'"*

This is the cleanest primary-source line available: **a function that reads
or subscribes to React state/lifecycle (via other hooks) is a hook and must
be named `useX`; a function that only transforms inputs to outputs — no
hooks inside — is a plain utility function and must *not* be named
`useX`.** The doc gives a concrete example: rename a non-hook-calling
`useSorted` to `getSorted`.
([React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks))

The same doc gives the criterion for *when* to reach for a hook at all vs.
leaving logic inline: hooks are for **stateful logic tied to React's
lifecycle** — *"whenever you write an Effect, consider whether it would be
clearer to wrap it in a custom Hook... you need to 'step outside React' to
synchronize with an external system."* Custom hooks share *stateful logic*,
not state itself — each call site gets independent state.
([React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks))

**Utils vs. services vs. helpers (community convention, converging but not
unanimous):**

- **Utils** — pure, stateless functions: input in, output out, no side
  effects, no React, no I/O. Formatters, calculators, parsers.
- **Services** — modules that own communication with an external
  system/API: encapsulate requests, responses, and the communication
  protocol for one integration.
- **Helpers** — where teams distinguish this from "utils" at all, helpers
  are allowed side effects or external dependencies (storage access,
  navigation) that utils explicitly are not. Many teams treat
  "helpers"/"utils" as synonyms instead — this is not fully standardized.

([dev.to: Services vs Utils](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6) —
secondary/community, representative of a recurring but not unanimous
distinction seen across multiple similar community posts surfaced in this
research)

**Practical decision rule synthesized from the above (secondary, but well
supported):** if it touches React state/lifecycle → hook. If it makes a
network call or talks to an external system → service. If it's pure
input→output with no side effects → util. If in doubt, start with the
simplest bucket (`utils/`) and only split out a `services/`/`hooks/` once the
function actually needs those capabilities — this mirrors Comeau's advice to
start with a small fixed set of top-level folders (`components/`, `hooks/`,
`utils.ts`) and add more only as the codebase demands it.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))

---

## 5. Where should business logic live?

**Next.js has the most concrete, primary, and recent guidance here** via its
**Data Access Layer (DAL)** pattern, documented as the recommended approach
for new projects:

> *"For new projects, we recommend creating a dedicated Data Access Layer
> (DAL). This is an internal library that controls how and when data is
> fetched, and what gets passed to your render context. A Data Access Layer
> should: Only run on the server. Perform authorization checks. Return safe,
> minimal Data Transfer Objects (DTOs)."*

The doc explicitly extends this pattern from reads to writes/mutations:

> *"Just as we recommend a Data Access Layer for reading data, you can apply
> the same pattern to mutations. This keeps authentication, authorization,
> and database logic in a dedicated `server-only` module, while `"use
> server"` actions stay thin."*

I.e., the architectural split it recommends is: **Server Action ("use
server") → thin wrapper that calls into the DAL → DAL holds the actual
business/auth/data logic, marked `server-only`.** This centralizes
authorization and reduces the risk of "authorization bugs" scattered across
many components/actions, and gets you a shared per-request cache (via
React's `cache()`) as a side benefit.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

The same doc names **three data-fetching approaches** and is explicit that
which one is "right" depends on project stage — this is a good example of
the "depends on team/project size" caveat the research brief asked to
surface:

- **External HTTP APIs** — for *"existing large applications and
  organizations"* with existing backend teams/services.
- **Data Access Layer** — *"for new projects."*
- **Component-level data access** — *"for prototypes and learning"* only;
  the doc calls out that this makes it easy to *"accidentally expose private
  data to the client."*

It explicitly recommends **not mixing approaches**: *"choosing one data
fetching approach and avoiding mixing them"* makes expectations clear for
developers and security auditors.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

**On the client/UI side, React's answer is custom hooks**, per Section 4:
extract stateful/business logic that's tied to component lifecycle into a
`useX` hook so the component itself expresses *intent* rather than
*implementation* — *"The code of your components expresses your intent, not
the implementation."*
([React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks))

**On the server side more specifically, Next.js layers business logic as:**
`"use server"` action (thin, delegates + does the per-call
auth/authz/validation) → DAL function (`server-only`, does the actual
query/auth logic) → database/external API. Server Actions must not skip
re-verifying auth/authorization even if the page that renders them already
gated access, because *"A page-level authentication check does not extend to
the Server Actions defined within it"* — a Server Action is *"a separate
entry point"* reachable directly via POST regardless of whether the UI that
would normally trigger it is rendered.
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions);
[Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

**Mutations must not be a side effect of rendering.** Next.js explicitly
prevents triggering cache revalidation or setting cookies during render for
exactly this reason, and the docs' own example table frames "BAD" vs. "GOOD"
around this: side-effectful mutations belong in a Server Action, not inline
in a Server Component's render path.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

---

## 6. Other closely-related architectural conventions

### Colocation as the unifying principle
Both React's own FAQ and Next.js's project-structure doc name "colocation"
directly and treat it as the load-bearing principle behind nearly every
other convention in this document. Kent C. Dodds' formulation — *"things
that change together should be located as close as reasonable"* — is the
most quotable primary-adjacent statement of it, explicitly credited by him to
Dan Abramov.
([React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html);
[Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure);
[Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation))

### `features/`/`modules/` folder structure (secondary, but strong consensus)
Bulletproof React's structure is the most commonly cited concrete template:

- Each feature folder may contain `api/`, `assets/`, `components/`,
  `hooks/`, `stores/`, `types/`, `utils/` — but *"you don't need all of these
  folders for every feature. Only include the ones that are necessary."*
- **No cross-feature imports.** *"It's not a good idea to import across
  features; instead, compose different features at the application
  level"* to keep features independent.
- Unidirectional dependency flow: **shared → features → app.**
- Shared, cross-feature-used code (e.g. many features hitting the same API)
  can live outside `features/` in a dedicated top-level folder rather than
  being duplicated or fought over.

([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md))

Feature-Sliced Design formalizes the same shape into stricter law: layers
may only import from layers *strictly below* them, and *"slices cannot use
other slices on the same layer"* — enforced (in FSD tooling) rather than
just conventional. This is a heavier-weight methodology than bulletproof
react's looser convention; teams should treat FSD's strictness as optional
rigor, not a universal requirement.
([Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview))

### Barrel files: real, measured downsides — avoid in application code
This is unusually well-evidenced for a "style" question, including a
first-party Vercel/Next.js engineering post:

- Vercel's own blog post on `optimizePackageImports` documents barrel files
  as a **measured build/dev-server performance problem** the Next.js team
  built a compiler optimization specifically to work around — this is a
  first-party acknowledgment that barrel files are structurally costly, not
  just a community pet peeve.
  ([Vercel: How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js))
- That optimization has a **stated limit**: it only works on "pure" barrels
  (files that do nothing but re-export). Once a barrel contains any other
  code, it can no longer be optimized.
- TkDodo's widely-read post adds two more concrete structural risks: barrel
  files can create **circular imports** when a sibling module imports from
  its own directory's barrel instead of directly from the sibling file, and
  a real-world Next.js case where removing internal barrels cut module count
  from ~11k to ~3.5k (a 68% reduction) and fixed a 5–10s page start-up.
  His recommendation: reserve barrel files (`index.ts`) for genuine *library*
  entry points defined in `package.json`, and use direct imports everywhere
  in application code.
  ([TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files))
- Bulletproof React independently arrives at the same conclusion for
  feature folders: *"barrel files... can cause issues for [bundler] tree
  shaking and can lead to performance issues [so] it's recommended to import
  files directly."*
  ([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md))

**Caveat:** this is the one place in this document where an architectural
recommendation is justified primarily by a *performance* rationale (bundle
size, dev server startup) even though it's being surfaced here as a
structural/organizational convention (whether to use `index.ts` re-exports).
Treat it as architecture-with-a-performance-footnote, not a pure
architecture claim.

### Naming conventions for files/folders
No primary source (React or Next.js) prescribes file/folder casing.
Next.js's own examples in its docs use lowercase file names for special
files (`page.tsx`, `layout.tsx`) by convention/requirement, and PascalCase
for component files by widespread (not mandated) practice. Community
sources split between kebab-case (Comeau: *"I use kebab-case instead of
camelCase for files... I just like the way it looks"* — an explicitly
personal-preference framing, not a claim of consensus) and PascalCase
matching the exported component name. This is a genuinely unresolved,
team-preference area — flagged rather than resolved.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))

---

## 7. Next.js-specific architecture (App Router)

### Server vs. Client Components — the decision rule
Straight from the docs:

> Use **Client Components** when you need: state and event handlers (e.g.
> `onClick`, `onChange`); lifecycle logic (`useEffect`); browser-only APIs
> (`localStorage`, `window`, `navigator.geolocation`); custom hooks.
>
> Use **Server Components** when you need: to fetch data from databases/APIs
> close to the source; to use API keys/tokens/secrets without exposing them
> to the client; to reduce JS sent to the browser; to improve FCP and stream
> content progressively.

Layouts and pages are Server Components **by default**; `'use client'` opts
a module (and everything in its import/render tree) into the client bundle.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

**Push client boundaries as deep/narrow as possible.** The docs' own example
keeps a `<Layout>` (logo, nav — static) as a Server Component and marks only
the interactive `<Search />` inside it as a Client Component, rather than
marking the whole layout client-side. Once a file has `'use client'`, *"all
of its imports and the components it directly renders are included in the
client bundle"* — so the boundary should sit at the smallest interactive
unit, not at a convenient ancestor.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

**Interleaving pattern: pass Server Components as children/props into Client
Components**, rather than importing a Server Component from inside a Client
Component (which is explicitly unsupported — it would require a new
server round-trip). The canonical example is a client-side `<Modal>`
wrapping a server-rendered `<Cart>` passed as `children`, composed from a
parent Server Component. This lets you keep server-rendered data deep inside
an interactive shell without turning that data-fetching subtree into client
code.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

**Context providers must be Client Components** (React context isn't
supported in Server Components), but should be rendered **as deep in the
tree as possible** — the docs' example wraps only `{children}`, not the
entire `<html>` document, specifically *"to make it easier for Next.js to
optimize the static parts of your Server Components."*
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

**Environment poisoning prevention:** mark server-only modules with the
`server-only` package import so that accidentally importing server logic
(e.g. something reading `process.env.API_KEY`) into a Client Component
produces a **build-time error** instead of a silent broken/insecure runtime
behavior. A parallel `client-only` package exists for the inverse case.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

### Route groups
`(folderName)` groups routes without affecting the URL. Documented uses:
organizing by section/team/intent, enabling multiple (or nested) layouts at
the same URL segment level, and opting a subset of routes into a shared
layout while excluding sibling routes.
([Next.js: Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups);
[Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

### Colocating route-specific vs. shared code
Covered in depth in Section 1 — Next.js supports (but doesn't mandate) three
patterns: everything outside `app/`, everything shared inside `app/`'s root,
or a hybrid that colocates route-specific files inside their route segment
and keeps only genuinely shared code at the `app/` root. Private folders
(`_folder`) and route groups (`(folder)`) are the two mechanisms provided to
make this colocation tidy without accidentally creating new routes.
([Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

### Where to put Server Actions / data-fetching relative to components
Two supported placements per the docs, both first-party:

- **Inline in the component file**, with `'use server'` at the top of the
  async function body — appropriate for actions tightly scoped to one
  component/page.
- **A separate file** (commonly `actions.ts`, colocated next to the route it
  serves, e.g. `app/posts/actions.ts`) with `'use server'` at the top of the
  file, marking every export as a Server Action. This is the pattern the
  data-security guide uses throughout, and pairs with the DAL recommendation
  from Section 5: the action file stays thin and delegates to a
  `server-only` DAL module (e.g. `data/posts.ts`) that holds the actual
  authz/query logic.
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions);
[Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

**Security note directly relevant to architecture:** every exported Server
Action is a reachable POST endpoint regardless of whether it's imported/used
in the UI (Next.js does dead-code-elimination to strip *unused* ones from
the client bundle, but any action that *is* referenced anywhere is callable
directly). This means the "thin action, fat DAL" split isn't just tidiness —
the DAL is where authorization actually has to happen, because the action
boundary itself is not a trust boundary.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Sequential dispatch caveat (architectural implication)
Next.js dispatches Server Actions **one at a time per client** — triggering
several actions in quick succession serializes them. The docs explicitly
warn against relying on `Promise.all` to parallelize Server Actions from the
client; if you need real parallelism, do it *inside* a single Server Action,
fetch in parallel from a Server Component, or use a Route Handler for
non-mutating parallel reads. This has a direct architectural consequence:
don't design a UI that fires N independent Server Actions expecting them to
run concurrently.
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions))

---

## Where sources disagree or depend on context

- **Exact folder taxonomy.** React and Next.js both explicitly decline to
  prescribe one; all concrete taxonomies in this document (bulletproof-react,
  FSD, Comeau) are secondary/community and disagree with each other on
  strictness (FSD enforces layer import rules; bulletproof-react is
  convention-only; Comeau is a flat/minimal personal system). Pick based on
  team size and appetite for ceremony — none of them is "more correct" per
  any primary source.
- **Container/presentational components.** Still visible in a lot of
  existing code and tutorials, but its own originator now advises against it
  in favor of custom hooks. A skill built from this research should treat it
  as legacy, not current best practice — with the caveat that this document's
  direct source for that reversal (Abramov's Medium post) could not be
  fetched directly (403) and is corroborated only via secondary sources and
  search snippets.
- **"Helpers" vs. "utils".** Genuinely inconsistent across the community —
  some teams treat them as synonyms, others split on purity/side-effects.
  No primary source addresses this distinction at all.
- **File naming casing (kebab-case vs. PascalCase).** Unresolved,
  preference-driven; not addressed by React or Next.js docs.
- **Data-fetching approach (HTTP API vs. DAL vs. component-level).** Next.js
  is explicit this is *project-stage-dependent*, not a universal ruling —
  DAL for new projects, existing HTTP APIs for established
  organizations/teams, component-level only for prototypes.
- **Barrel files.** Primary source (Vercel/Next.js) acknowledges the problem
  and ships a mitigation (`optimizePackageImports`) rather than banning the
  pattern outright; secondary sources (TkDodo, bulletproof-react) go further
  and recommend avoiding barrels in application code entirely. The
  disagreement is one of degree (mitigate vs. avoid), not of whether a
  problem exists.
- **Strictness of layering (FSD) vs. lightweight convention
  (bulletproof-react, plain colocation).** This is a real, unresolved
  tradeoff between guardrails/enforceability and flexibility/onboarding
  speed — bigger teams and longer-lived codebases skew toward wanting more
  enforced structure; small teams and fast-moving codebases skew toward
  lighter convention.

---

## Sources

### Primary / Official

- [React: Thinking in React](https://react.dev/learn/thinking-in-react)
- [React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [React FAQ: File Structure (legacy docs, still the only official statement on this topic)](https://legacy.reactjs.org/docs/faq-structure.html)
- [Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js: Route Groups (file convention reference)](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)
- [Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions)
- [Next.js: How to think about data security in Next.js (Data Access Layer pattern)](https://nextjs.org/docs/app/guides/data-security)
- [Vercel: How we optimized package imports in Next.js (barrel files)](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)

### Secondary / Community

- [Kent C. Dodds: Colocation](https://kentcdodds.com/blog/colocation)
- [Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/)
- [bulletproof-react: Project Structure (alan2207/bulletproof-react)](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview)
- [TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [Dan Abramov: Presentational and Container Components (original 2015 post; update note referenced secondhand — direct fetch returned HTTP 403)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0)
- [dev.to: RSC and the Echo of "Presentational and Container Components" (corroborates Abramov's reversal)](https://dev.to/fibonacid/rsc-and-the-echo-of-presentational-and-container-components-33i)
- [dev.to: Services vs Utils — What is the difference?](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6)
