import { describe, it, expect, vi, afterEach } from 'vitest';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { ContextRepository } from '../src/modules/context/repository.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { Container } from '../src/platform/container.js';

afterEach(() => vi.restoreAllMocks());

const repo = { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main' };
const P = '.devdigest/specs/a.md';

/** The executor's Project-context seams are private; reach them via a cast (no DB, no LLM). */
type Seams = {
  buildProjectContext(r: unknown, agentId: string, log: { info: (m: string) => void }): Promise<
    { specs: string[]; snapshot: { text: string; entries: { path: string; origin: string }[]; skipped: { path: string; reason: string }[] } } | undefined
  >;
  traceFromBuffer(runId: string, pull: unknown, agent: unknown, grounding: string, ms?: number, pc?: unknown): {
    specs_read: string[]; project_context?: unknown;
  };
};

function executor(git: MockGitClient) {
  const container = { db: {}, git, runBus: { buffer: () => [] } } as unknown as Container;
  return new ReviewRunExecutor(container, {} as never, {} as never) as unknown as Seams;
}
const runLog = () => {
  const lines: string[] = [];
  return { lines, log: { info: (m: string) => void lines.push(m) } };
};

describe('ReviewRunExecutor project context', () => {
  it('AC-25/28/30: injects specs read from the base ref, snapshotted once per doc', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({ agentPaths: [P], skills: [] });
    const git = new MockGitClient({ refFiles: { [P]: 'rule one' } });
    const spy = vi.spyOn(git, 'readFileAtRef');
    const r = await executor(git).buildProjectContext(repo, 'ag', runLog().log);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ owner: 'acme', name: 'app' }, 'origin/main', P, 100 * 1024);
    expect(r!.specs).toHaveLength(1);
    expect(r!.specs[0]).toContain('rule one');
    expect(r!.snapshot.entries).toMatchObject([{ path: P, origin: 'agent' }]);
  });

  it('AC-29: nothing attached -> undefined (no specs, no section)', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({ agentPaths: [], skills: [] });
    expect(await executor(new MockGitClient()).buildProjectContext(repo, 'ag', runLog().log)).toBeUndefined();
  });

  it('AC-31: a missing doc is skipped, the run is not failed, and the skip is logged', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({ agentPaths: [P], skills: [] });
    const { lines, log } = runLog();
    const r = await executor(new MockGitClient()).buildProjectContext(repo, 'ag', log);
    expect(r!.specs).toEqual([]);
    expect(r!.snapshot.skipped).toEqual([{ path: P, reason: 'missing on origin/main' }]);
    expect(lines.some((l) => l.includes(P))).toBe(true);
  });

  it('AC-35/36: the failure-path trace still records specs_read and the snapshot; absent snapshot leaves them empty', () => {
    const ex = executor(new MockGitClient());
    const agent = { id: 'a', name: 'n', provider: 'openai', model: 'm', systemPrompt: '' };
    const snap = { text: 't', entries: [{ path: P, origin: 'agent', tokens: 1 }], skipped: [{ path: 'x', reason: 'r' }] };
    const withCtx = ex.traceFromBuffer('run', { id: 'p' }, agent, '0/0 passed', 1, snap);
    expect(withCtx.specs_read).toEqual([P]);
    expect(withCtx.project_context).toEqual(snap);
    const without = ex.traceFromBuffer('run', { id: 'p' }, agent, '0/0 passed');
    expect(without.specs_read).toEqual([]);
    expect('project_context' in without).toBe(false);
  });
});
