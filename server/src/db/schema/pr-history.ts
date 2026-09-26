/**
 * Prior-PRs history cache — a live external-API lookup cache (GitHub commit →
 * merged-PR resolution), NOT repo-intel's static-analysis `file_facts` (a
 * different kind of data with a different lifecycle: this one expires on a
 * plain TTL, not on reindex/resync).
 */
import { pgTable, uuid, text, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { repos } from './repos';

export const prHistoryCache = pgTable(
  'pr_history_cache',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    /** `RecentPrForFile[]` (adapters.ts) — merged PRs resolved from this file's recent commits. */
    items: jsonb('items').notNull().default([]),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.filePath] }),
  }),
);
