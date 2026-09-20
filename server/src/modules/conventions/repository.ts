import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access. Owns `conventions`. Workspace-scoped throughout
 * (mirrors SkillsRepository).
 */

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

export interface NewConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  confidence: number | null;
}

export interface UpdateConvention {
  rule?: string;
  status?: ConventionStatus;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(sql`${t.conventions.confidence} DESC NULLS LAST`, desc(t.conventions.createdAt));
  }

  /** Everything regardless of status — dedupe needs pending+accepted+rejected. */
  async listAllStatusesForDedupe(
    workspaceId: string,
    repoId: string,
  ): Promise<Pick<ConventionRow, 'rule' | 'evidencePath'>[]> {
    return this.db
      .select({ rule: t.conventions.rule, evidencePath: t.conventions.evidencePath })
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async insertMany(rows: NewConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          repoId: r.repoId,
          rule: r.rule,
          evidencePath: r.evidencePath,
          evidenceSnippet: r.evidenceSnippet,
          confidence: r.confidence,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** Bump `updatedAt` on any change. Editing `rule` never touches `status` and vice versa. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  /** `max(createdAt)` for the repo — no separate scan-run entity; this IS "last scanned". */
  async lastScannedAt(workspaceId: string, repoId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ max: sql<string | null>`max(${t.conventions.createdAt})` })
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
    return row?.max ? new Date(row.max) : null;
  }
}
