---
name: dependency-checker
description: "Analyzes the dependencies of every package in this repo (server, client, reviewer-core, e2e, mcp, evals) and produces one structured report: a Mermaid graph of how the packages depend on each other, an installed-size breakdown per package, prioritized findings (P0/P1/P2/Info) and a short action summary. Use whenever the user asks to check, audit, review, map, visualize or slim down dependencies — 'what depends on what', 'why is node_modules so big', 'any unused or duplicated packages', 'version drift', 'is anything importing across packages the wrong way', 'dependency report', 'dependency graph', 'bundle/install weight' — even if they don't say 'dependency checker'. Read-only: it never edits package.json or removes anything; removals are only recommendations for the user to confirm. Not for CVE/vulnerability scanning (use the security skill) or for upgrading packages."
---

# Dependency Checker

Produces one report that a developer can read top to bottom in two minutes:
what the packages are, how they depend on each other, what weighs what, what
to fix first. The value is in the fixed structure — the same five sections in
the same order every run, so reports can be compared over time.

## How this repo is wired (get this right or the graph is wrong)

- It is **not a monorepo workspace.** `server/`, `client/`, `reviewer-core/`,
  `e2e/`, `mcp/` (and `evals/`) are independent packages, each with its own
  `package.json` and lockfile. Never describe them as linked by `workspace:*`
  or pnpm workspaces.
- Code is shared through **tsconfig `paths` aliases** (`@devdigest/shared`,
  `@devdigest/reviewer-core`, `@devdigest/server`, `@devdigest/ui`) and
  occasionally by relative imports that climb out of the package. So there
  are two kinds of dependency and the report must keep them apart:
  - **internal** — one package importing another package's source (alias or
    relative path). Invisible to `npm ls`; found by reading imports.
  - **external** — npm packages declared in `package.json`.
- An alias used with its exact name (`@devdigest/reviewer-core`) goes through
  the target's public entry point. An alias with a subpath
  (`@devdigest/server/modules/...`) or a relative `../../other/src/...` reaches
  into another package's internals and bypasses its public surface.

## Step 1 — Collect facts

If you can run commands, run the collector from the repo root. It is
read-only, needs no installs and prints one JSON document:

```bash
node .claude/skills/dependency-checker/scripts/collect.mjs
```

It gives, per package: prod/dev dependencies with version range, installed
size in KB (the package's own folder only), whether anything uses it
(`status`: `imported`, `types-for-imported`, `referenced-as-string` — e.g. a
pino transport name or a CSS `@import` —, `used-by-tooling`,
`no-reference-found`), duplicates between prod and dev; plus `internalEdges`
(who imports whom, alias vs relative, `resolvesTo` = the folder the alias
actually lands in, public entry vs deep, test-only), `versionDrift` (same
dependency, different ranges across packages) and `notes` (missing
`node_modules`, parse problems). Do not re-derive these by hand when the
script works; spend the effort on interpretation.

`viaPublicEntry: true` only means "the alias was used without a subpath". Read
`resolvesTo` too: `@devdigest/shared` resolves to `server/src/vendor/shared`, so
a `reviewer-core -> server` edge through it is the shared-contracts alias, not
reviewer-core reaching into server logic.

If you cannot run commands, the user's message will contain the data (package
files, sizes, import greps). Use that and say in Scope that the data was
supplied rather than measured. If sizes or an import list are missing, say so
instead of estimating.

Treat `status: no-reference-found` as a *candidate* for unused, not proof —
`typescript`, `@types/*`, `postcss`, CLI tools and config-only packages are
normally used without being imported. Before calling something unused, check
that nothing in `scripts`, config files or dynamic `require`/`import()` needs it.

## Step 2 — Write the report in exactly this structure

Use these five headings, in this order, every time. Empty sections still
appear, with "none found".

### 1. Scope
Which packages were analyzed (list them all: client, server, reviewer-core,
e2e, mcp, …), how sizes were measured (installed `node_modules` folder per
package, own files only, transitive deps excluded), when, and anything that
limits the result (a package without `node_modules`, data supplied by the
user instead of measured).

