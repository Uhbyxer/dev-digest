# 02 — Onboarding Tour page and sidebar entry

Status: done
Blocked by: 01
Spec: ../spec.md

## What to build

The client page for a repo's Tour. Shows an empty state with **Generate tour** (disabled with the reason while the index is not ready), calls generate, then renders the five sections in fixed order as collapsible cards with a sticky "On this page" nav and the header "Generated from index of N files" plus relative refresh time. A section marked not generated shows "could not be generated" without hiding the others. Adds the sidebar item under Workspace pointing to the active repo's Tour, or a repo picker when no repo is active. The existing `/onboarding` Add repository route is not touched.

## Acceptance criteria

- [x] Route renders five sections in order with sticky nav and collapse (AC-1).
- [x] Empty state shows Generate tour; disabled with reason when index not ready (AC-2).
- [x] Header shows file count and relative refresh time (AC-4).
- [x] A not-generated section shows the fallback message; others still render (AC-8).
- [x] Sidebar item routes to the active repo's Tour; repo picker when none active.
- [x] Client component test (mocked `fetch`) covers empty state, disabled Generate, and section rendering (secondary seam).

## Comments

- Reused the existing `messages/en/onboarding.json` (extended) and the nav `onboarding-tour` active key. Added the nav item (`g o`) in `vendor/ui/nav.ts`; `activeKeyFor` now matches only `/repos/:id/onboarding` so the Add repository screen at `/onboarding` doesn't highlight the Tour.
- "No active repo → picker": the app already falls back to the first repo, and an unknown repo id shows `RepoNotFound`; no separate picker built.
