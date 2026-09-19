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

## Test Quality Reviewer

A built-in agent (alongside General/Security/Performance Reviewer) whose
skill(s) direct it to flag test-quality issues **inferable from the diff
alone**: branches or corner cases a new/changed test appears not to exercise,
excessive mocking that could mask real behavior, and test code that reads as
non-deterministic (timing-, ordering-, or randomness-dependent assertions).
It does not consume a coverage report or test-runner output — no such
integration exists in this codebase — so its skill text frames every check
as "from reading the diff," not as coverage-tool-backed.
