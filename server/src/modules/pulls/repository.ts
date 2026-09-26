import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Pulls data-access — PR-by-number lookup (repo-scoped). The existing pulls
 * routes query `pullRequests` inline by internal id; this is the
 * number-based counterpart used by MCP's repo+PR resolver, which addresses a
 * PR the way GitHub does (owner/name + number), not by dev-digest's id.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  /**
   * `workspaceId` is redundant with `repoId` today (every caller resolves
   * `repoId` via a workspace-scoped `RepoRepository.findByFullName` first),
   * but scoping the query explicitly — like every other lookup in this
   * codebase — means a future caller that obtains `repoId` some other way
   * can't accidentally read a PR across workspaces.
   */
  async findByRepoAndNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row;
  }
}
