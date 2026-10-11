import { describe, it, expect } from 'vitest';
import type { AgentColumn } from '@devdigest/shared';
import { computeConflicts } from './conflicts.js';

type F = AgentColumn['findings'][number];

function finding(over: Partial<F> & Pick<F, 'file' | 'start_line'>): F {
  return {
    id: `f-${over.file}-${over.start_line}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'Issue',
    end_line: over.start_line,
    ...over,
  } as F;
}

function col(id: string, findings: F[], status: AgentColumn['status'] = 'done'): AgentColumn {
  return {
    run_id: `run-${id}`,
    agent_id: id,
    agent_name: id.toUpperCase(),
    provider: 'openai',
    model: 'm',
    status,
    verdict: null,
    score: null,
    summary: null,
    duration_ms: null,
    cost_usd: null,
    findings,
  };
}

describe('computeConflicts', () => {
  it('returns nothing when no agent flagged anything or none finished', () => {
    expect(computeConflicts([col('a', []), col('b', [])])).toEqual([]);
    expect(computeConflicts([col('a', [finding({ file: 'x.ts', start_line: 1 })], 'running')])).toEqual([]);
  });

  it('groups overlapping ranges in the same file into one conflict with a take per agent', () => {
    const out = computeConflicts([
      col('a', [finding({ file: 'x.ts', start_line: 10, end_line: 20, title: 'A says' })]),
      col('b', [finding({ file: 'x.ts', start_line: 15, end_line: 18, title: 'B says' })]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ file: 'x.ts', line: 10 });
    expect(out[0]!.takes.map((t) => [t.agent_id, t.verdict])).toEqual([
      ['a', 'WARNING'],
      ['b', 'WARNING'],
    ]);
  });

  it('keeps disjoint ranges in the same file as separate groups', () => {
    const out = computeConflicts([
      col('a', [
        finding({ file: 'x.ts', start_line: 1, end_line: 3 }),
        finding({ file: 'x.ts', start_line: 10, end_line: 12 }),
      ]),
      col('b', [finding({ file: 'x.ts', start_line: 4, end_line: 5 })]),
    ]);
    expect(out.map((c) => c.line)).toEqual([1, 4, 10]);
  });

  it('merges transitively through a chain of overlaps', () => {
    const out = computeConflicts([
      col('a', [finding({ file: 'x.ts', start_line: 1, end_line: 5 }), finding({ file: 'x.ts', start_line: 9, end_line: 12 })]),
      col('b', [finding({ file: 'x.ts', start_line: 4, end_line: 10 })]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.line).toBe(1);
  });

  it('never groups findings from different files', () => {
    const out = computeConflicts([
      col('a', [finding({ file: 'x.ts', start_line: 5 })]),
      col('b', [finding({ file: 'y.ts', start_line: 5 })]),
    ]);
    expect(out.map((c) => c.file)).toEqual(['x.ts', 'y.ts']);
    expect(out[0]!.takes.find((t) => t.agent_id === 'b')!.verdict).toBe('ignored');
  });

  it('marks agents that ran but did not flag as ignored; skips failed/running agents', () => {
    const out = computeConflicts([
      col('a', [finding({ file: 'x.ts', start_line: 2, severity: 'CRITICAL' })]),
      col('b', []),
      col('c', [], 'failed'),
      col('d', [], 'running'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.takes.map((t) => [t.agent_id, t.verdict])).toEqual([
      ['a', 'CRITICAL'],
      ['b', 'ignored'],
    ]);
  });

  it('uses each agent highest severity and the highest finding as the group title', () => {
    const out = computeConflicts([
      col('a', [
        finding({ file: 'x.ts', start_line: 1, end_line: 4, severity: 'SUGGESTION', title: 'nit' }),
        finding({ file: 'x.ts', start_line: 2, end_line: 3, severity: 'CRITICAL', title: 'boom' }),
      ]),
      col('b', [finding({ file: 'x.ts', start_line: 3, severity: 'WARNING' })]),
    ]);
    expect(out[0]!.title).toBe('boom');
    expect(out[0]!.takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'WARNING']);
  });

  it('treats a missing end_line as a single-line range', () => {
    const f = finding({ file: 'x.ts', start_line: 7 });
    delete (f as { end_line?: number }).end_line;
    const out = computeConflicts([col('a', [f]), col('b', [finding({ file: 'x.ts', start_line: 8 })])]);
    expect(out).toHaveLength(2);
  });

  it('keeps takes distinct for deleted agents that share an empty agent_id', () => {
    const a = col('', [finding({ file: 'x.ts', start_line: 5, severity: 'CRITICAL' })]);
    const b = col('', [finding({ file: 'x.ts', start_line: 40 })]);
    a.run_id = 'run-a';
    b.run_id = 'run-b';
    const out = computeConflicts([a, b]);
    expect(out).toHaveLength(2);
    // Each group: the agent that flagged it keeps its severity, the other is 'ignored'.
    expect(out[0]!.takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'ignored']);
    expect(out[1]!.takes.map((t) => t.verdict)).toEqual(['ignored', 'WARNING']);
  });
});
