# 05 — Copy as Markdown, Share link, run-command copy, Open

Status: done
Blocked by: 02
Spec: ../spec.md

## What to build

The small user actions around a rendered Tour: **Copy as Markdown** (all five sections), **Share link** (copies the page's local URL), a copy button on every run command, and **Open** on each critical path. Open uses an in-app read-only file view if one already exists; otherwise it copies the relative path. Implementer confirms which case applies before starting.

## Acceptance criteria

- [x] Copy as Markdown copies all five sections (AC-10).
- [x] Share link copies the Tour page's local URL (AC-10).
- [x] Each run command has a working copy button (AC-6).
- [x] Open opens the file in the existing viewer, or copies the relative path if none exists.
- [x] Client component tests cover each action with mocked clipboard.

## Comments

- No in-app read-only file viewer exists (the diff viewer is PR-specific), so **Open copies the relative path** (spec fallback) and says so in the toast.
- Share link copies `${origin}/repos/:id/onboarding`.
