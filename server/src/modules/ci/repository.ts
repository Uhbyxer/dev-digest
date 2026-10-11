import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow } from '../../db/rows.js';

/**
 * Export-to-CI data access. Owns `ci_installations` and the CI-sourced slice of
 * `agent_runs` (`source='ci'`). `ci_runs` is intentionally untouched (plan).
 * `ci_installations` has no workspace column, so every query scopes through the
 * owning agent's `workspace_id`.
 */

export type InstallationRow = typeof t.ciInstallations.$inferSelect;
export type InstallationWithAgent = InstallationRow & {
  agentName: string;
  ciFailOn: (typeof t.agents.$inferSelect)['ciFailOn'];
  provider: string;
  model: string;
};

export interface InsertCiRun {
  workspaceId: string;
  agentId: string;
  provider: string;
  model: string;
  ranAt: Date;
  durationMs: number | null;
  costUsd: number | null;
  findingsCount: number;
  blockers: number;
  score: number;
  ciInstallationId: string;
  ciPrNumber: number;
  ciRepo: string;
  ciJobUrl: string;
  ciGithubRunId: number;
}

export interface CiRunDbRow {
  id: string;
  ranAt: Date;
  installationId: string | null;
  agentId: string | null;
  agentName: string | null;
  repo: string | null;
  prNumber: number | null;
  status: string | null;
  findingsCount: number | null;
  blockers: number | null;
  costUsd: number | null;
  durationMs: number | null;
  jobUrl: string | null;
}

export class CiRepository {
  constructor(private db: Db) {}

  /** All skills in the workspace (slug disambiguation is workspace-wide). */
  async listSkills(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  /**
   * Create-or-update the (agent, repo, target) installation. On conflict only the
   * workflow version and installed-at move; an `active` status is preserved.
   */
  async upsertInstallation(input: {
    agentId: string;
    repo: string;
    targetType: InstallationRow['targetType'];
    workflowVersion: string;
  }): Promise<InstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: input.agentId,
        repo: input.repo,
        targetType: input.targetType,
        workflowVersion: input.workflowVersion,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo, t.ciInstallations.targetType],
        set: { workflowVersion: input.workflowVersion, installedAt: sql`now()` },
      })
      .returning();
    return row!;
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<InstallationRow[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(t.ciInstallations.installedAt);
    return rows.map((r) => r.inst);
  }

  /** Latest ingested run per installation (for the CI tab rows). */
  async lastRunByInstallation(
    installationIds: string[],
  ): Promise<Map<string, { ranAt: Date; findingsCount: number | null; blockers: number | null }>> {
    const out = new Map<string, { ranAt: Date; findingsCount: number | null; blockers: number | null }>();
    if (installationIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.agentRuns.ciInstallationId], {
        installationId: t.agentRuns.ciInstallationId,
        ranAt: t.agentRuns.ranAt,
        findingsCount: t.agentRuns.findingsCount,
        blockers: t.agentRuns.blockers,
      })
      .from(t.agentRuns)
      .where(
        and(eq(t.agentRuns.source, 'ci'), inArray(t.agentRuns.ciInstallationId, installationIds)),
      )
      .orderBy(t.agentRuns.ciInstallationId, desc(t.agentRuns.ranAt));
    for (const r of rows) {
      if (r.installationId) out.set(r.installationId, r);
    }
    return out;
  }

  /** Tracked GitHub Actions installations in the workspace (optionally one agent). */
  async listTrackedGha(workspaceId: string, agentId?: string): Promise<InstallationWithAgent[]> {
    const rows = await this.db
      .select({
        inst: t.ciInstallations,
        agentName: t.agents.name,
        ciFailOn: t.agents.ciFailOn,
        provider: t.agents.provider,
        model: t.agents.model,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.ciInstallations.targetType, 'gha'),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      );
    return rows.map((r) => ({
      ...r.inst,
      agentName: r.agentName,
      ciFailOn: r.ciFailOn,
      provider: r.provider,
      model: r.model,
    }));
  }

  /** Actions run ids already ingested for an installation (skip re-downloading). */
  async ingestedGithubRunIds(installationId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ runId: t.agentRuns.ciGithubRunId, pr: t.agentRuns.ciPrNumber })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.source, 'ci'), eq(t.agentRuns.ciInstallationId, installationId)));
    return new Set(rows.map((r) => `${r.runId}:${r.pr}`));
  }

  /**
   * Insert ingested runs atomically; the partial unique index + ON CONFLICT DO
   * NOTHING makes re-ingest a no-op (AC-30). Marks touched installations active.
   * Returns the number of rows actually inserted.
   */
  async insertCiRuns(runs: InsertCiRun[]): Promise<number> {
    if (runs.length === 0) return 0;
    return this.db.transaction(async (tx) => {
      let inserted = 0;
      for (const r of runs) {
        const rows = await tx
          .insert(t.agentRuns)
          .values({
            workspaceId: r.workspaceId,
            agentId: r.agentId,
            prId: null,
            ranAt: r.ranAt,
            provider: r.provider,
            model: r.model,
            durationMs: r.durationMs,
            costUsd: r.costUsd,
            status: 'done',
            source: 'ci',
            findingsCount: r.findingsCount,
            blockers: r.blockers,
            score: r.score,
            ciInstallationId: r.ciInstallationId,
            ciPrNumber: r.ciPrNumber,
            ciRepo: r.ciRepo,
            ciJobUrl: r.ciJobUrl,
            ciGithubRunId: r.ciGithubRunId,
          })
          .onConflictDoNothing()
          .returning({ id: t.agentRuns.id });
        inserted += rows.length;
      }
      const installationIds = [...new Set(runs.map((r) => r.ciInstallationId))];
      await tx
        .update(t.ciInstallations)
        .set({ status: 'active' })
        .where(inArray(t.ciInstallations.id, installationIds));
      return inserted;
    });
  }

  /** CI-sourced runs (newest first), workspace-scoped; optionally one agent / installation. */
  async listCiRuns(
    workspaceId: string,
    filter: { agentId?: string; installationId?: string } = {},
    limit = 200,
  ): Promise<CiRunDbRow[]> {
    return this.db
      .select({
        id: t.agentRuns.id,
        ranAt: t.agentRuns.ranAt,
        installationId: t.agentRuns.ciInstallationId,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        repo: t.agentRuns.ciRepo,
        prNumber: t.agentRuns.ciPrNumber,
        status: t.agentRuns.status,
        findingsCount: t.agentRuns.findingsCount,
        blockers: t.agentRuns.blockers,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        jobUrl: t.agentRuns.ciJobUrl,
      })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          filter.agentId ? eq(t.agentRuns.agentId, filter.agentId) : undefined,
          filter.installationId ? eq(t.agentRuns.ciInstallationId, filter.installationId) : undefined,
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(limit);
  }
}
