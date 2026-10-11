import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  doublePrecision,
  unique,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** `pending` = PR opened/updated; `active` = a CI run has been ingested. */
    status: text('status', { enum: ['pending', 'active'] }).notNull().default('pending'),
    /** Version of the generated workflow template that was exported. */
    workflowVersion: text('workflow_version').notNull().default('1'),
  },
  // One installation per (agent, repo, target): re-export upserts onto it.
  (t) => ({
    agentRepoTarget: unique('ci_installations_agent_repo_target_uq').on(
      t.agentId,
      t.repo,
      t.targetType,
    ),
  }),
);

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  costUsd: doublePrecision('cost_usd'),
  githubUrl: text('github_url'),
  source: text('source'),
});
