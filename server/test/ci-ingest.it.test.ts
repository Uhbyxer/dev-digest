import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[ci-ingest] Docker not available — skipping integration tests.');

const run = (id: number, pr = 5) => ({
  id, html_url: `https://github.com/acme/widgets/actions/runs/${id}`, status: 'completed',
  conclusion: 'success', created_at: '2026-07-01T00:00:00Z', pr_numbers: [pr],
});
const artifact = (over: Record<string, unknown> = {}) => ({
  findings_count: 2, critical: 1, warning: 1, suggestion: 0, cost_usd: 0.01, duration_ms: 900, agent: 'A', ...over,
});

d('Export to CI persistence + refresh (real Postgres)', () => {
  let pg: PgFixture;
  let agentId: string;
  let repo: CiRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    repo = new CiRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeApp(gh: MockGitHubOptions) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(gh) },
    });
  }

  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  const ciRuns = (installationId: string) =>
    pg.handle.db.select().from(t.agentRuns).where(
      and(eq(t.agentRuns.source, 'ci'), eq(t.agentRuns.ciInstallationId, installationId)),
    );

  it('upsertInstallation: one row per (agent, repo, target); re-export bumps version, keeps active status', async () => {
    const app = await makeApp({});
    agentId = await newAgent(app, 'CI Upsert Agent');

    const first = await repo.upsertInstallation({ agentId, repo: 'acme/widgets', targetType: 'gha', workflowVersion: '1' });
    expect(first.status).toBe('pending');
    await pg.handle.db.update(t.ciInstallations).set({ status: 'active' }).where(eq(t.ciInstallations.id, first.id));

    const second = await repo.upsertInstallation({ agentId, repo: 'acme/widgets', targetType: 'gha', workflowVersion: '2' });
    expect(second.id).toBe(first.id);
    expect(second.workflowVersion).toBe('2');
    expect(second.status).toBe('active');

    // A different target for the same repo is a separate installation.
    const other = await repo.upsertInstallation({ agentId, repo: 'acme/widgets', targetType: 'circle', workflowVersion: '2' });
    expect(other.id).not.toBe(first.id);
    const rows = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agentId));
    expect(rows).toHaveLength(2);
  });

  it('agent_runs_ci_identity_uq: duplicate (installation, run id, PR) is rejected for source=ci but not for local runs', async () => {
    const app = await makeApp({});
    const aid = await newAgent(app, 'CI Index Agent');
    const inst = await repo.upsertInstallation({ agentId: aid, repo: 'acme/idx', targetType: 'gha', workflowVersion: '1' });
    const [agentRow] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, aid));
    const base = {
      workspaceId: agentRow!.workspaceId, agentId: aid, provider: 'openai', model: 'm', status: 'done',
      ciInstallationId: inst.id, ciGithubRunId: 900, ciPrNumber: 1,
    };
    await pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'ci' });
    await expect(pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'ci' })).rejects.toThrow();
    // Same run id on a different PR is a different identity.
    await pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'ci', ciPrNumber: 2 });
    // The index is partial: source='local' rows with the same triple are unaffected.
    await pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'local' });
    await pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'local' });
    // onConflictDoNothing (the ingest path) swallows the duplicate.
    const out = await pg.handle.db.insert(t.agentRuns).values({ ...base, source: 'ci' }).onConflictDoNothing().returning({ id: t.agentRuns.id });
    expect(out).toHaveLength(0);
  });

  it('POST /ci/refresh: ingests valid artifacts once (AC-30), skips invalid/missing (AC-31), marks installation active', async () => {
    const setupApp = await makeApp({});
    const aid = await newAgent(setupApp, 'CI Refresh Agent');
    const inst = await repo.upsertInstallation({ agentId: aid, repo: 'acme/widgets', targetType: 'gha', workflowVersion: '1' });

    const app = await makeApp({
      workflowRuns: [run(101), run(102), run(103)],
      artifacts: { 101: artifact(), 103: { findings_count: 'bad' } }, // 102 missing/expired
    });
    const first = await app.inject({ method: 'POST', url: `/ci/refresh?agent_id=${aid}` });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ degraded: false, ingested: 1, skipped: 2 });

    const again = await app.inject({ method: 'POST', url: `/ci/refresh?agent_id=${aid}` });
    expect(again.json().ingested).toBe(0);

    const rows = await ciRuns(inst.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'ci', prId: null, ciPrNumber: 5, ciRepo: 'acme/widgets', ciGithubRunId: 101, findingsCount: 2, blockers: 1 });
    const [after] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
    expect(after!.status).toBe('active');

    const listed = await app.inject({ method: 'GET', url: `/agents/${aid}/ci/runs` });
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0]).toMatchObject({ verdict: 'REQUEST_CHANGES', pr_number: 5 });
  });

  it('AC-32: degraded refresh leaves existing rows intact and writes nothing new', async () => {
    const setupApp = await makeApp({});
    const aid = await newAgent(setupApp, 'CI Degraded Agent');
    const inst = await repo.upsertInstallation({ agentId: aid, repo: 'acme/degraded', targetType: 'gha', workflowVersion: '1' });

    const ok = await makeApp({ workflowRuns: [run(201)], artifacts: { 201: artifact() } });
    expect((await ok.inject({ method: 'POST', url: `/ci/refresh?agent_id=${aid}` })).json().ingested).toBe(1);

    const bad = await makeApp({
      workflowRuns: [run(202)], artifacts: { 202: artifact() }, workflowRunsError: new Error('403 rate limit'),
    });
    const res = await bad.inject({ method: 'POST', url: `/ci/refresh?agent_id=${aid}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ degraded: true, ingested: 0, skipped: 0 });

    const rows = await ciRuns(inst.id);
    expect(rows.map((r) => r.ciGithubRunId)).toEqual([201]);
  });
});
