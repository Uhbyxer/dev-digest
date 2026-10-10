# Plan: Eval Pipeline

Spec: `docs/specs/eval-pipeline.md`. Single-agent, one pass, bottom-up.

1. **reviewer-core** — pure `eval/score.ts` (hit, case pass, recall/precision/citation) + unit test; export from index.
2. **server data** — `eval_run_groups` table + `eval_runs.group_id` (migration `0016`); new contracts in `eval-ci.ts` (server + client copies).
3. **server module `evals`** — repository / service / routes: case from finding, list cases, run, history, dashboard list. Register in `modules/index.ts`.
4. **seed** — ≥ 8 cases (mixed) for the seeded PR #482 and the General Reviewer.
5. **tests + `verify:l06`** — `server/test/eval-pipeline.it.test.ts`; script in `server/package.json`.
6. **client** — hooks, "Turn into eval case" on `FindingCard`, Evals tab in `AgentEditor`, `/eval` dashboard page + nav item, i18n strings.
7. Typecheck + tests in all touched packages.
