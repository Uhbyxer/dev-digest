---
name: pr-self-review
description: "Self-reviews all currently open changes (uncommitted work plus everything committed since the merge-base with main) before a GitHub PR is opened, by running the project's OWN existing skills — react-best-practices, onion-architecture, fastify-best-practices, security, etc. — against only the files each skill actually applies to, then blocking the PR if any finding is critical. Use this whenever the user says they're about to open a PR, asks for a 'self review' / 'PR self review' / 'pre-PR check', asks 'is this safe to merge' or 'can I open a PR now', or right before running `gh pr create` — even if they don't name this skill directly. Do not use this for reviewing someone else's PR (that's /code-review) or for reviewing against a written spec — this is a pre-flight gate over the project's own coding-standard skills, run by the person who wrote the diff."
---

# PR Self Review

Runs the project's own skill library as a pre-flight checklist against your
own diff, before you hand it to anyone else. `/code-review` compares a diff
against a spec or a fixed point; this skill compares a diff against the
*standards the repo has already written down as skills* — the same rules
those skills would apply if invoked individually while you were writing the
code, just applied systematically instead of by memory.

The mapping from skill → relevant files is **never hardcoded**. Skills in
this repo get added, renamed, and re-scoped over time (see
`.claude/skills/README.md`), and a stale mapping would silently stop
reviewing files it used to cover. Read each skill's real frontmatter at
run time instead.

## When this runs

- **Manually**, whenever the user asks for a self-review before opening a PR.
- **Before `gh pr create`** — if you're about to run that command as part of
  another task, run this skill first unless the user has explicitly said to
  skip it.
- It is designed to also work as a `pre-push` git hook or a wrapper script
  around `gh pr create` later, since it needs nothing but a git diff and
  read access to `.claude/skills/`. Building that hook is a separate task —
  don't wire it up unless asked.

## Step 1 — Determine the diff scope

The point is to catch problems in *everything that would land in the PR*,
not just the last commit.

```bash
git fetch origin main --quiet 2>/dev/null || true
BASE=$(git merge-base main HEAD)
git diff --name-only "$BASE"...HEAD          # committed since branching off main
git status --porcelain                        # + uncommitted/staged work
```

Union both lists into one set of changed file paths. If working tree changes
exist, include their diff too (`git diff HEAD` for unstaged,
`git diff --cached` for staged) — a self-review that ignores uncommitted
work would pass a diff the user hasn't actually finished writing.

If there are no changed files at all, say so and stop — there's nothing to
gate.

## Step 2 — Read what skills exist and what they claim

List every skill directory under `.claude/skills/*/SKILL.md` and read each
one's YAML frontmatter (`name` + `description`). The description is written
to say what domain and file patterns the skill applies to — that's the
project's own convention (see any existing skill, e.g.
`.claude/skills/onion-architecture/SKILL.md`, for the level of detail to
expect). Don't open the full skill body yet; the frontmatter alone is enough
to decide relevance, and it keeps this step cheap even as the skill count
grows.

Some skills in the catalog aren't review criteria at all — e.g.
`engineering-insights` (a session-log habit) or `mermaid-diagram` (a
notation helper). These naturally fall out in the next step because no
changed file will match their description; don't special-case them here.

## Step 3 — Match skills to the files they actually govern

For each skill, decide which of the changed files (if any) fall inside its
stated domain, by reading its description's own path patterns and subject
matter — not by consulting a fixed table. As of this repo's current skill
set, that reads roughly as:

| Domain signal in the skill's description | Typical changed-file match |
|---|---|
| Next.js / React / RTL, or paths like `client/**`, `*.tsx` | files under `client/` |
| Fastify / Drizzle / Postgres, or paths like `server/src/**` | files under `server/` |
| Onion Architecture (explicitly covers both `reviewer-core/src/**` and `server/src/modules/**`) | files under `reviewer-core/` and `server/` |
| Zod, TypeScript, security | any changed `.ts`/`.tsx` file — these skills describe themselves as cross-cutting |

Treat this table as illustrative, not authoritative — it's what today's
skills happen to say. Always re-derive the match from the actual
descriptions you read in Step 2, since a skill's scope can change without
this file being updated.

Skip a skill entirely if none of the changed files fall in its domain.
Running `react-best-practices` over a PR that only touches
`server/src/modules/repos/service.ts` wastes a pass and gives the user
noise instead of signal.

## Step 4 — Run each matched (skill, files) pair

For each skill with a non-empty file match, review that skill's file subset
against the diff, applying the guidance the skill itself lays out — read its
full `SKILL.md` (and any `references/` it points to) at this point, now that
you know it's relevant. Dispatch these as parallel subagent tasks when there
are more than one or two matched skills, the same way `/code-review` runs
its Standards and Spec passes in parallel: each task gets the skill's name,
the skill's own instructions, and just the diff hunks for its matched files.
Sequential is fine for a small diff with one matched skill.

Each pass should return findings as a flat list, each with:

- **file:line** it applies to
- **severity**: `critical` (would break correctness, security, data
  integrity, or the architecture boundary the skill exists to protect) or
  `suggestion` (style, an idiom the skill recommends, a smaller-quality
  concern)
- a one-line description of the problem and what the skill says to do
  instead

Reserve `critical` for what its name implies. A missed opportunity to
simplify, or a preference the skill states but doesn't treat as a hard
rule, is a `suggestion` — inflating severity defeats the gate in Step 6 by
making it fire on everything.

## Step 5 — Summarize by skill

Present results grouped by the skill that found them (mirroring how the
matching worked), not as one flat list — that keeps the "why does this
matter" context attached to each finding:

```
## onion-architecture — server/src/modules/repos/service.ts
- [critical] service.ts:42 — raw `db.select()` call bypasses the repository
  seam; move this into repository/repos.repo.ts.

## security — server/src/modules/repos/routes.ts
- [suggestion] routes.ts:18 — request body is validated with Zod but the
  error isn't logged before the 400 response; consider using the shared
  error handler for consistency.
```

A skill with a matched file subset but zero findings can be omitted from
the summary, or listed with "no issues found" — don't pad the report with
empty sections.

## Step 6 — Gate the verdict

This is the actual point of running the skill: catching a critical problem
*before* the PR exists, not in review comments after.

- **Any finding marked `critical`, anywhere** → output a clear, hard
  **MERGE BLOCKED** verdict. State exactly which critical findings caused
  it. Do not proceed to open the PR, and do not soften this into a
  suggestion — the user asked for a gate, and a gate that can be argued
  past isn't one. Tell the user to fix the critical findings and re-run
  this skill.
- **No critical findings** → output a clear **safe to open PR** verdict.
  Still show any `suggestion`-level findings underneath it, but make clear
  they don't block anything — the user decides whether to act on them now
  or later.

Never silently downgrade a critical finding to get to a clean verdict, and
never let "most of it looks fine" talk you out of surfacing a critical one
that a matched skill actually found.
