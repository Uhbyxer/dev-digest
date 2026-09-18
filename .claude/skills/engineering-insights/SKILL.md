---
name: engineering-insights
description: Reads and appends the working module's INSIGHTS.md (in server/, client/, reviewer-core/, or e2e/). Use at the very start of any task that touches one of these modules — read that module's INSIGHTS.md first — and again at the end of the session before your final summary, to append anything substantial newly learned.
---

Before doing any work in server/, client/, reviewer-core/, or e2e/, read that
module's INSIGHTS.md first and treat it as high-confidence guidance.

Before ending the session (right before your final summary), check whether
anything substantial was learned in that module this turn: a fix after
multiple attempts, a repeated error and its resolution, a codebase/library
quirk, an architecture decision, or an unresolved question. Skip silently if
there is nothing new.

If there is something worth recording: re-read the module's INSIGHTS.md
first to make sure it isn't already there, then append one line to the
matching section (What Works / What Doesn't Work / Codebase Patterns / Tool
& Library Notes / Recurring Errors & Fixes / Session Notes / Open
Questions). Never edit or delete an existing line — append only. Write each
entry so it's actionable cold: name what fails/works, why, where, and what
to do instead — not generic statements.
