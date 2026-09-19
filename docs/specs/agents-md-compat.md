# Spec: AGENTS.md compatibility

## Problem

`CLAUDE.md` (root + per-package: `server/`, `client/`, `reviewer-core/`,
`e2e/`) currently carries all instructions for AI coding agents working in
this repo. Some tools in use by the team read the open, vendor-neutral
`AGENTS.md` convention instead of `CLAUDE.md`. Today those tools see no
instructions at all.

## Goal

Make agent instructions available under both filenames without maintaining
two copies of the content.

## Non-goals

- Rewriting or restructuring the instructions themselves.
- Filtering content per tool (the instructions are already tool-agnostic).
- Windows/cross-platform symlink support.

## Decision

Use a filesystem symlink, one per location:

```
AGENTS.md -> CLAUDE.md
```

`CLAUDE.md` remains the canonical file that gets edited. `AGENTS.md` is a
symlink, not a copy, so the two can never drift out of sync.

## Scope

Five symlinks, one next to each existing `CLAUDE.md`:

| Location          | Symlink            | Target      |
|--------------------|---------------------|-------------|
| `/`                | `AGENTS.md`         | `CLAUDE.md` |
| `server/`          | `server/AGENTS.md`  | `CLAUDE.md` |
| `client/`          | `client/AGENTS.md`  | `CLAUDE.md` |
| `reviewer-core/`   | `reviewer-core/AGENTS.md` | `CLAUDE.md` |
| `e2e/`             | `e2e/AGENTS.md`     | `CLAUDE.md` |

## Explicitly rejected alternatives

- **`@AGENTS.md` import inside `CLAUDE.md`**: rejected because it's a
  Claude Code-specific import syntax; a tool reading raw `AGENTS.md` would
  see literal `@AGENTS.md` text, not the imported content, defeating the
  purpose.
- **Manual duplication**: rejected — guarantees drift over time with no
  enforcement.
- **`AGENTS.md` as canonical, `CLAUDE.md` as symlink**: rejected — the
  content already exists as `CLAUDE.md` and the team thinks of it that way;
  flipping the direction adds churn with no functional benefit given a
  symlink is direction-agnostic in terms of what agents read.

## Explicitly out of scope (considered, declined)

- Rewording the self-referential title lines (`# dev-digest — CLAUDE.md`,
  etc.) and the "Read when → its `<package>/CLAUDE.md`" line in the root
  file to be filename-neutral. Left as-is by choice.

## Cross-platform note

No Windows development machines or Windows CI runners are involved, so
plain POSIX symlinks are sufficient. If that ever changes, this decision
needs revisiting (symlinks checked out on Windows without
`core.symlinks=true` and developer-mode/admin rights become plain text
files containing the link path, not usable file content).

## Implementation

```sh
ln -s CLAUDE.md AGENTS.md
ln -s CLAUDE.md server/AGENTS.md
ln -s CLAUDE.md client/AGENTS.md
ln -s CLAUDE.md reviewer-core/AGENTS.md
ln -s CLAUDE.md e2e/AGENTS.md
```
