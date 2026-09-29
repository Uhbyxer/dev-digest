# 02 — Onboarding Tour page and sidebar entry

Status: ready-for-agent
Blocked by: 01
Spec: ../spec.md

## What to build

The client page for a repo's Tour. Shows an empty state with **Generate tour** (disabled with the reason while the index is not ready), calls generate, then renders the five sections in fixed order as collapsible cards with a sticky "On this page" nav and the header "Generated from index of N files" plus relative refresh time. A section marked not generated shows "could not be generated" without hiding the others. Adds the sidebar item under Workspace pointing to the active repo's Tour, or a repo picker when no repo is active. The existing `/onboarding` Add repository route is not touched.

## Acceptance criteria

- [ ] Route renders five sections in order with sticky nav and collapse (AC-1).
- [ ] Empty state shows Generate tour; disabled with reason when index not ready (AC-2).
- [ ] Header shows file count and relative refresh time (AC-4).
- [ ] A not-generated section shows the fallback message; others still render (AC-8).
- [ ] Sidebar item routes to the active repo's Tour; repo picker when none active.
- [ ] Client component test (mocked `fetch`) covers empty state, disabled Generate, and section rendering (secondary seam).
