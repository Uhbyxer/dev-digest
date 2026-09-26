import { eq, and } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface PrForBlast {
  repoId: string;
  changedFiles: string[];
}

/** Workspace-scoped: the PR's repo id + its changed file paths (`pr_files`). */
export async function getPrForBlast(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PrForBlast | null> {
  const [pr] = await db
    .select({ repoId: t.pullRequests.repoId })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  if (!pr) return null;

  const files = await db
    .select({ path: t.prFiles.path })
    .from(t.prFiles)
    .where(eq(t.prFiles.prId, prId));

  return { repoId: pr.repoId, changedFiles: files.map((f) => f.path) };
}
