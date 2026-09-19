# Constants, utils, hooks, and services — where's the line?

## Constants

**No primary/official guidance exists** from React or Next.js about a
`constants` folder — this is community-convention territory, and it
inherits directly from the colocation principle rather than being a
distinct rule.

- **Colocate first.** Keep a constant next to the single component/module
  that uses it; only promote it to a shared location once ≥2 consumers need
  it — the same logic as component placement.
- **A shared/global constants file for cross-cutting values.** Josh
  Comeau's guide keeps a project-root `constants.ts` for genuinely app-wide
  values — his examples are style tokens (colors, font sizes, breakpoints)
  and public keys.
  ([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))
- Bulletproof-react and FSD both encode this as a real folder in their
  layered structures: a top-level `config`/`shared` tier for global
  constants, plus per-feature/per-slice space for feature-specific ones.
  ([bulletproof-react: Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md);
  [Feature-Sliced Design: Overview](https://feature-sliced.design/docs/get-started/overview))

**Naming convention** (`SCREAMING_SNAKE_CASE` vs. `camelCase` object) is not
addressed by React/Next.js docs — standard JS/TS style-guide territory, not
something to invent a rule for here.

**Disagreement/nuance:** "colocate next to usage" vs. "one global file" is a
genuine size/team-size tradeoff, not a resolved question. Small apps get
away with one `constants.ts`; larger, feature-organized apps push constants
down into feature folders and reserve the root file for truly global values
(design tokens, route names, API base URLs).

## Hooks vs. utils vs. services

**The React team draws the hooks line by one test: does it call a Hook?**
From the official custom-hooks guide:

> *"If your function doesn't call any Hooks, avoid the `use` prefix.
> Instead, write it as a regular function without the `use` prefix... This
> convention guarantees that you can always look at a component and know
> where its state, Effects, and other React features might 'hide.'"*

This is the cleanest primary-source line available: **a function that reads
or subscribes to React state/lifecycle (via other hooks) is a hook and
should be named `useX`; a function that only transforms inputs to outputs —
no hooks inside — is a plain utility function and should *not* be named
`useX`.** The doc's own example: rename a non-hook-calling `useSorted` to
`getSorted`.

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
  "helpers"/"utils" as synonyms instead — this is not fully standardized,
  and no primary source addresses the distinction at all.

([dev.to: Services vs Utils](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6) —
secondary/community, representative of a recurring but not unanimous
distinction)

**Practical decision rule (secondary, but well supported):**

1. Touches React state/lifecycle → **hook** (`useX`).
2. Makes a network call or talks to an external system → **service**.
3. Pure input→output, no side effects → **util**.
4. When in doubt, start in the simplest bucket (`utils/`) and only split
   out `services/`/`hooks/` once the function actually needs those
   capabilities — mirrors Comeau's advice to start with a small fixed set
   of top-level folders and add more only as the codebase demands it.
([Josh W. Comeau: Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/))
