import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** Multi-Agent Review persistence: multi_agent_runs grouping of agent_runs, and the per-agent estimate aggregate. */
d('multi_agent_run grouping (integration)', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;
  let prId: string;
  let agentA: string;
  let agentB: string;

  beforeAll(async () => {
    pg = await startPg();
    const s = await seed(pg.handle.db);
    workspaceId = s.workspaceId;
    repo = new ReviewRepository(pg.handle.db);
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ma', fullName: 'acme/ma', defaultBranch: 'main' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: r!.id, number: 1, title: 'T', author: 'a', branch: 'f', base: 'main', headSha: 's' })
      .returning();
    prId = pr!.id;
    const agents = await pg.handle.db.select().from(t.agents);
    agentA = agents[0]!.id;
    agentB = agents[1]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('AC-10: groups agent runs under one multi run; single runs and other groups are excluded; latest wins', async () => {
    const m1 = await repo.createMultiAgentRun(workspaceId, prId);
    const r1 = await repo.createAgentRun({ workspaceId, agentId: agentA, prId, provider: 'openai', model: 'm', multiAgentRunId: m1.id });
    const r2 = await repo.createAgentRun({ workspaceId, agentId: agentB, prId, provider: 'openai', model: 'm', multiAgentRunId: m1.id });
    await repo.createAgentRun({ workspaceId, agentId: agentA, prId, provider: 'openai', model: 'm' }); // single run
    await new Promise((r) => setTimeout(r, 15));
    const m2 = await repo.createMultiAgentRun(workspaceId, prId);
    await repo.createAgentRun({ workspaceId, agentId: agentA, prId, provider: 'openai', model: 'm', multiAgentRunId: m2.id });

    const rows = await repo.listRunsForMultiRun(workspaceId, m1.id);
    expect(rows.map((r) => r.runId).sort()).toEqual([r1, r2].sort());
    expect(rows.every((r) => r.agentName)).toBe(true);
    expect((await repo.listRunsForMultiRun(workspaceId, m2.id))).toHaveLength(1);

    expect((await repo.getMultiAgentRun(workspaceId, prId))?.id).toBe(m2.id);
    expect((await repo.getMultiAgentRun(workspaceId, prId, m1.id))?.id).toBe(m1.id);
    // workspace scoping
    expect(await repo.getMultiAgentRun('00000000-0000-4000-8000-000000000000', prId, m1.id)).toBeUndefined();
  });

  it('AC-8/AC-9: estimatesByAgent averages only done runs; agents without done runs are absent', async () => {
    const db = pg.handle.db;
    await db.insert(t.agentRuns).values([
      { workspaceId, agentId: agentA, prId, status: 'done', durationMs: 1000, costUsd: 0.02 },
      { workspaceId, agentId: agentA, prId, status: 'done', durationMs: 3000, costUsd: null },
      { workspaceId, agentId: agentA, prId, status: 'failed', durationMs: 99999, costUsd: 9 },
    ]);
    const est = await new AgentsRepository(db).estimatesByAgent(workspaceId);
    const a = est.find((e) => e.agentId === agentA)!;
    expect(a.runs).toBe(2);
    expect(a.avgDurationMs).toBe(2000);
    expect(a.avgCostUsd).toBeCloseTo(0.02);
    expect(est.find((e) => e.agentId === agentB)).toBeUndefined();
  });
});
