import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockGitHubClient } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import { CiRepository, type InsertCiRun } from './repository.js';
import { refreshCiRuns } from './ingest.js';

/** Unit-level ingest: repository is spied (no DB); the real DB idempotency is in test/ci-ingest.it.test.ts. */
const inst = {
  id: 'inst-1', agentId: 'agent-1', repo: 'acme/widgets', targetType: 'gha',
  agentName: 'Sec', ciFailOn: 'critical', provider: 'openrouter', model: 'm/x',
};
const run = (id: number, pr: number[] = [5]) => ({
  id, html_url: `https://github.com/acme/widgets/actions/runs/${id}`,
  status: 'completed', conclusion: 'success', created_at: '2026-07-01T00:00:00Z', pr_numbers: pr,
});
const artifact = (over: Record<string, unknown> = {}) => ({
  findings_count: 3, critical: 1, warning: 1, suggestion: 1, cost_usd: 0.02, duration_ms: 1200, agent: 'Sec', ...over,
});

function setup(github: MockGitHubClient, known: string[] = []) {
  vi.spyOn(CiRepository.prototype, 'listTrackedGha').mockResolvedValue([inst] as never);
  vi.spyOn(CiRepository.prototype, 'ingestedGithubRunIds').mockResolvedValue(new Set(known));
  const insert = vi.spyOn(CiRepository.prototype, 'insertCiRuns').mockImplementation(async (r: InsertCiRun[]) => r.length);
  const container = { db: {}, github: async () => github } as unknown as Container;
  return { insert, container };
}

afterEach(() => vi.restoreAllMocks());

describe('refreshCiRuns', () => {
  it('ingests a completed run with CI metadata and a verdict from the agent gate (AC-28, AC-29)', async () => {
    const { insert, container } = setup(new MockGitHubClient({ workflowRuns: [run(11)], artifacts: { 11: artifact() } }));
    const res = await refreshCiRuns(container, 'ws');
    expect(res).toEqual({ degraded: false, ingested: 1, skipped: 0 });
    const [row] = insert.mock.calls[0]![0];
    expect(row).toMatchObject({
      ciGithubRunId: 11, ciPrNumber: 5, ciRepo: 'acme/widgets', ciInstallationId: 'inst-1',
      findingsCount: 3, blockers: 1, ciJobUrl: 'https://github.com/acme/widgets/actions/runs/11',
    });
  });

  it('AC-30: a run already ingested is not inserted again', async () => {
    const { insert, container } = setup(
      new MockGitHubClient({ workflowRuns: [run(11)], artifacts: { 11: artifact() } }),
      ['11:5'],
    );
    const res = await refreshCiRuns(container, 'ws');
    expect(res.ingested).toBe(0);
    expect(insert.mock.calls[0]?.[0] ?? []).toEqual([]);
  });

  it('AC-31: invalid, missing and expired artifacts are skipped while valid ones still ingest', async () => {
    const { insert, container } = setup(
      new MockGitHubClient({
        workflowRuns: [run(1), run(2), run(3), run(4)],
        // 2 = missing/expired (no key), 3 = invalid schema, 4 = garbage
        artifacts: { 1: artifact(), 3: { findings_count: 'many' }, 4: 'not json object' },
      }),
    );
    const res = await refreshCiRuns(container, 'ws');
    expect(res).toEqual({ degraded: false, ingested: 1, skipped: 3 });
    expect(insert.mock.calls[0]![0].map((r) => r.ciGithubRunId)).toEqual([1]);
  });

  it('AC-32: a GitHub API failure reports degraded and writes nothing', async () => {
    const { insert, container } = setup(
      new MockGitHubClient({ workflowRuns: [run(1)], artifacts: { 1: artifact() }, workflowRunsError: new Error('rate limited') }),
    );
    const res = await refreshCiRuns(container, 'ws');
    expect(res).toEqual({ degraded: true, ingested: 0, skipped: 0 });
    expect(insert.mock.calls.flatMap((c) => c[0])).toEqual([]);
  });

  it('skips artifact download for runs already ingested', async () => {
    const github = new MockGitHubClient({ workflowRuns: [run(11), run(12)], artifacts: { 11: artifact(), 12: artifact() } });
    const dl = vi.spyOn(github, 'downloadRunArtifact');
    const { container } = setup(github, ['11:5']);
    await refreshCiRuns(container, 'ws');
    expect(dl.mock.calls.map((c) => c[1])).toEqual([12]);
  });

  it('404 listing runs means no runs, not degraded', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    const { insert, container } = setup(new MockGitHubClient({ workflowRunsError: err }));
    expect(await refreshCiRuns(container, 'ws')).toEqual({ degraded: false, ingested: 0, skipped: 0 });
    expect(insert).toHaveBeenCalledWith([]);
  });

  it('one failing installation is degraded but keeps the others, with no partial rows for it', async () => {
    const good = { ...inst, id: 'inst-2', repo: 'acme/ok' };
    const bad = { ...inst, id: 'inst-1', repo: 'acme/bad' };
    vi.spyOn(CiRepository.prototype, 'listTrackedGha').mockResolvedValue([bad, good] as never);
    vi.spyOn(CiRepository.prototype, 'ingestedGithubRunIds').mockResolvedValue(new Set());
    const insert = vi.spyOn(CiRepository.prototype, 'insertCiRuns').mockImplementation(async (r: InsertCiRun[]) => r.length);
    const github = new MockGitHubClient({ workflowRuns: [run(1), run(2)], artifacts: { 1: artifact(), 2: artifact() } });
    // bad repo: first run's artifact downloads, second throws -> its rows must be discarded
    const orig = github.downloadRunArtifact.bind(github);
    let calls = 0;
    vi.spyOn(github, 'downloadRunArtifact').mockImplementation(async (r, id, n) => {
      if (r.name === 'bad' && ++calls === 2) throw Object.assign(new Error('Forbidden'), { status: 403 });
      return orig(r, id, n);
    });
    const container = { db: {}, github: async () => github } as unknown as Container;
    const res = await refreshCiRuns(container, 'ws');
    expect(res.degraded).toBe(true);
    const rows = insert.mock.calls[0]![0];
    expect(rows.map((r) => r.ciInstallationId)).toEqual(['inst-2', 'inst-2']);
    expect(res.ingested).toBe(2);
  });
});

describe('refreshCiRuns coalescing', () => {
  it('concurrent refreshes for the same scope share one sweep; a later one runs again', async () => {
    const { container } = setup(new MockGitHubClient({ workflowRuns: [run(11)], artifacts: { 11: artifact() } }));
    const list = vi.spyOn(CiRepository.prototype, 'listTrackedGha');
    const [a, b] = await Promise.all([refreshCiRuns(container, 'ws'), refreshCiRuns(container, 'ws')]);
    expect(a).toBe(b);
    expect(list).toHaveBeenCalledTimes(1);
    await refreshCiRuns(container, 'ws');
    expect(list).toHaveBeenCalledTimes(2);
  });
});
