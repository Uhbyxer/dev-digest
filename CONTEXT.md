# dev-digest — Domain Context

Single-context glossary for dev-digest (local-first AI PR review). See
`docs/adr/` for decisions that were hard to reverse or surprising without
context.

## Skill

A named, versioned block of **markdown text** linked into an agent's review
prompt. A Skill has no behavior of its own — it cannot execute code, call a
tool, or make a network request. It is pure prompt content: rules, a rubric,
or a convention the LLM should apply while reviewing.

- `type`: `rubric | convention | security | custom` — a label for the UI
  (grouping/badges), not a behavioral switch.
- `source`: `manual | imported_url | extracted | community` — governs how
  much the *prompt-assembly layer* trusts the skill's body (see **Skill trust
  tier** below). `manual` = typed by a workspace user directly in the Skill
  Editor. `imported_url` / `extracted` = brought in via the Import flow.
  `community` = reserved for a future shared-skill marketplace.
- `description`: written *directively*, as the skill's own interface — it
  tells a reader (or an agent choosing whether to attach the skill) what the
  skill does and when it applies, not what it "is" as a data record.
- `enabled`: a skill can be disabled globally without unlinking it from every
  agent — the link (`AgentSkill.enabled`, if present) is a separate,
  per-agent override on top of this.

## AgentSkill

The many-to-many link between an Agent and a Skill, carrying:

- `order`: an integer, unique **within one agent's set of links** (not
  globally). Determines the sequence skill bodies appear in the assembled
  prompt — earlier order = earlier in the prompt. Two skills linked to
  *different* agents can freely share the same order value; it's scoped per
  agent, not per skill.
- One Skill can be linked to many Agents simultaneously (reuse is the whole
  point of this feature) — editing a shared Skill's body changes what every
  linked agent sees on their *next* review run. There is currently no
  mechanism to pin an agent to a specific past version of a linked skill (see
  **Known gap: skill version pinning** below).

## Skill trust tier

Not every Skill body enters the prompt the same way. `assemblePrompt`
(`reviewer-core/src/prompt.ts`) treats content as either **trusted**
(concatenated straight into the system-adjacent instructions) or
**untrusted** (wrapped in `<untrusted>` delimiters + covered by the
injection guard, per the existing diff/PR-description/repo-map handling).

- A **`manual`** skill (typed by a workspace user in the Skill Editor) is
  **trusted** — the same person who configured the agent wrote it.
- An **`imported_url`**, **`extracted`**, or **`community`** skill is
  **untrusted-but-directive**: content someone brought in from outside the
  workspace owner's own hands (a file on disk, a URL, another workspace).
  It still functions as a rule the agent should follow (unlike a diff, which
  is pure data to analyze) — but it must not be treated with the same trust
  as something the current user typed themselves. See
  [ADR: skill trust tiers in prompt assembly](docs/adr/0001-skill-trust-tiers.md).

## Import (skill)

The flow for bringing an externally-authored Skill into the workspace:
upload a single markdown file, or an archive containing exactly one markdown
file at its root. The importer:

1. Locates and reads **only** the one markdown entry — parses YAML
   frontmatter (`name`, `description`, following this repo's own
   `.claude/skills/*/SKILL.md` convention) plus the body below it.
   `type` is never present in that convention; it always defaults to
   `custom` and is left for the user to correct.
2. Never opens, extracts, or executes any other file in the archive —
   there is no allow/deny list of file types to reason about, because
   nothing but the one `.md` file is ever read.
3. Renders a **preview** of the parsed name/description/type/body.
4. Persists the Skill only after the user explicitly confirms the preview —
   nothing is saved on upload alone.

This is deliberately **not** the same mechanism as a Plugin import
(`PluginBundle`/`PluginSkill`, `POST /plugins/import` — L08 scope, not yet
built). Plugin import moves a *bundle* of agents+skills+evals+conventions
with its own `installed_plugins` bookkeeping; Skill import produces exactly
one `Skill` row and shares no code path with it.

## Convention

