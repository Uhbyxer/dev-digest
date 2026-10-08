/**
 * Route-level integration test for the Eval Pipeline (docs/specs/eval-pipeline.md).
 * Real Postgres, mocked LLM. Covers: seed ≥ 8 cases, case-from-finding (both
 * expectation types, idempotency, undecided finding), a scored run with exact
 * metrics, and a changed system prompt moving the metrics between two runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { addedLinesDiff } from '../src/db/seed-eval-cases.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { AgentEvalCase, AgentEvalRun, AgentEvalRunDetail } from '@devdigest/shared';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-pipeline] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const finding = (file: string, line: number) => ({
  id: `f-${file}-${line}`,
  severity: 'WARNING',
  category: 'bug',
  title: `issue at ${file}:${line}`,
  file,
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.9,
  kind: 'finding',
});
const review = (...findings: ReturnType<typeof finding>[]) => ({
  verdict: 'request_changes',
  summary: 's',
  score: 50,
  findings,
});

d('Eval Pipeline routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let prId: string;
  let findingIds: { accepted: string; dismissed: string; neutral: string };

  const app = async (llm: MockLLMProvider) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llm, openrouter: llm } },
    });
  const mockLlm = (r: ReturnType<typeof review>) =>
    new MockLLMProvider('openai', { structuredBySchema: { Review: r } });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // A fresh agent with four hand-made cases → exact metrics are predictable.
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'Eval Test Agent', provider: 'openai', model: 'gpt-test', systemPrompt: 'prompt A', enabled: true, version: 1 })
      .returning();
    agentId = agent!.id;
    const exp = (type: 'must_find' | 'must_not_flag', file: string, line: number) => ({ type, file, start_line: line, end_line: line, title: `${type} ${file}` });
    for (const e of [exp('must_find', 'a.ts', 5), exp('must_find', 'b.ts', 9), exp('must_not_flag', 'c.ts', 3), exp('must_not_flag', 'd.ts', 7)]) {
      await db.insert(t.evalCases).values({
        workspaceId, ownerKind: 'agent', ownerId: agentId, name: `${e.type}: ${e.file}`,
        inputDiff: addedLinesDiff(e.file, e.start_line, ['x = 1;']), expectedOutput: e,
      });
    }

    // A PR + review by that agent with three findings: accepted, dismissed, undecided.
    const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name: 'evals', fullName: 'acme/evals', defaultBranch: 'main' }).returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'f', base: 'main', headSha: 's1' })
      .returning();
    prId = pr!.id;
    await db.insert(t.prFiles).values({ prId, path: 'src/new.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,2 @@\n a\n+b' });
    const [rev] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 80, model: 'm' })
      .returning();
    const rows = await db
      .insert(t.findings)
      .values(
        ['one', 'two', 'three'].map((n, i) => ({
          reviewId: rev!.id, file: 'src/new.ts', startLine: i + 1, endLine: i + 1, severity: 'WARNING',
          category: 'bug', title: n, rationale: 'r', confidence: 0.9,
        })),
      )
      .returning();
    await db.update(t.findings).set({ acceptedAt: new Date() }).where(eq(t.findings.id, rows[0]!.id));
    await db.update(t.findings).set({ dismissedAt: new Date() }).where(eq(t.findings.id, rows[1]!.id));
    findingIds = { accepted: rows[0]!.id, dismissed: rows[1]!.id, neutral: rows[2]!.id };
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('seeds at least 8 cases of both types for the General Reviewer', async () => {
    const a = await app(mockLlm(review()));
    const [general] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.name, 'General Reviewer'));
    const res = await a.inject({ method: 'GET', url: `/agents/${general!.id}/eval-cases` });
    const cases = AgentEvalCase.array().parse(res.json());
    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(new Set(cases.map((c) => c.expectation.type))).toEqual(new Set(['must_find', 'must_not_flag']));
  });

  it('creates must_find from an accepted and must_not_flag from a dismissed finding, idempotently', async () => {
    const a = await app(mockLlm(review()));
    const post = (id: string) => a.inject({ method: 'POST', url: `/findings/${id}/eval-case` });

    const accepted = AgentEvalCase.parse((await post(findingIds.accepted)).json());
    expect(accepted.expectation).toMatchObject({ type: 'must_find', file: 'src/new.ts', start_line: 1 });
    expect(accepted.agent_id).toBe(agentId);
    expect(accepted.input_diff).toContain('+b');

    const dismissed = AgentEvalCase.parse((await post(findingIds.dismissed)).json());
    expect(dismissed.expectation.type).toBe('must_not_flag');

    const again = AgentEvalCase.parse((await post(findingIds.accepted)).json());
    expect(again.id).toBe(accepted.id);
    const all = AgentEvalCase.array().parse((await a.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json());
    expect(all).toHaveLength(6); // 4 hand-made + 2 from findings
  });

  it('rejects an undecided finding', async () => {
    const a = await app(mockLlm(review()));
    const res = await a.inject({ method: 'POST', url: `/findings/${findingIds.neutral}/eval-case` });
    expect(res.statusCode).toBe(400);
  });

  it('refuses to run an agent that has no cases', async () => {
    const db = pg.handle.db;
    const [empty] = await db.insert(t.agents).values({ workspaceId, name: 'Empty', provider: 'openai', model: 'm', systemPrompt: 'p', enabled: true, version: 1 }).returning();
    const a = await app(mockLlm(review()));
    const res = await a.inject({ method: 'POST', url: `/agents/${empty!.id}/eval-runs` });
    expect(res.statusCode).toBe(400);
  });

  it('a changed system prompt moves recall/precision between two runs', async () => {
    const db = pg.handle.db;
    // drop the two finding-born cases so the arithmetic below stays on the 4 hand-made ones
    const born = await db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, agentId));
    for (const c of born) if ((c.expectedOutput as { file: string }).file === 'src/new.ts') await db.delete(t.evalCases).where(eq(t.evalCases.id, c.id));

    // Run 1 — "prompt A": finds a.ts:5 but also flags c.ts:3 (a dismissed-noise location).
    const llmA = mockLlm(review(finding('a.ts', 5), finding('c.ts', 3)));
    const runA = AgentEvalRunDetail.parse((await (await app(llmA)).inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json());
    expect(llmA.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(4); // one per case
    expect(runA.system_prompt).toBe('prompt A');
    expect(runA).toMatchObject({ recall: 0.5, precision: 0.5, cases_total: 4, cases_passed: 2 });
    expect(runA.citation_accuracy).toBeCloseTo(2 / 8);
    expect(runA.results).toHaveLength(4);

    // Change the prompt; Run 2 — "prompt B": finds both real issues, no noise.
    await db.update(t.agents).set({ systemPrompt: 'prompt B' }).where(eq(t.agents.id, agentId));
    const runB = AgentEvalRunDetail.parse(
      (await (await app(mockLlm(review(finding('a.ts', 5), finding('b.ts', 9))))).inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` })).json(),
    );
    expect(runB.system_prompt).toBe('prompt B');
    expect(runB).toMatchObject({ recall: 1, precision: 1, cases_passed: 4 });
    expect(runB.recall).toBeGreaterThan(runA.recall);
    expect(runB.precision).toBeGreaterThan(runA.precision);

    // History (newest first) + single run + dashboard list.
    const a = await app(mockLlm(review()));
    const history = AgentEvalRun.array().parse((await a.inject({ method: 'GET', url: `/agents/${agentId}/eval-runs` })).json());
    expect(history.map((h) => h.id)).toEqual([runB.id, runA.id]);
    expect(history[0]!.agent_name).toBe('Eval Test Agent');
    const one = AgentEvalRunDetail.parse((await a.inject({ method: 'GET', url: `/eval-runs/${runA.id}` })).json());
    expect(one.results.filter((r) => r.pass)).toHaveLength(2);
    const all = AgentEvalRun.array().parse((await a.inject({ method: 'GET', url: '/eval-runs' })).json());
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
