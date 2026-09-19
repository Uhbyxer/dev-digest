# Next.js App Router architecture

## Server vs. Client Components — the decision rule

Straight from the docs:

> Use **Client Components** when you need: state and event handlers (e.g.
> `onClick`, `onChange`); lifecycle logic (`useEffect`); browser-only APIs
> (`localStorage`, `window`, `navigator.geolocation`); custom hooks.
>
> Use **Server Components** when you need: to fetch data from
> databases/APIs close to the source; to use API keys/tokens/secrets
> without exposing them to the client; to reduce JS sent to the browser; to
> improve FCP and stream content progressively.

Layouts and pages are Server Components **by default**; `'use client'` opts
a module — and everything in its import/render tree — into the client
bundle.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

## Push client boundaries as deep/narrow as possible

The docs' own example keeps a `<Layout>` (logo, nav — static) as a Server
Component and marks only the interactive `<Search />` inside it as a Client
Component, rather than marking the whole layout client-side. Once a file
has `'use client'`, *"all of its imports and the components it directly
renders are included in the client bundle"* — so the boundary should sit at
the smallest interactive unit, not at a convenient ancestor. When reviewing
or writing a Client Component, check whether the `'use client'` boundary
could be pushed further down into a smaller leaf component.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

## Interleaving: pass Server Components as children/props into Client Components

Importing a Server Component from inside a Client Component is explicitly
unsupported (it would require a new server round-trip). Instead, compose
from a parent Server Component and pass server-rendered content down as
`children`/props — the canonical example is a client-side `<Modal>`
wrapping a server-rendered `<Cart>` passed as `children`. This keeps
server-rendered data deep inside an interactive shell without turning that
data-fetching subtree into client code.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

## Context providers

Must be Client Components (React context isn't supported in Server
Components), but should be rendered **as deep in the tree as possible** —
the docs' example wraps only `{children}`, not the entire `<html>`
document, specifically *"to make it easier for Next.js to optimize the
static parts of your Server Components."*
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

## Environment poisoning prevention

Mark server-only modules with the `server-only` package import so that
accidentally importing server logic (e.g. something reading
`process.env.API_KEY`) into a Client Component produces a **build-time
error** instead of a silent broken/insecure runtime behavior. A parallel
`client-only` package exists for the inverse case. Pair this with the Data
Access Layer pattern in
[business-logic-and-data-access.md](business-logic-and-data-access.md) —
the DAL module should be `server-only` by construction.
([Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components))

## Route groups

`(folderName)` groups routes without affecting the URL. Documented uses:
organizing by section/team/intent, enabling multiple (or nested) layouts at
the same URL segment level, and opting a subset of routes into a shared
layout while excluding sibling routes.
([Next.js: Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups);
[Next.js: Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure))

## Colocating route-specific vs. shared code

See [placement-and-decomposition.md](placement-and-decomposition.md) for
the full three-strategy breakdown. Private folders (`_folder`) and route
groups (`(folder)`) are the two mechanisms Next.js provides to make
colocation tidy inside `app/` without accidentally creating new routes.
