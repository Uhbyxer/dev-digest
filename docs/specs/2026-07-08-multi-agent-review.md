# Spec: Multi-Agent Review (Worktree A)   |   Spec ID: SPEC-2026-07-08-multi-agent-review   |   Status: draft
Supersedes: none
Designs: `docs/design/multi-agent-review-*.png`, `docs/design/pr-page-*.png` (see [Designs](#designs))

> Based on `specs/2026-07-08-multi-agent-review.md` from branch `lesson-7-lab/multiagents-finish`
> of `ai-agentic-engineering-neo/dev-digest`, extended with the mockups. Everything added from the
> designs is marked **(design)**; new ACs are numbered AC-25+ so the original numbering is unchanged.

## Problem & why

A real PR is heterogeneous — it mixes security, performance and domain concerns at
once. Today a reviewer runs **one** agent (or blindly "all") and has to pick a focus up
front; running several specialised agents in parallel closes the PR from every angle in
one pass. But raw fan-out creates three problems this feature must solve:

1. **Duplicate noise.** Three agents independently flag the same obvious bug; without
   cross-agent grouping the user reads three identical findings and stops trusting the
   tool. We need a "same place in the code" grouping so duplicates collapse and genuine
   *disagreements* become visible.
2. **No live feedback.** Running several agents without a live window is minutes of
   anxious spinner-watching. We need per-agent live status (who finished, who is
   thinking, who failed) and a link to each run's trace.
3. **No cost/time foresight.** There is no pre-run estimate in the product today. Users
   want to know "≈ 8.2s · $0.20 · parallel fan-out" *before* committing to a run.

Attribution of "which agent found what" is preserved in the data as raw material for a
future Per-Agent Stats feature (out of scope here).

## Designs

| Screen | File | What it shows |
|---|---|---|
| PR page — agent picker | `docs/design/pr-page-agent-picker.png` | "Run Review ▾" opens **Pick agents to run** (+ "Clear"): checkbox rows with agent name and `~6s` estimate, blue **Run multi-agent review (2)** button, **Configure agents…** footer link. |
| PR page — Compose menu | `docs/design/pr-page-compose-review-menu.png` | "Compose review ▾" → *Compose from findings* / *Compose blank review*. **Context only — out of scope** (see Non-goals). |
| Configure run | `docs/design/multi-agent-review-configure-run.png` | Breadcrumb *Multi-Agent Review › Configure run*. Step **1 Pull request** (dropdown `#482 · …`), step **2 Agents to run** (+ "Select all"): colour-accented agent cards (checkbox, icon, name, teaser, `8.2s · $0.06`); unchecked card is dimmed. Primary button **Run multi-agent review (4)** + summary `≈ 8.2s · $0.20 · parallel fan-out`. |
| Results — Columns, 4 agents | `docs/design/multi-agent-review-columns-4-agents.png` | One card per agent: coloured top border, icon, name, `time · cost`, score ring; finding rows (severity icon, title, `file:line`); footer **View trace** + `N findings`. "Where agents disagree" below. |
| Results — Columns, 2 agents | `docs/design/multi-agent-review-columns-2-agents.png` | Same with 2 columns filling the width; header totals `2 agents · parallel · 9.1s total · $0.12`; **Columns / Tabs** segmented control top-right; "Show only conflicts" switch. |
| Results — Tabs, 4 agents | `docs/design/multi-agent-review-tabs-4-agents.png` | One tab per agent with a coloured score badge; agent summary card (score ring, agent name, one-line summary, **View trace**, `time · cost`); finding accordion — expanded card shows rationale, **Suggested fix**, action row. |
| Results — Tabs, 2 agents | `docs/design/multi-agent-review-tabs-2-agents.png` | Same with Customer-Facing / Architecture tabs; "Reply to author" hovered. |

Common chrome: top bar breadcrumb + search + refresh + notifications; sidebar with a **Multi-Agent Review**
item in the GLOBAL group; **Configure run** button at the top-left of the results page leads back to Configure run.

## Existing surface — Build vs Reuse inventory

Requirement from the request: mark each capability BUILD (new) or REUSE (exists). Grounded
against the current code. (References describe what exists so the planner knows the reuse
targets; they are **not** a prescription of where new code must live.)

| Capability | Verdict | Grounding |
|---|---|---|
| Trigger a review that fans out to several agents | **REUSE (partial)** | `POST /pulls/:id/review` (`server/src/modules/reviews/routes.ts`) already resolves 1 agent or `all:true` into N `agent_runs`. Body `RunRequest` = `{agentId?, all?}` — **no arbitrary subset**, so accepting a chosen *set* is BUILD. |
| Per-agent execution with failure isolation | **REUSE + BUILD** | `run-executor.ts` catches per-agent errors and continues, but runs agents SEQUENTIALLY (`for…of await`). **Decision: worktree A makes the fan-out parallel** (`Promise.allSettled`, failure-isolated) so `total_time = max` holds and the "parallel fan-out" label is real. `run-executor` lives in `server/src/modules/reviews/` — inside worktree A's allowed surface (only `ci/` and `agent-runner/` are off-limits). |
| Per-run persistence (status/duration/tokens/cost/score/blockers/error) | **REUSE** | `agent_runs` table (`server/src/db/schema/runs.ts`): `status ∈ {running,done,failed,cancelled}`, `durationMs`, `tokensIn/Out`, `costUsd`, `findingsCount`, `score`, `blockers`, `error`. |
| SSE live event stream + replay buffer | **REUSE** | `GET /runs/:id/events` (per-run, in-memory `RunBus`, `server/src/platform/sse.ts`). `RunEvent = {runId, seq, kind∈{info,tool,result,error}, msg, t, data?}`. No dedicated started/finished/cost event kinds; lifecycle is derived. |
| Run trace drawer + live log primitive | **REUSE** | The **same** `RunTraceDrawer` used on the PR page's "Agent runs" section (`client/…/pulls/[number]/_components/RunTraceDrawer`), opened via the `?trace=<runId>` URL search param (`page.tsx` reads `search.get("trace")`). Props: `{ runId, running, findings, agentName }`. Tabs: **Trace** (Configuration / Stats / Prompt assembly [system·skills·memory·specs·diff with tokens] / Raw / Output / Copy) and **Live-log**. Backed by `useRunTrace(runId)` + `GET /runs/:id/trace` (`RunTrace`) and the SSE live stream + replay buffer. It is currently colocated under the PR route, so reuse from the new page implies it becomes a shared component (a structural move, not a rewrite). |
| Live-status source of truth | **REUSE** | `GET /pulls/:id/runs/active` (polled ~4s) + `GET /pulls/:id/runs` (history, `RunSummary`). |
| Findings storage + Accept/Dismiss | **REUSE** | `findings` table (confidence, severity, category, start/end line, rationale, suggestion, accepted_at/dismissed_at); `POST /findings/:id/(accept|dismiss)`; `FindingCard`. |
| `multi_agent_runs` grouping (service + link + routes) | **BUILD** | Table `multi_agent_runs` is a **stub** (`id, workspaceId, prId, ranAt` only); zero reads/writes; no FK from `agent_runs`. |
| Multi-agent read view (columns + conflicts + totals) | **BUILD** (contracts REUSE) | Zod contracts `MultiAgentRun`, `AgentColumn`, `Conflict`, `ConflictTake` already exist in `vendor/shared/contracts/observability.ts` (server **and** client copies). **No route/service implements them.** **Decision: served by new `POST /pulls/:id/multi-agent-run` + `GET /pulls/:id/multi-agent`.** |
| Cross-agent finding-match rule ("same place") | **BUILD (server)** | **Not found in reviewer-core or server.** reviewer-core only has the diff-grounding gate (finding vs diff, not finding vs finding). The requirement's premise that this rule is "done in reviewer-core" is **false**. **Decision: worktree A builds the match rule + conflict grouping on the server** over persisted findings using a **deterministic** test — same file AND overlapping line ranges only, no essence/semantic/embedding comparison; the client only renders the computed groups. |
| Pre-run time/cost estimate | **BUILD (no new endpoint)** | Raw material exists (`agent_runs.costUsd`/`durationMs`) + a proven SUM/GROUP-BY aggregation pattern. **Decision: no separate estimate route** — the existing agents-list response (used by the picker / Configure run) is extended with per-agent `est_duration_ms`/`est_cost_usd`/`has_history`; the client computes the sum/max summary. |
| Agent picker (PR dropdown) | **BUILD** | Replaces `RunReviewDropdown` (`…/_components/RunReviewDropdown`), currently mounted in `PrDetailHeader`. |
| Multi-Agent Review page + Configure run + nav item | **BUILD** | No such route or GLOBAL nav item exists (`vendor/ui/nav.ts` has only WORKSPACE + SKILLS LAB). |
| Columns / Tabs result views | **BUILD** | No component exists. |
| Learn / Reply / Turn into eval case / Compose actions | **BUILD (UI placeholder only, deferred)** | `FindingActionKind` includes `learn`/`reply` and `useFindingAction` forwards `reply`, but only `accept`/`dismiss` have server routes. Turn-into-eval / Compose have contracts but no client UI. **Decision: only Accept/Dismiss are functional in worktree A; Learn / Reply to author / Turn into eval case render as visible non-functional placeholders reserved for future work (ДЗ Memory / evals L06).** |

## Goals / Non-goals

- **Goal:** a fast agent picker on the PR page that lets the user run a chosen *set* of
  agents (not just one or all).
- **Goal:** a standalone Multi-Agent Review page with a Configure-run step (pick PR +
  agents + pre-run estimate) and a results screen with two toggleable views (Columns,
  Tabs + detail).
- **Goal:** group each fan-out into one persistent multi-agent run that links its per-agent
  runs, and expose it as a single result resource (columns + conflicts + totals).
- **Goal:** a "Where agents disagree" block that groups findings by shared code location
  across agents, shows each agent's verdict (including "did not flag"), and a
  "Show only conflicts" toggle.
- **Goal:** live per-agent status in the Columns headers and a "View trace" link from each
  agent, reusing the existing SSE + trace surface.
- **Goal:** a pre-run estimate of total time and cost derived from past runs.
- **Non-goal:** the review engine internals — `ci/` and `agent-runner/` are **out of
  scope** and must not be touched.
- **Non-goal:** Per-Agent Stats / Agent Performance page (`GET /agents/:id/stats`) — the
  attribution data is preserved as raw material, but the stats surface is future work.
- **Non-goal:** the Compose Review drawer (curating findings before publishing a review) —
  it is a separate feature. The "Compose review ▾" button visible on the PR-page mockup is
  **not** part of this feature and is not added or changed here **(design)**.
- **Non-goal:** the other GLOBAL nav items shown on the mockups (Memory, Agent Performance,
  CI Runs) — only the **Multi-Agent Review** item is added **(design)**.
- **Non-goal:** fully implementing Learn / Turn into eval case / Reply-to-author behaviour
  (ДЗ Memory hook and evals L06 bridge) — only Accept/Dismiss are functional here; the rest
  are visible placeholders (AC-19).
- **Non-goal:** changing the reviewer-core grounding gate or untrusted-input handling.

## User stories

- US1: As a reviewer on a PR page, I want a quick picker to choose which agents run, so
  that I can fan out to exactly the specialists this PR needs.
- US2: As a reviewer, I want a Configure-run screen to pick a PR and agents with a cost/time
  estimate, so that I can launch a multi-agent review deliberately from one place.
- US3: As a reviewer, I want the selected agents grouped into one multi-agent run, so that I
  can compare their results as a single unit and revisit it later.
- US4: As a reviewer, I want a Columns view with live per-agent status and a trace link, so
  that I can see who finished, who is thinking, and who failed in real time.
- US5: As a reviewer, I want a Tabs + detail view where I can expand a finding (confidence,
  rationale, suggested fix) and act on it, so that I can triage per agent. Columns and Tabs are
  two layouts over the **same** building blocks (finding cards, per-agent summary, and the
  "Where agents disagree" block) — only the arrangement and the toggle differ.
- US6: As a reviewer, I want a "Where agents disagree" block that collapses duplicates and
  surfaces genuine divergence, so that I stop reading the same finding three times and can
  focus on conflicts.
- US7: As a reviewer, I want a pre-run estimate of total time and cost, so that I know the
  cost before committing to a fan-out.

## Acceptance criteria (EARS)

**Picker on the PR page (US1)**
- AC-1: WHEN a user opens the run control on the PR page, the system **shall** present a
  "Pick agents to run" dropdown listing every enabled agent with a checkbox and a per-agent
  time estimate, replacing the previous single/all dropdown.
  _(observable: dropdown shows checkboxes + per-agent estimate; the old one-or-all menu is gone)_
  **(design)** The dropdown is titled "Pick agents to run", has a **Clear** action (unchecks all) in
  its header and a **Configure agents…** footer link (→ `/agents`, OQ-7), and sits on the "Run Review ▾"
  button in the PR header next to "View on GitHub".
- AC-2: WHILE at least one agent is checked, the system **shall** enable a
  "Run multi-agent review (N)" action whose N equals the count of checked agents, and
  **shall** disable it when zero are checked.
  _(observable: button label tracks N; disabled at 0)_
- AC-3: WHEN the user confirms the picker, the system **shall** start a multi-agent run over
  exactly the checked agents and surface the live result view.
  _(observable: the run is created with precisely the selected agent set)_

**Configure run page (US2)**
- AC-4: The system **shall** provide a Multi-Agent Review page reachable from a GLOBAL
  navigation item, with a Configure-run step to select a pull request and agents.
  _(observable: nav item present; route renders Configure run)_
- AC-5: WHILE no pull request is selected on Configure run, the system **shall** disable the
  agent-selection step and the run action and show an empty-state prompt to pick a PR first.
  _(observable: step 2 + run button disabled until a PR is chosen)_
  **(design)** Configure run is a two-step form: "1 Pull request" (dropdown showing `#<n> · <title>`)
  and "2 Agents to run". Arriving from a PR page's picker/PR context pre-selects that PR.
- AC-6: WHEN a pull request is selected, the system **shall** list selectable agent cards,
  each showing the agent name, a short teaser, and a per-agent time·cost estimate.
  _(observable: agent cards populated with teaser + estimate)_
  **(design)** Each card is a full-width selectable row: checkbox, agent icon, name, teaser (from
  `agents.description`, OQ-5), `time · $cost` right-aligned. A checked card is tinted with the agent's
  accent colour; an unchecked card is neutral/dimmed. A **Select all** link above the list checks every
  enabled agent. The run button reads "Run multi-agent review (N)" with the AC-7 summary to its right.

**Pre-run estimate (US7)**
- AC-7: WHEN one or more agents are selected (picker or Configure run), the system **shall**
  display a summary estimate before the run, computed **on the client** from the per-agent
  estimate fields already present in the agents-list response, where estimated total cost =
  the sum of the selected agents' cost estimates and estimated total time = the maximum of the
  selected agents' time estimates.
  _(observable: summary reads "≈ Xs · $Y · parallel fan-out"; time = max, cost = sum; no extra request is made)_
- AC-8: The agents-list response used by the picker / Configure run **shall** carry, per agent,
  a time and cost estimate derived from that agent's own past completed (`done`) runs (e.g.
  average `durationMs` and average `costUsd`) — there is **no separate estimate endpoint**.
  _(observable: each agent in the list response has est_duration_ms/est_cost_usd/has_history from its prior agent_runs)_
- AC-9: IF a selected agent has no past completed runs, THEN its estimate fields **shall** be
  null with `has_history:false`, the UI **shall** render "—" / "no history" for it, and the
  client summary **shall** simply skip it when summing cost / taking the max time.
  _(observable: agent without history shows "—"; it does not contribute to the summary total)_

**Multi-agent run grouping (US3)**
- AC-10: WHEN a multi-agent review is triggered from either entry point, the system **shall**
  create exactly one persistent multi-agent run that groups the N per-agent runs it fans out
  on that PR.
  _(observable: one multi_agent_run record links the N agent_runs of the fan-out)_
- AC-11: The system **shall** run each selected agent in its own isolated context so that a
  failure in one agent's run does not abort the others.
  _(observable: forcing one agent to fail leaves the others reaching `done`)_
- AC-12: The system **shall** expose a multi-agent run as a single result resource containing
  one column per agent (status, score, duration, cost, findings) plus the cross-agent
  conflict groups and run totals.
  _(observable: reading the run returns a MultiAgentRun with columns + conflicts + totals)_

**Columns view + live status + trace (US4)**
- AC-13: WHILE a multi-agent run is in progress, the Columns view **shall** show, in each
  agent column header, a live status (running / done / failed) and that agent's time and cost
  once known; the same live status **shall** drive the `running` state passed to that agent's
  trace drawer, so a header showing "running" opens the drawer on its Live-log tab.
  _(observable: a column header transitions running→done live; a running column's "View trace" opens on Live-log)_
- AC-14: WHEN a user clicks "View trace" next to an agent — in **either** the Columns view
  (column footer) or the Tabs view (agent summary card) — the system **shall** open the
  **same existing `RunTraceDrawer`** used on the PR page's "Agent runs" section, targeted at
  that agent's `agent_run` id, via the existing `?trace=<runId>` URL search-param mechanism.
  _(observable: clicking "View trace" for an agent sets `?trace=<that agent_run id>` and mounts the shared RunTraceDrawer)_
- AC-14a: WHILE the drawer is open for an agent, the system **shall** expose the drawer's
  existing sections unchanged for that agent's run — Trace (Configuration, Stats, Prompt
  Assembly with system/skills/memory/specs/diff token attribution, Raw, Output, Copy) and the
  Live-log tab (live SSE stream during the run, replay buffer on connect, persisted log after
  completion). Worktree A only wires the correct `runId` + link; it does not rebuild the drawer.
  _(observable: the drawer opened from Multi-Agent Review is the same component/tabs as on the PR page, scoped to the agent's runId)_
- AC-15: IF an agent's run fails, THEN the system **shall** render that column in a failed
  state showing the failure reason, without blocking the other columns.
  _(observable: a failed agent's column shows its error; sibling columns still render)_

**Tabs + detail view + finding actions (US5)**
- AC-16: The system **shall** offer a Columns/Tabs toggle over the **same** multi-agent run,
  where Tabs shows one tab per agent with a score badge and an agent summary card, and **shall**
  build both views from the same shared building blocks — the finding card, the per-agent
  summary/header, and the "Where agents disagree" block are one implementation each, reused by
  both layouts; only the arrangement and the toggle differ (no duplicated per-mode variants).
  _(observable: toggling views does not re-run and reads the same run resource; the finding card, per-agent summary and disagree block are a single shared component used in both modes)_
- AC-17: WHEN a user expands a finding in the Tabs detail, the system **shall** show its
  confidence, rationale, and suggested fix, plus the finding action buttons.
  _(observable: expanded card shows confidence + rationale + suggested fix + actions)_
- AC-18: WHEN a user chooses Accept or Dismiss on a finding, the system **shall** persist the
  resulting state.
  _(observable: accept/dismiss sets accepted_at/dismissed_at and survives reload)_
- AC-19: WHERE the Learn, Reply to author, and Turn into eval case actions are shown, the
  system **shall** render them as clearly non-functional placeholders reserved for future work
  in this worktree (ДЗ Memory / evals L06); they perform no persisted action.
  _(observable: buttons visible but marked/disabled; clicking performs no persisted action)_

**Where agents disagree (US6)**
- AC-20: The system **shall** present a "Where agents disagree" section, shared by both
  Columns and Tabs views, that groups findings pointing at the same code location across
  agents.
  _(observable: the same section renders under both views; findings are grouped by location)_
- AC-21: The system **shall** treat two findings as the same location when they are in the
  same file AND their line ranges overlap — a purely deterministic test, with no essence /
  semantic / embedding comparison. Findings in different files or with non-overlapping ranges
  **shall** remain separate.
  _(observable: same-file overlapping-range findings group; different file or disjoint ranges do not; no LLM/embedding call is made)_
- AC-22: For each conflict group, the system **shall** list every agent that ran in the
  multi-run, showing each agent's verdict at that location OR "did not flag" when that agent
  produced no finding matched into the group.
  _(observable: a 4-agent run shows 4 rows per group; agents with no matched finding read "did not flag")_
- AC-23: WHERE the user enables "Show only conflicts", the system **shall** display only
  groups in which agents diverge (at least one flagged and at least one did-not-flag, or
  divergent severities) and hide unanimous groups.
  _(observable: toggling hides groups where every agent agrees)_

**Invariants (Untrusted / grounding)**
- AC-24: The system **shall** keep the reviewer-core grounding gate and untrusted-input
  wrapping unchanged for every agent run in a multi-agent run — no finding bypasses
  grounding, and each diff / PR body remains fenced before reaching a prompt.
  _(observable: only grounded findings persist; the injection guard + fencing are intact)_

**Results page layout & visual states (design)**
- AC-25: The results page **shall** show a header with the PR (`#<n>` + title), the title
  "Multi-Agent Review" with the subtitle "N selected agents · parallel", a **Configure run** button
  (back to Configure run), the Columns/Tabs segmented control, and a totals line
  "N agents · parallel fan-out · <total time> total · $<total cost>" taken from `MultiAgentRun`
  (`total_duration_ms`, `total_cost_usd`). The breadcrumb reads *Multi-Agent Review › #<n>*.
  _(observable: header matches the mockup; totals equal the MultiAgentRun fields; label never says "worktrees")_
- AC-26: In the Columns view each agent column **shall** show: a top border in the agent's accent
  colour, the agent icon and name, `duration · $cost`, a score ring with the numeric score, one row
  per finding (severity icon, title, `file:line`), and a footer with **View trace** and
  "N findings". Findings within a column are ordered by severity (CRITICAL → WARNING → SUGGESTION),
  then by file/line.
  _(observable: column anatomy and ordering as in the mockup)_
- AC-27: In the Tabs view the tab strip **shall** show one tab per agent (icon, name, score badge),
  the active tab underlined; below it an agent summary card (score ring, agent name in accent colour,
  one-line summary = `AgentColumn.summary`, **View trace**, `duration · $cost`) and the finding
  accordion for that agent. Selecting a tab does not re-fetch the run.
  _(observable: tab switch is instant; summary card + findings belong to the active agent)_
- AC-28: Finding rows **shall** be styled by severity — CRITICAL: red circle-alert icon + red left
  border; WARNING: orange triangle icon + orange left border; SUGGESTION: blue lightbulb icon + blue
  left border — and, in the Tabs accordion, additionally show the category chip (e.g. `security`,
  `bug`) and a confidence badge "NN% conf" with a coloured dot. The expanded card shows rationale,
  "Suggested fix" and the action row (**Accept**, **Dismiss**, then the AC-19 placeholders
  **Learn**, **Turn into eval case**, **Reply to author**). Only one finding is expanded at a time
  per tab by default.
  _(observable: severity visuals; chip + confidence on rows; expanded card per AC-17)_
- AC-29: Score ring colour and tab badge colour **shall** follow thresholds: score ≥ 70 green,
  50–69 orange, < 50 red; confidence dot: ≥ 90 % green, 50–89 % orange, < 50 % red (OQ-9).
  _(observable: 38 → red, 58/64/69 → orange, 72 → green on the mockups)_
- AC-30: The "Where agents disagree" block **shall** render each group as a row: code icon,
  `file:line`, group title, then one cell per agent (agent name, verdict badge — SUGGESTION blue,
  WARNING orange, CRITICAL red, "did not flag" grey with a dot — and the agent's short note). The
  block header has the "Show only conflicts" switch on its right, off by default. The block sits
  below the columns / tab content in both views.
  _(observable: row anatomy per mockup; switch default off)_
- AC-31: WHILE an agent is `running` its Columns card **shall** show a running indicator in place of
  the score ring and a placeholder body (no findings yet); WHEN it ends `done` the ring and findings
  appear; WHEN `failed` the card shows the failed state of AC-15 (error icon + reason, no ring) and in
  Tabs the tab badge shows a failed marker instead of a score. The "Where agents disagree" block
  computes only over finished runs and shows a "waiting for N agents" note while any run is running.
  _(observable: states exist in both views; mockups only show the all-done state)_
- AC-32: WHEN the multi-agent run is `done` and has zero findings overall, the page **shall** show
  a "No findings" empty state per column / tab and hide the disagree block.
  _(observable: zero-finding run renders without errors)_
- AC-33: The system **shall** let the user reach a multi-agent result by URL (the run is identified
  in the route, e.g. `…/multi-agent-review/<multiRunId>` or `?run=`), so that both entry points
  (AC-3 picker, Configure run) navigate to the same result page and the page survives reload (OQ-10).
  _(observable: reload keeps the same result; both entry points land on it)_

## Edge cases

- All selected agents fail → the multi-agent run still renders with every column in a failed
  state; run totals reflect the failures. → AC-11, AC-15
- Agent selected has no past runs → "no history" fallback estimate. → AC-9
- Zero agents selected → run action disabled. → AC-2
- PR is merged/closed at trigger time → the picker warns before running (carrying the
  existing `warnMerged` behaviour into the new picker). → accepted: inherit the single-review precondition (OQ-6)
- Identical finding from every agent at one location → grouped and, when unanimous, hidden by
  "Show only conflicts". → AC-20, AC-23
- Findings at overlapping-but-not-identical line ranges → matched by range overlap alone.
  → AC-21
- Two genuinely DIFFERENT findings that happen to sit on the same overlapping lines → may be
  merged into one group. → accepted: deliberate simplicity tradeoff (deterministic, no essence
  check); rare in practice, and both findings still show under the group's per-agent takes.
- Two agents flag the same location with different severities → shown as a conflict. → AC-23
- Live SSE lost / server restarts (RunBus is in-memory, not persisted) → live status falls
  back to the polled active-runs / run-history source of truth; the drawer falls back to the
  persisted trace after completion. → accepted: degrade to polling (AC-13 satisfied via poll)
- Client component unmounts mid-run → known gotcha: the SSE subscription must stay mounted
  for the run's duration or live events are lost. → accepted: keep subscription mounted
- Two multi-agent runs triggered on the same PR → each is its own record; the view shows the
  one being opened. → AC-10
- An agent runs but returns zero findings → it appears in every conflict group as "did not
  flag". → AC-22
- Selection made in the picker/Configure run, then user navigates away → selection is not
  persisted; reopening restores the default set. → accepted: no persistence (OQ-4)
- **(design)** Many agents (≥ 4 columns) overflow the viewport width (the 4-agent mockup is cut
  off) → columns have a minimum width and the row scrolls horizontally; the header and the disagree
  block do not scroll. → AC-26 (OQ-12)
- **(design)** A long finding title / path → truncated with ellipsis, full text on hover/focus
  (title attribute). → AC-26, AC-28
- **(design)** The disagree block lists only the agents that **ran** in this multi-run. The 2-agent
  mockup shows Junior Mentor / Security in a run of Customer-Facing + Architecture — that is mock
  data, not behaviour. → AC-22, AC-30
- **(design)** Mockup data is internally inconsistent (e.g. the same finding under several agents'
  columns while the disagree block says they "did not flag"; the same N+1 finding under Performance
  and Architecture). Mockups are layout references only; real data comes from the match rule. → AC-21, AC-22
- **(design)** Accepted / dismissed findings → the row keeps its place but shows an "Accepted" /
  "Dismissed" state (dismissed dimmed) and the corresponding action button becomes selected/disabled
  after the request succeeds; on failure the state reverts with an error toast. → AC-18
- **(design)** No agents are enabled at all → Configure run and the picker show an empty state with a
  link to `/agents`; run action disabled. → AC-2, AC-5
- **(design)** No PRs in the workspace → Configure run step 1 shows an empty state ("No pull requests
  yet"). → AC-5

## Non-functional

- **Performance:** the agents-list response (now carrying the per-agent estimate fields) p95
  < 500 ms — the estimate is a DB aggregate over past runs, no LLM, and no extra round-trip;
  the multi-agent result view initial load < 1 s excluding LLM execution time.
- **Live status latency:** a per-agent status change is reflected in the UI within the
  existing polling window (≤ ~4 s) or sooner via SSE.
- **Rate limiting:** the multi-agent trigger keeps a tight per-route limit (the existing
  review trigger is 10 requests / minute); a single trigger may fan out to N agent runs.
- **Security / untrusted inputs:** unchanged reviewer-core guarantees (see AC-24 and Untrusted
  inputs).
- **Accessibility:** the new page meets WCAG 2.1 AA — the Columns/Tabs segment control, the
  agent checkboxes/cards, the tabs, and the "Show only conflicts" toggle are keyboard
  operable and labelled.
- **i18n:** all user-facing strings go through `next-intl` (`useTranslations()`); no hardcoded
  English in JSX.

## Cross-module interactions

Modules: **client** (picker, Configure-run page, Columns/Tabs views, "Where agents
disagree"), **server** (multi-agent run trigger + grouping + read view + conflict
computation + estimate), **reviewer-core** (per-agent review + grounding — unchanged,
consumed via the server executor). `ci/` and `agent-runner/` are untouched.

Data crossing boundaries and failure contract:
- client → server: trigger a multi-agent run for `(prId, agentIds[])`; poll active runs;
  subscribe per-agent SSE; fetch the multi-agent result view; act on findings.
- server → reviewer-core: one review invocation per agent run; each is independently
  grounded. A per-agent failure is isolated (column marked failed), never aborting siblings.
- Conflicts are **computed from persisted findings, not stored** (per the existing contract
  annotation), using the **deterministic** same-file + overlapping-range test (no LLM /
  embedding step); "did not flag" is derived by the computation from the roster of agents that
  ran vs which findings matched each group.

```mermaid
sequenceDiagram
    participant U as User (client)
    participant S as server (reviews)
    participant X as run-executor
    participant R as reviewer-core
    U->>S: trigger multi-agent run (prId, agentIds[])
    S->>S: create 1 multi_agent_run + N agent_runs (running)
    S-->>U: multi-run id + per-agent run targets (runIds)
    par per selected agent (isolated)
        S->>X: execute agent run
        X->>R: review(diff, prompt, repoMap)  [wrapUntrusted + groundFindings]
        R-->>X: grounded findings + score
        X->>S: persist review + agent_run (done|failed, cost, duration)
    end
    loop while any run is running
        U->>S: SSE /runs/:runId/events  +  poll /pulls/:id/runs/active
        S-->>U: live log + status per agent
    end
    U->>S: GET multi-agent view
    S->>S: group findings by file + overlapping line range (deterministic, no LLM)
    S-->>U: MultiAgentRun { columns[], conflicts[], totals }
    U->>S: GET /runs/:runId/trace (from a column's "View trace")
    U->>S: POST /findings/:id/(accept|dismiss)
```

## Contracts

Shapes only; several already exist in `vendor/shared/contracts/` and are reused verbatim.

**Trigger a multi-agent run** — `POST /pulls/:id/multi-agent-run` _(BUILD)_
- Request: `{ agentIds: string[] }` scoped to the PR (the current `RunRequest` `{agentId?,all?}`
  gains a subset field; the picker passes the chosen set). Both entry points — the PR-page
  picker and Configure run — call this same endpoint and create exactly one `multi_agent_run`.
- Response: identifier of the created multi-agent run + per-agent run targets
  (`{ run_id, agent_id, agent_name }[]`), so the client can subscribe to each per-run SSE
  stream immediately.

**Read a multi-agent run** — `GET /pulls/:id/multi-agent` _(BUILD; contracts REUSE — `observability.ts`)_
- `MultiAgentRun` = `{ id, pr_id, pr_number?, ran_at, agent_count, total_duration_ms,
  total_cost_usd, columns: AgentColumn[], conflicts: Conflict[] }`.
- `AgentColumn` = `{ run_id, agent_id, agent_name, provider, model,
  status: 'done'|'failed'|'running', verdict, score, summary, duration_ms, cost_usd,
  findings: AgentColumnFinding[] }`.
- `Conflict` = `{ file, line, title, takes: ConflictTake[] }`;
  `ConflictTake` = `{ agent_id, persona, verdict: Severity | 'ignored', note }` — where
  `'ignored'` is the "did not flag" state surfaced in the UI.

**Pre-run estimate** _(BUILD — no new endpoint; extends the agents-list response)_
- There is **no dedicated estimate route**. The agents-list response the picker / Configure
  run already fetch is extended so each agent carries `est_duration_ms: number | null`,
  `est_cost_usd: number | null`, `has_history: boolean`, derived server-side by aggregating
  that agent's past `done` `agent_runs`.
- The summary (`total time ≈ max`, `total cost ≈ sum`) is computed **on the client** from the
  selected agents' fields. Agents with `has_history:false` (null estimates) are skipped in the
  summary and shown as "—" / "no history" (AC-9). No new request is issued when selection
  changes.

**Persistence** _(BUILD)_
- `multi_agent_runs` gains the ability to group its per-agent runs on a PR (today the table
  is a 4-column stub with no link from `agent_runs`). The grouping is the durable identity of
  a multi-agent run; conflicts are computed on read, not stored.

**SSE / live status** _(REUSE)_
- Per-run `RunEvent = { runId, seq, kind: 'info'|'tool'|'result'|'error', msg, t, data? }`
  over `GET /runs/:id/events` (replay-first). There is no multi-run aggregate stream and no
  dedicated started/finished/cost event kind; the Columns headers derive status from the
  per-run streams plus the polled active-runs / run-history source of truth.

**Run trace ("View trace")** _(REUSE)_
- `GET /runs/:id/trace` → `RunTrace` (config, stats, `prompt_assembly` with per-slot token
  attribution, `tool_calls`, `raw_output`, `log`) rendered by the shared `RunTraceDrawer`
  (`useRunTrace(runId)`), opened via the `?trace=<runId>` URL search param. Worktree A passes
  each agent's `agent_run` id; it adds no new trace shape or endpoint.

**Findings + actions** _(REUSE + partial BUILD)_
- `FindingRecord` (adds `review_id`, `accepted_at`, `dismissed_at` to `Finding`) with
  `confidence ∈ [0,1]`, `severity ∈ {CRITICAL,WARNING,SUGGESTION}`, `start_line`/`end_line`,
  `rationale`, `suggestion?`. Accept/Dismiss persist; Learn/Reply/Turn-into-eval are visible
  placeholders (D-4 / AC-19).

## Untrusted inputs

Yes. Each agent run consumes the PR diff and PR body, which are third-party / attacker-
influenceable text. These are already handled inside reviewer-core and **must remain
unchanged**: `wrapUntrusted()` fences the diff and PR body before they reach any prompt, the
`INJECTION_GUARD` is appended unconditionally, and `groundFindings()` drops any finding that
does not cite a real diff hunk. This feature adds no new prompt path and must not bypass these
gates (AC-24). The teaser/summary strings shown in the picker and columns originate from
model output about untrusted content — they are rendered as data (no HTML/script execution)
and never re-fed as instructions.

## Decisions (resolved with the coordinator)

The four blocking questions were resolved; they are now fixed in the ACs, inventory and
contracts above.

- D-1 (was OQ-1) — **Cross-agent match rule + conflict grouping is built on the server** over
  persisted findings using a deterministic test (same file + overlapping line ranges only,
  no essence/semantic comparison); the client
  only renders the computed groups. → AC-20, AC-21, AC-22.
- D-2 (was OQ-2) — **The fan-out is made parallel** (`Promise.allSettled`, failure-isolated) in
  `run-executor` (inside `server/src/modules/reviews/`, allowed); estimate time = max, cost =
  sum; the "parallel fan-out" label stays. → AC-7, AC-11.
- D-3 (was OQ-2b) — **New endpoints** `POST /pulls/:id/multi-agent-run` + `GET /pulls/:id/multi-agent`
  (contracts already in `observability.ts`); both entry points create one `multi_agent_run`. →
  AC-10, AC-12, Contracts.
- D-4 (was OQ-3) — **Only Accept/Dismiss are functional**; Learn / Reply to author / Turn into
  eval case are visible placeholders (ДЗ Memory / evals L06). → AC-18, AC-19.

## Open questions

Smaller points, **resolved with a default — override if needed**:

- OQ-4 (selection persistence) — *Resolved with default:* the agent selection does **not**
  persist between sessions; each Configure run / picker opens with a sensible default set (all
  enabled agents pre-checked). Note: the client already has a `dd-*` `localStorage` convention
  (`repoContext.tsx`, `theme.tsx`) — that is the mechanism to reach for if per-PR/per-workspace
  persistence is wanted later. No server user-prefs store exists.
- OQ-5 (agent teaser source) — *Resolved with default:* the teaser is the agent's stored
  `agents.description` field (confirmed to exist, `notNull().default('')`). When empty, the
  teaser is simply omitted. (It is **not** the last run's summary, which would be absent before
  the first run.)
- OQ-6 (merged/closed PR) — *Resolved with default:* the multi-agent run is allowed on any PR
  state where the existing single review is allowed — the same precondition as `POST
  /pulls/:id/review` is inherited; no stricter block is added.
- OQ-7 ("Configure agents…" link) — *Resolved with default:* it navigates to the existing
  `/agents` management page.

Added from the designs **(design)**:

- OQ-8 (design vs spec divergences) — *Resolved with the user:* (a) the Compose-review button is
  not part of this feature; (b) the agent teaser stays `agents.description` (the mockup's
  last-run-summary text is sample content); (c) the results header says "parallel fan-out", not
  "via worktrees"; (d) only the Multi-Agent Review GLOBAL nav item is added.
- OQ-9 (score / confidence colours) — *Resolved with default:* thresholds in AC-29, inferred from the
  mockup values (38 red; 58/64/69 orange; 72 green; confidence 98 % green, 66–81 % orange). Override
  if a design token set defines others.
- OQ-10 (result route & history) — *Resolved with default:* the result page is addressed by the
  multi-agent run id; the PR-scoped `GET /pulls/:id/multi-agent` returns the latest run unless a
  multi-run id is given. A list of earlier multi-runs is **not** designed and is out of scope.
- OQ-11 (default view & agent colours) — *Resolved with default:* Columns is the default view; the
  last chosen mode is not persisted. Agent accent colours / icons are a presentation mapping
  (palette assigned per agent) — no new DB column unless the planner finds one already exists.
- OQ-12 (column overflow) — *Resolved with default:* horizontal scroll of the column row, min column
  width ≈ 280 px (see edge cases).
