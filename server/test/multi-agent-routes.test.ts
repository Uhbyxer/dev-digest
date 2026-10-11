import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockLLMProvider } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';

/**
 * No-DB route tests for the Multi-Agent Review endpoints via app.inject():
 * auth + LLM are mocks, repositories are stubbed on their prototypes, and the
 * executor is stubbed so no run actually starts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const PR = '11111111-1111-4111-8111-111111111111';
const MULTI = '22222222-2222-4222-8222-222222222222';
const A1 = '33333333-3333-4333-8333-333333333333';
const A2 = '44444444-4444-4444-8444-444444444444';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(),
      llm: { openai: new MockLLMProvider(), anthropic: new MockLLMProvider(), openrouter: new MockLLMProvider() },
    },
  });
  vi.spyOn(ReviewRepository.prototype, 'getPull').mockResolvedValue({ id: PR, repoId: 'r1', number: 42 } as never);
  vi.spyOn(ReviewRepository.prototype, 'getRepo').mockResolvedValue({ id: 'r1' } as never);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

describe('POST /pulls/:id/multi-agent-run (no DB)', () => {
  it('rejects an empty agentIds list with 422', async () => {
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR}/multi-agent-run`, payload: { agentIds: [] } });
    expect(res.statusCode).toBe(422);
  });

  it('creates one group + a linked run per agent and starts the executor', async () => {
    vi.spyOn(app.container.agentsRepo, 'getById').mockImplementation(
      async (_w, id) => ({ id, name: `agent-${id.slice(0, 1)}`, enabled: true, provider: 'openai', model: 'm' }) as never,
    );
    vi.spyOn(ReviewRepository.prototype, 'createMultiAgentRun').mockResolvedValue({ id: MULTI } as never);
    const createRun = vi
      .spyOn(ReviewRepository.prototype, 'createAgentRun')
      .mockResolvedValueOnce('run-1')
      .mockResolvedValueOnce('run-2');
    const exec = vi.spyOn(ReviewRunExecutor.prototype, 'executeRuns').mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${PR}/multi-agent-run`,
      payload: { agentIds: [A1, A2] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.multi_run_id).toBe(MULTI);
    expect(body.runs.map((r: { run_id: string }) => r.run_id)).toEqual(['run-1', 'run-2']);
    expect(createRun.mock.calls.every(([v]) => v.multiAgentRunId === MULTI)).toBe(true);
    expect(exec).toHaveBeenCalledOnce();
  });

  it('rejects a disabled agent with 409 and creates nothing', async () => {
    vi.spyOn(app.container.agentsRepo, 'getById').mockResolvedValue({ id: A1, name: 'Off', enabled: false } as never);
    const create = vi.spyOn(ReviewRepository.prototype, 'createMultiAgentRun');
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR}/multi-agent-run`, payload: { agentIds: [A1] } });
    expect(res.statusCode).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it('404s and creates no multi-run group when the PR repo is missing', async () => {
    vi.spyOn(app.container.agentsRepo, 'getById').mockResolvedValue({ id: A1, name: 'On', enabled: true } as never);
    vi.spyOn(ReviewRepository.prototype, 'getRepo').mockResolvedValue(undefined as never);
    const create = vi.spyOn(ReviewRepository.prototype, 'createMultiAgentRun');
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR}/multi-agent-run`, payload: { agentIds: [A1] } });
    expect(res.statusCode).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it('404s for an unknown agent', async () => {
    vi.spyOn(app.container.agentsRepo, 'getById').mockResolvedValue(undefined);
    const res = await app.inject({ method: 'POST', url: `/pulls/${PR}/multi-agent-run`, payload: { agentIds: [A1] } });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /pulls/:id/multi-agent (no DB)', () => {
  it('404s when the PR has no multi-agent run', async () => {
    vi.spyOn(ReviewRepository.prototype, 'getMultiAgentRun').mockResolvedValue(undefined);
    const res = await app.inject({ method: 'GET', url: `/pulls/${PR}/multi-agent` });
    expect(res.statusCode).toBe(404);
  });

  it('builds columns, totals and conflicts; running columns have no findings', async () => {
    vi.spyOn(ReviewRepository.prototype, 'getMultiAgentRun').mockResolvedValue({
      id: MULTI,
      ranAt: new Date('2026-01-01T00:00:00Z'),
    } as never);
    const base = { provider: 'openai', model: 'm', error: null, score: null, ranAt: new Date() };
    vi.spyOn(ReviewRepository.prototype, 'listRunsForMultiRun').mockResolvedValue([
      { ...base, runId: 'r1', agentId: A1, agentName: 'Sec', status: 'done', durationMs: 2000, costUsd: 0.01, score: 80 },
      { ...base, runId: 'r2', agentId: A2, agentName: 'Perf', status: 'done', durationMs: 5000, costUsd: 0.02 },
      { ...base, runId: 'r3', agentId: 'x', agentName: 'Slow', status: 'running', durationMs: null, costUsd: null },
      { ...base, runId: 'r4', agentId: 'y', agentName: 'Bad', status: 'cancelled', durationMs: 1, costUsd: null, error: 'boom' },
    ] as never);
    const row = (id: string, runId: string, sev: string) => ({
      review: { runId, verdict: 'COMMENT', summary: 's', score: 77 },
      findings: [
        { id, severity: sev, category: 'bug', title: 't', file: 'a.ts', startLine: 5, endLine: 6, kind: 'finding',
          rationale: 'r', suggestion: null, confidence: 0.9, acceptedAt: null, dismissedAt: null },
      ],
    });
    vi.spyOn(ReviewRepository.prototype, 'reviewsForRuns').mockResolvedValue([
      row('f1', 'r1', 'CRITICAL'),
      row('f2', 'r3', 'WARNING'),
    ] as never);

    const res = await app.inject({ method: 'GET', url: `/pulls/${PR}/multi-agent?run=${MULTI}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: MULTI, pr_number: 42, agent_count: 4, total_duration_ms: 5000 });
    expect(body.total_cost_usd).toBeCloseTo(0.03);
    const [c1, c2, c3, c4] = body.columns;
    expect(c1.findings).toHaveLength(1);
    expect(c2.findings).toHaveLength(0);
    expect(c3).toMatchObject({ status: 'running', score: null, findings: [] });
    expect(c4).toMatchObject({ status: 'failed', summary: 'boom' });
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].takes.map((t: { verdict: string }) => t.verdict)).toEqual(['CRITICAL', 'ignored']);
  });
});

describe('GET /pulls/:id/multi-agent status mapping (no DB)', () => {
  it('maps queued to running, and a cancelled run without an error to failed + "Cancelled"', async () => {
    vi.spyOn(ReviewRepository.prototype, 'getMultiAgentRun').mockResolvedValue({ id: MULTI, ranAt: new Date() } as never);
    const base = { provider: 'openai', model: 'm', error: null, score: null, ranAt: new Date(), durationMs: null, costUsd: null };
    vi.spyOn(ReviewRepository.prototype, 'listRunsForMultiRun').mockResolvedValue([
      { ...base, runId: 'r1', agentId: A1, agentName: 'Q', status: 'queued' },
      { ...base, runId: 'r2', agentId: A2, agentName: 'C', status: 'cancelled' },
      { ...base, runId: 'r3', agentId: null, agentName: null, status: 'cancelled', error: 'stopped' },
    ] as never);
    vi.spyOn(ReviewRepository.prototype, 'reviewsForRuns').mockResolvedValue([] as never);
    const res = await app.inject({ method: 'GET', url: `/pulls/${PR}/multi-agent?run=${MULTI}` });
    expect(res.statusCode).toBe(200);
    const [q, c, d] = res.json().columns;
    expect(q.status).toBe('running');
    expect(c).toMatchObject({ status: 'failed', summary: 'Cancelled' });
    expect(d).toMatchObject({ status: 'failed', summary: 'stopped', agent_id: '' });
  });
});

describe('GET /agents estimates (no DB)', () => {
  it('merges estimates and flags agents without history', async () => {
    const row = (id: string) => ({
      id, name: id, description: '', provider: 'openai', model: 'm', systemPrompt: 'p', outputSchema: null,
      enabled: true, version: 1, strategy: 'single-pass', ciFailOn: 'critical', repoIntel: true,
    });
    vi.spyOn(AgentsRepository.prototype, 'list').mockResolvedValue([row(A1), row(A2)] as never);
    vi.spyOn(AgentsRepository.prototype, 'estimatesByAgent').mockResolvedValue([
      { agentId: A1, avgDurationMs: 3400.6, avgCostUsd: 0.02, runs: 3 },
    ]);
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(200);
    const [a1, a2] = res.json();
    expect(a1).toMatchObject({ est_duration_ms: 3401, est_cost_usd: 0.02, has_history: true });
    expect(a2).toMatchObject({ est_duration_ms: null, est_cost_usd: null, has_history: false });
  });
});