A candidate house rule detected by scanning a repository's own source for a
recurring pattern (e.g. "always use async/await instead of `.then()`
chains"). A Convention is an unreviewed *candidate*, scoped to one repo, with
a `confidence` score and evidence (`evidencePath`, `evidenceSnippet`). It is
distinct from a **Skill**: a Skill is the prompt content that actually
reaches an agent; a Convention only becomes one when a user explicitly
reviews and merges it (see **Create skill from conventions**).

- `status`: `pending | accepted | rejected` — starts `pending`. Rejecting is
  a soft-delete: the row is kept so a later re-scan can recognize the same
  convention (matched by evidence location + normalized rule text) and
  suppress it from resurfacing, rather than showing it again every scan.
- The `rule` text is user-editable (title/description only) both before and
  after acceptance; `evidencePath`, `evidenceSnippet`, and `confidence` are
  detection output and stay read-only. Editing never changes `status` on its
  own.
- Not to be confused with `memory.kind = 'convention'` — that's a separate,
  RAG/embedding-backed subsystem for cross-session memory, unrelated to
  per-repo-scan detection candidates.

## Create skill from conventions

The flow that turns `accepted` Conventions into a new Skill. Acceptance
*is* selection — there is no separate "selected but not accepted" state;
accepting a Convention both marks it reviewed-and-valid and includes it in
the next skill created from that repo's Conventions.

- Always creates a **new** Skill (v1). Merging into an existing Skill on a
  later re-scan is out of scope for now.
- The resulting Skill is always `source: extracted`, per
  [ADR: skill trust tiers](docs/adr/0001-skill-trust-tiers.md) — even if the
  user edited a convention's text before merging. Acceptance and editing are
  not the same guarantee as a user typing content from scratch in the Skill
  Editor, so the body stays untrusted-but-directive rather than becoming
  `manual`.
- A re-scan of the same repo is additive: it never touches existing
  `accepted`/`rejected` rows, only adds new `pending` candidates (skipping
  ones that dedupe-match an existing `rejected` row — see **Convention**).

## Known gap: skill version pinning

`agent_versions.config_json.skills` stores the linked skill **ids** at
snapshot time, not `{skill_id, version}` pairs. Because Skills are
independently versioned (`skill_versions`) and shared across agents, editing
a shared Skill's body retroactively changes what an old `agent_versions`
snapshot would "replay" with, if anything ever replays it. Nothing consumes
`agent_versions` for replay today (that's an eval-pipeline concern, not yet
built) — this is a documented gap for whoever builds that consumer, not a
bug in the current feature.

## Context Document

A Markdown file (`.md` only, max 100 KB) that lives in a repo's own tree
under `.devdigest/specs/`, `.devdigest/docs/`, or `.devdigest/insights/`. It
is a *file*, not a database row: there is no `context_documents` table.
Listing, viewing, editing, creating, uploading, and deleting happen on the
Project Context page against the **working tree of the repo's clone**, with
all paths confined to those three folders (traversal, symlinks escaping the
folders, and non-`.md` files are refused).

- Distinct from a **Skill**: a Skill is workspace-wide prompt content owned
  by the DB; a Context Document is repo-scoped reference material owned by
  the repo's files and only reaches a prompt when attached (see
  **Attachment**).
- Distinct from `memory` (RAG/embedding-backed) — Context Documents are
  injected whole, never retrieved or chunked.
- Token counts shown in the UI are an estimate, `ceil(chars / 4)`.

## Attachment

A link that makes one Context Document part of an Agent's or a Skill's
context. Stored in `context_attachments` (`repo_id`, `owner_type`
`agent | skill`, `owner_id`, `path`, `order`). `path` is a plain string, not
a foreign key, because documents are files. `owner_id` is polymorphic (no
FK); attachments are detached by the agents/skills repositories when the
owner is deleted, and by the Project Context page when the document is.

- `order` is scoped per `(repo, owner)`, like `AgentSkill.order`.
- The **effective set** of an agent run is the agent's own Attachments in
  `order`, then the Attachments of each of its linked, globally-enabled
  Skills in `agent_skills.order`, with duplicate paths removed (first
  occurrence wins).
- Attachments are per-repo and do **not** pin a document version (see
  **Known gap: Project context base-branch reads**).

## Project context block

The `## Project context` section of the review prompt, built from the
effective set. Every document is emitted with its path (`Path: <path>`) and
wrapped in `<untrusted>` delimiters, exactly like the diff and PR
description: it is data the agent may consult, never instructions, and there
is no LLM quarantine step. Built by the pure
`serializeProjectContext` in `reviewer-core/src/project-context/` and fed to
`assemblePrompt` via `PromptParts.specs`. Omitted entirely when the effective
set is empty. The exact injected text, per-document token estimates, and any
skipped documents are stored on the run trace (`project_context`;
`specs_read` holds the paths). An effective-set total over 8,000 estimated
tokens raises a warning in the UI; it does not truncate.

## Known gap: Project context base-branch reads

At run time each document is read **once, from `origin/<default branch>`**
(`git show`), so the run sees a stable snapshot of what is on the base
branch. The Project Context page, however, edits the clone's **working
tree**. A document created or edited only locally is therefore **not**
injected into runs until it is on the base branch; a document attached but
absent there is skipped and recorded in the trace's `skipped` list. This is
deliberate (spec AC-25, confirmed by the user) — the page shows a "local
edit, not on base branch" caveat — not a bug.

Related limits of the same feature:

