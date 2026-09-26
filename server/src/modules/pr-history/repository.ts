import { eq, and } from 'drizzle-orm';
import type { RecentPrForFile } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface PrForHistory {
  repoId: string;
  owner: string;
  name: string;
}

/** Workspace-scoped: the PR's repo id + `owner/name` (for the GitHub client). */
export async function getPrForHistory(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PrForHistory | null> {
  const [row] = await db
    .select({ repoId: t.repos.id, owner: t.repos.owner, name: t.repos.name })
    .from(t.pullRequests)
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row ?? null;
}

export interface CachedFileHistory {
  items: RecentPrForFile[];
  fetchedAt: Date;
}

export async function getCachedFileHistory(
  db: Db,
  repoId: string,
  filePath: string,
): Promise<CachedFileHistory | null> {
  const [row] = await db
    .select({ items: t.prHistoryCache.items, fetchedAt: t.prHistoryCache.fetchedAt })
    .from(t.prHistoryCache)
    .where(and(eq(t.prHistoryCache.repoId, repoId), eq(t.prHistoryCache.filePath, filePath)));
  if (!row) return null;
  return { items: row.items as RecentPrForFile[], fetchedAt: row.fetchedAt };
}

export async function setCachedFileHistory(
  db: Db,
  repoId: string,
  filePath: string,
  items: RecentPrForFile[],
): Promise<void> {
  await db
    .insert(t.prHistoryCache)
    .values({ repoId, filePath, items, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [t.prHistoryCache.repoId, t.prHistoryCache.filePath],
      set: { items, fetchedAt: new Date() },
    });
}