### 2. Dependency graph
A Mermaid `flowchart LR` in a fenced ```mermaid block. One node per package.
One edge per internal dependency, labeled with the mechanism and weight, e.g.
`server -->|"alias @devdigest/reviewer-core (12)"| reviewer-core`. Draw a deep or
relative import as a dashed edge (`-.->`) and say why in the label. Add the
heaviest external dependency of each package as a small side node only if it
helps; do not draw every npm package. Under the diagram, one line per
non-obvious edge or any cycle (A imports B and B imports A is a finding, see
Step 3).

### 3. Size breakdown
A table per package, heaviest first, top 10 plus a "rest" row, with a total:

| Dependency | Version | Type | Installed size | Note |
|---|---|---|---|---|

Sizes in human units (`132 MB`, `4.2 MB`), never raw KB; say once in Scope that
1 MB = 1024 KB (the script uses `du -sk`). The "rest" row is the package total
minus the rows shown, so every table adds up to its total. A package with no
`node_modules` (`installed: false`) gets "unknown — run pnpm install" instead
of a table and is left out of every sum, with that stated. Finish with a
one-row-per-package comparison (prod count, dev count, total size) so the
reader sees which package carries the weight. Make clear sizes are the
package's own folder, so a small number can still pull a big tree.

### 4. Findings & Priorities
Group findings under severity headings **P0**, **P1**, **P2**, **Info** in
that order. A flat list is not acceptable. Each finding is one bullet:
**what** (names the package, dependency or file) — **evidence** (the number,
the import line, the versions) — **recommendation** (a concrete change).

| Tier | Meaning | Typical examples here |
|---|---|---|
| **P0** | Breaks isolation or can break a build/runtime; fix before merging more code | production code reaching into another package's internals (deep alias subpath or relative `../other/src`); an import cycle between packages through anything other than the shared-contracts alias; a runtime import of a devDependency |
| **P1** | Real cost or drift, fix soon | declared but never referenced dependency (confirmed unused); same dependency at different major/minor ranges across packages (e.g. `zod`); a package heavy relative to its use; a dependency in both prod and dev |
| **P2** | Hygiene | minor range drift on tooling (`typescript`, `vitest`, `@types/node`); test-only imports crossing packages; the package-level cycle created by `@devdigest/shared` living in `server/src/vendor/shared` (by design here, but moving the contracts to a neutral folder would remove it); duplicated small utilities |
| **Info** | No action needed, useful context | candidates that are normal tooling; packages without `node_modules`; expected edges like the shared-types alias |

Judge severity by consequence, not by size alone: a 200 MB test-runner in a
dev-only package is Info; a 2 KB production import across a package boundary
can be P0. Test-only crossings (`testOnly: true`) are at most P2. Name which cycle you
mean: the `@devdigest/shared` one is the documented sharing mechanism of this
repo (P2); a cycle through service/adapter code would be P0.

### 5. Summary
Three to five takeaways, ordered by priority, each one sentence that names the
package/dependency and the action ("Remove `moment` from `server/package.json`
(P1, 4.2 MB, no import found)"). End with the single thing to do first.

## Rules that keep the report trustworthy

- **Read-only.** Never run `npm/pnpm remove`, edit `package.json`, or delete
  anything. Removals and version bumps are recommendations the user confirms;
  phrase them as "Recommend removing…", never as "Removed…".
- **Be specific.** Every finding names a package, dependency or file. "Consider
  optimizing dependencies" is not a finding.
- **Separate internal from external** in the graph, the findings and the wording.
- **Don't invent numbers.** If a size or count is not in the data, write
  "unknown (reason)".
- **Don't pad.** Fewer, evidenced findings beat a long speculative list. If a
  tier is empty, say so in one line.
- Security advisories are out of scope; if the user asks about CVEs, point to
  the `security` skill.
