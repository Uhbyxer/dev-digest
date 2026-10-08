import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunGroupRow = typeof t.evalRunGroups.$inferSelect;

/** Eval cases of one agent, oldest first. */
export async function listCases(db: Db, workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
  return db
    .select()
    .from(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.ownerId, agentId),
      ),
    )
    .orderBy(t.evalCases.name);
}

export async function insertCase(
  db: Db,
  values: typeof t.evalCases.$inferInsert,
): Promise<EvalCaseRow> {
  const [row] = await db.insert(t.evalCases).values(values).returning();
  return row!;
}

/** The PR file's patch for a path (the diff fragment an Eval case stores). */
export async function getPrFilePatch(
  db: Db,
  prId: string,
  path: string,
): Promise<string | null> {
  const [row] = await db
    .select({ patch: t.prFiles.patch })
    .from(t.prFiles)
    .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, path)));
  return row?.patch ?? null;
}

export async function insertRunGroup(
  db: Db,
  group: typeof t.evalRunGroups.$inferInsert,
  runs: Omit<typeof t.evalRuns.$inferInsert, 'groupId'>[],
): Promise<EvalRunGroupRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.evalRunGroups).values(group).returning();
    if (runs.length > 0) {
      await tx.insert(t.evalRuns).values(runs.map((r) => ({ ...r, groupId: row!.id })));
    }
    return row!;
  });
}

/** Run groups newest first, with the agent's current name; optionally one agent only. */
export async function listRunGroups(
  db: Db,
  workspaceId: string,
  opts: { agentId?: string; limit: number },
): Promise<{ group: EvalRunGroupRow; agentName: string | null }[]> {
  const rows = await db
    .select({ group: t.evalRunGroups, agentName: t.agents.name })
    .from(t.evalRunGroups)
    .leftJoin(t.agents, eq(t.agents.id, t.evalRunGroups.agentId))
    .where(
      opts.agentId
        ? and(eq(t.evalRunGroups.workspaceId, workspaceId), eq(t.evalRunGroups.agentId, opts.agentId))
        : eq(t.evalRunGroups.workspaceId, workspaceId),
    )
    .orderBy(desc(t.evalRunGroups.ranAt))
    .limit(opts.limit);
  return rows;
}

export async function getRunGroup(
  db: Db,
  workspaceId: string,
  groupId: string,
): Promise<{ group: EvalRunGroupRow; agentName: string | null } | undefined> {
  const [row] = await db
    .select({ group: t.evalRunGroups, agentName: t.agents.name })
    .from(t.evalRunGroups)
    .leftJoin(t.agents, eq(t.agents.id, t.evalRunGroups.agentId))
    .where(and(eq(t.evalRunGroups.workspaceId, workspaceId), eq(t.evalRunGroups.id, groupId)));
  return row;
}

/** Per-case rows of a run group joined with their case. */
export async function runsOfGroup(
  db: Db,
  groupId: string,
): Promise<{ run: typeof t.evalRuns.$inferSelect; evalCase: EvalCaseRow }[]> {
  const runs = await db.select().from(t.evalRuns).where(eq(t.evalRuns.groupId, groupId));
  if (runs.length === 0) return [];
  const cases = await db
    .select()
    .from(t.evalCases)
    .where(inArray(t.evalCases.id, runs.map((r) => r.caseId)));
  const byId = new Map(cases.map((c) => [c.id, c]));
  return runs.flatMap((run) => {
    const evalCase = byId.get(run.caseId);
    return evalCase ? [{ run, evalCase }] : [];
  });
}
