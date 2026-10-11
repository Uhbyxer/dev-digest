import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { ciInstallations } from './ci';

// ============================================================ Observability

export const agentRuns = pgTable(
  'agent_runs',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** USD cost of this run's LLM usage; null when unpriced (unknown model) or unset (failed before completion, pre-cost-tracking runs). */
  costUsd: doublePrecision('cost_usd'),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
  // ---- CI metadata (source='ci' only; null for local runs). `prId` stays null
  // for CI runs — a fork/external PR has no internal pull_requests row.
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  ciPrNumber: integer('ci_pr_number'),
  /** "owner/name" of the repository the CI run happened in. */
  ciRepo: text('ci_repo'),
  /** Link to the GitHub Actions run/job. */
  ciJobUrl: text('ci_job_url'),
  /** GitHub Actions workflow run id (int64). */
  ciGithubRunId: bigint('ci_github_run_id', { mode: 'number' }),
},
  (t) => ({
    // Idempotent ingest (AC-30): one agent_runs row per (installation, Actions run, PR).
    ciIdentityUq: uniqueIndex('agent_runs_ci_identity_uq')
      .on(t.ciInstallationId, t.ciGithubRunId, t.ciPrNumber)
      .where(sql`${t.source} = 'ci'`),
  }),
);



/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
