# Where business logic lives

## Client side: custom hooks

React's answer is custom hooks: extract stateful/business logic that's tied
to component lifecycle into a `useX` hook so the component itself expresses
*intent* rather than *implementation* — *"The code of your components
expresses your intent, not the implementation."* See
[constants-utils-hooks-services.md](constants-utils-hooks-services.md) for
the exact hook-vs-util test.
([React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks))

## Server side (Next.js): the Data Access Layer pattern

**Next.js has the most concrete, primary, and recent guidance here.** For
new projects, it recommends a dedicated **Data Access Layer (DAL)**:

> *"For new projects, we recommend creating a dedicated Data Access Layer
> (DAL). This is an internal library that controls how and when data is
> fetched, and what gets passed to your render context. A Data Access Layer
> should: Only run on the server. Perform authorization checks. Return
> safe, minimal Data Transfer Objects (DTOs)."*

The same pattern extends to mutations:

> *"Just as we recommend a Data Access Layer for reading data, you can
> apply the same pattern to mutations. This keeps authentication,
> authorization, and database logic in a dedicated `server-only` module,
> while `"use server"` actions stay thin."*

**The architectural split:** Server Action (`"use server"`) → thin wrapper
that calls into the DAL → DAL holds the actual business/auth/data logic,
marked `server-only`. This centralizes authorization (reducing the risk of
auth bugs scattered across components/actions) and gets a shared
per-request cache via React's `cache()` as a side benefit.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Which data-fetching approach — it's project-stage-dependent, not a universal ruling

Next.js names three approaches explicitly tied to project stage:

- **External HTTP APIs** — for *"existing large applications and
  organizations"* with existing backend teams/services.
- **Data Access Layer** — *"for new projects."*
- **Component-level data access** — *"for prototypes and learning"* only;
  the doc warns this makes it easy to *"accidentally expose private data to
  the client."*

It explicitly recommends **not mixing approaches** — *"choosing one data
fetching approach and avoiding mixing them"* keeps expectations clear for
developers and security auditors. Don't default to the DAL pattern
reflexively; check what stage/scale the project is actually at, and what
approach the codebase has already standardized on.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Server Actions are a separate trust boundary, not a UI-gated one

Server Actions must not skip re-verifying auth/authorization even if the
page that renders them already gated access, because *"A page-level
authentication check does not extend to the Server Actions defined within
it"* — a Server Action is *"a separate entry point"* reachable directly via
POST regardless of whether the UI that would normally trigger it is
rendered. Every exported Server Action is a reachable POST endpoint
regardless of whether it's imported/used in the UI (Next.js strips truly
*unused* ones from the client bundle via dead-code elimination, but any
action that *is* referenced anywhere stays callable directly). **This means
the "thin action, fat DAL" split isn't just tidiness — the DAL is where
authorization actually has to happen, because the action boundary itself is
not a trust boundary.**
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions);
[Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Mutations must not be a side effect of rendering

Next.js explicitly prevents triggering cache revalidation or setting
cookies during render for this reason — side-effectful mutations belong in
a Server Action, not inline in a Server Component's render path.
([Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Where to put Server Actions relative to components

Two supported placements, both first-party:

- **Inline in the component file**, with `'use server'` at the top of the
  async function body — appropriate for actions tightly scoped to one
  component/page.
- **A separate file** (commonly `actions.ts`, colocated next to the route
  it serves, e.g. `app/posts/actions.ts`) with `'use server'` at the top of
  the file, marking every export as a Server Action. This is the pattern
  Next.js's own data-security guide uses throughout, and pairs with the DAL
  recommendation: the action file stays thin and delegates to a
  `server-only` DAL module (e.g. `data/posts.ts`) that holds the actual
  authz/query logic.
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions);
[Next.js: How to think about data security in Next.js](https://nextjs.org/docs/app/guides/data-security))

### Sequential dispatch — an architectural implication, not just a perf note

Next.js dispatches Server Actions **one at a time per client** — triggering
several in quick succession serializes them. The docs explicitly warn
against relying on `Promise.all` to parallelize Server Actions from the
client. If real parallelism is needed: do it *inside* a single Server
Action, fetch in parallel from a Server Component, or use a Route Handler
for non-mutating parallel reads. **Don't design a UI that fires N
independent Server Actions expecting them to run concurrently** — this is a
component-design constraint that follows directly from how the framework
dispatches actions, not an edge case.
([Next.js: Server Actions and Mutations](https://nextjs.org/docs/app/guides/server-actions))
