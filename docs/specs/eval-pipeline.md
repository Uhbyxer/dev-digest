# Spec: Eval Pipeline (agent regression evals)

Glossary: `CONTEXT.md#eval-case`, `CONTEXT.md#eval-run`. Issue: #35.
Status: ready-for-agent

## Problem Statement

I change a review agent's system prompt or model and have no way to tell, in numbers, whether
I made it better or broke it. My accept/dismiss decisions on past findings already say what a
good review looks like, but that knowledge is thrown away.

## Solution

Turn any accepted or dismissed finding into an **Eval case** with one click. Run an agent over
all its cases to get an **Eval run** with recall, precision and citation accuracy, scored by code
alone. Keep every run, and compare two side by side ("old prompt vs new prompt"). A
dashboard page shows the latest runs per agent.

## User Stories

1. As a reviewer, I want to turn an accepted finding into an eval case, so that the agent is
   required to keep finding that issue.
2. As a reviewer, I want to turn a dismissed finding into an eval case, so that the agent is
   required to stay quiet about that noise.
3. As a reviewer, I want the button disabled on a finding I have not accepted or dismissed,
   with a hint why, so that I never create a case with no clear expectation.
4. As a reviewer, I want clicking the button twice to give me the same case, so that I never
   get duplicates.
5. As an agent author, I want to see all eval cases of an agent in its Evals tab, so that I
   know what is protected.
6. As an agent author, I want to run the agent on all its cases with one action, so that I get
   a score without manual work.
7. As an agent author, I want recall, precision and citation accuracy for each run, so that I
   see what moved.
8. As an agent author, I want each run to remember the system prompt and model it used, so
   that I can tell why two runs differ.
9. As an agent author, I want a history of runs, so that I can see the trend over time.
10. As an agent author, I want to pick two runs and see their metrics and their changed
    prompt/model side by side, so that I can judge a prompt change.
11. As a team lead, I want an Eval Dashboard page in the sidebar showing the latest run per
    agent, so that I can spot a regression without opening each agent.
12. As a developer, I want scoring to make no model call, so that scores are free, instant and
    reproducible.
13. As a student, I want at least 8 seeded cases of both types, so that a fresh install can
    demonstrate the pipeline immediately.

## Implementation Decisions

- **Scope**: agents only. Skill evals and exporting an agent are out of scope.
- **Eval case**: one case per finding, a snapshot at creation time. It stores the finding's
  whole file diff from the PR (all hunks of that file, no other files) and one expectation:
  type (`must_find` / `must_not_flag`), file, line range, title. Accepted → `must_find`,
  dismissed → `must_not_flag`. A finding that is neither is rejected. Same agent + file +
  lines + type returns the existing case. The existing `eval_cases` table is reused with
  `owner_kind = agent`.
- **Eval run**: one run = all cases of the agent, recorded in a new run-group table holding
  the agent's system prompt, model, and aggregate metrics, plus case counts. The existing
  per-case run table gains a reference to its group. One migration.
- **Scoring** (pure, in `reviewer-core`, no I/O, no LLM): a finding *hits* a case when the file
  is equal and the line ranges overlap; category and severity are ignored. A `must_find`
  case passes when hit, a `must_not_flag` case passes when not hit. Run metrics:
  recall = hit `must_find` / all `must_find`; precision = findings hitting no `must_not_flag`
  / all findings; citation accuracy = findings surviving the grounding gate / raw findings.
  Empty denominators yield 100% (nothing to miss) and are shown as such.
- **Running**: the run executes the agent as configured *now* against each case's diff through
  the normal review path, so the grounding gate is the real one. Temperature is fixed to 0
  where the provider allows.
- **API**: create case from finding; list cases of an agent; start a run for an agent; list an
  agent's runs; get one run with its per-case results.
- **UI**: "Turn into eval case" on the finding card; an Evals tab in the agent editor (cases,
  Run, history); a sidebar Eval Dashboard page with latest runs and two-run comparison
  highlighting prompt/model changes.
- **Seed**: at least 8 cases of mixed types on the seeded PR.
- **Verification**: a root `verify:l06` script runs the tests below. No live LLM.

## Testing Decisions

- Test external behavior only: HTTP responses, stored rows, metric numbers. Not internal
  helpers or call order.
- **Seam 1 (main)**: one integration test over the HTTP routes with real Postgres and the
  mock LLM adapter. It covers both case types, idempotency, the neutral-finding rejection,
  a run with known findings → exact recall/precision/citation accuracy, the stored
  snapshot, and that changing the system prompt gives a second run with different metrics.
  Prior art: the existing route integration tests (brief, blast, onboarding).
- **Seam 2**: a table-driven unit test of the scoring function (overlap edges, other file,
  empty sets) and that scoring imports no LLM module. Prior art: the existing reviewer-core
  unit tests and the grounding test.
- No UI tests; the end-to-end scenario is covered by the demo video.
- `verify:l06` = both suites + seed has ≥ 8 cases.

## Out of Scope

- Skill evals; exporting an agent; LLM-judged scoring; matching on category or severity;
  cases covering several findings; following later changes of a finding's decision;
  pinning skill versions in a run snapshot; scheduled or CI-triggered runs.

## Further Notes

- The `evals/` package tests the Claude Code harness (skills and subagents), not product
  agents. Do not mix the two.
- Precision ignores findings that match no case, because we cannot tell whether they are
  right or wrong. It therefore moves only through `must_not_flag` cases.