- Only runs through `ReviewRunExecutor` (`server/src/modules/reviews/run-executor.ts`)
  get a Project context block. The CI and MCP review paths do not use
  `run-executor` and receive none.
- Attachments store only `path` per repo — no document version or commit is
  pinned, so what a run sees is whatever the base branch holds at run start.
  Same class of gap as **Known gap: skill version pinning**.

## Smart Diff

A computed (never persisted) view of a PR's changed files, grouped by **file
role** instead of GitHub's raw file order, with review findings surfaced
inline. Recomputed fresh on every request from the PR's current files +
findings — there is no `SmartDiff` row in the database.

- **File role**: which of five buckets a changed file belongs to —
  `core | tests | wiring | docs | boilerplate` — decided by a pure,
  order-sensitive pattern match on the file's path (first matching pattern
  wins). Not to be confused with a **Finding**'s `category` (e.g.
  security/performance): role classifies the *file*, category classifies a
  *finding*. Always say "file role," never "category," when talking about
  Smart Diff grouping.
  _Avoid_: category, classification (when role is meant)
- **Group**: the set of a PR's files sharing one file role, rendered as one
  collapsible section (docs and boilerplate start collapsed; the rest follow
  the existing auto-expand-by-size rule). Groups with zero files are omitted
  rather than shown empty. Files within a group keep their original relative
  order from GitHub's file list — Smart Diff only buckets and reorders
  *groups*, never files within one.
- **Original order**: the alternate, ungrouped view — GitHub's own file
  order, unchanged. A per-visit toggle, not a persisted preference.
- A file **"has findings"** if any finding (accepted, dismissed, or neither)
  is anchored to one of its lines — dismissing a finding mutes its display,
  it does not remove the file from that count.

## Test Quality Reviewer

A built-in agent (alongside General/Security/Performance Reviewer) whose
skill(s) direct it to flag test-quality issues **inferable from the diff
alone**: branches or corner cases a new/changed test appears not to exercise,
excessive mocking that could mask real behavior, and test code that reads as
non-deterministic (timing-, ordering-, or randomness-dependent assertions).
It does not consume a coverage report or test-runner output — no such
integration exists in this codebase — so its skill text frames every check
as "from reading the diff," not as coverage-tool-backed.

## Onboarding Tour

A generated, stored guide to an unfamiliar **repo**, made of exactly five
sections: **Architecture overview**, **Critical paths**, **How to run
locally**, **Guided reading path**, and **First tasks**. One current Tour per
repo; regenerating replaces it (no history). It is a generated artifact, not
authored content — distinct from a **Context Document**, which is a file a
human wrote and owns.

- **Onboarding Generator** is the name of the *feature/process* that
  produces a Tour; the artifact users read is always the **Onboarding Tour**.
- A Tour is **stale** when the repo index it was built from is newer than
  the Tour. Staleness is only displayed; it never triggers regeneration on
  its own. A Tour is first created, and later refreshed, only by an explicit
  user action.
- **Critical path**: a file the Tour singles out because much of the repo
  depends on it (ranked by dependents), with a one-line role.
- **Share link**: copies the Tour's local in-app URL. Local-first — it is
  only meaningful on the same machine.
- Not to be confused with the **Add repository** screen, which currently
  lives at the `/onboarding` route. That route is about adding a repo, not
  about a Tour.

## PR Brief

A generated, stored one-card summary of a **pull request** for a reviewer who
opens it cold, shown on the Overview tab. One current Brief per PR;
regenerating replaces it (no history). It is a generated artifact, distinct
from an **Onboarding Tour** (which is about a repo, not a PR).

A Brief is made of a **summary** (what the PR does and why), **Risk areas**,
and **Review focus**, shown next to the PR's **Intent** and **Blast radius**.
Only the summary, Risk areas and Review focus are written by the model;
Intent, Blast radius and diff statistics are computed facts the model is
given, never re-derived by it. The model never reads diff hunk bodies.

- **Risk area**: a concrete risk in the PR with a title, a severity
  (`high | medium | low`) and at least one file that is part of the PR or of
  its Blast radius. A risk with no verifiable file is dropped, not shown.
- **Review focus**: an ordered "read these first" list. Each item is a file,
  an optional line, and a reason. A line is shown only if it falls inside a
  changed range of that file; otherwise the item shows the file alone.
- **Missing data**: if the PR has no Intent or no Blast radius, the Brief is
  still generated and says explicitly which data was unavailable.
- A Brief is **stale** when the PR's head commit differs from the one it was
  generated for. Staleness is only displayed; regeneration is always an
  explicit user action.
- The Brief's **specs** are the Attachments of the repo's enabled agents (and
  their linked skills), deduplicated, read from the base branch like a
  **Project context block**, and treated as untrusted data.
