import { describe, it, expect } from 'vitest';
import { CiResultArtifact } from '@devdigest/shared';
import { blockersFromCounts, scoreFromCounts, verdictOf } from './verdict.js';

describe('CI verdict (AC-29: same rule as local runs)', () => {
  const counts = { critical: 1, warning: 2, suggestion: 3 };

  it.each([
    ['critical', 1],
    ['warning', 3],
    ['any', 6],
    ['never', 0],
  ] as const)('blockers under ci_fail_on=%s', (failOn, expected) => {
    expect(blockersFromCounts(counts, failOn)).toBe(expected);
  });

  it('treats missing severity counts as zero', () => {
    expect(blockersFromCounts({}, 'any')).toBe(0);
  });

  it('verdict: none -> APPROVE, gate tripped -> REQUEST_CHANGES, else COMMENT', () => {
    expect(verdictOf(0, 0)).toBe('APPROVE');
    expect(verdictOf(3, 1)).toBe('REQUEST_CHANGES');
    expect(verdictOf(3, 0)).toBe('COMMENT');
    expect(verdictOf(null, null)).toBeNull();
  });

  it('score: same penalties as local runs, from severity counts', () => {
    expect(scoreFromCounts({})).toBe(100);
    expect(scoreFromCounts({ suggestion: 1 })).toBe(97);
    expect(scoreFromCounts({ warning: 1 })).toBe(88);
    expect(scoreFromCounts({ critical: 1, warning: 2, suggestion: 3 })).toBe(100 - 35 - 24 - 9);
    expect(scoreFromCounts({ critical: 10 })).toBe(0);
  });

  it('artifact schema bounds untrusted counts (no unbounded allocation)', () => {
    const ok = { findings_count: 1, cost_usd: null, agent: 'a' };
    expect(CiResultArtifact.safeParse({ ...ok, critical: 10_000 }).success).toBe(true);
    expect(CiResultArtifact.safeParse({ ...ok, critical: 2_000_000_000 }).success).toBe(false);
    expect(CiResultArtifact.safeParse({ ...ok, warning: -1 }).success).toBe(false);
    expect(CiResultArtifact.safeParse({ ...ok, findings_count: 2_000_000_000 }).success).toBe(false);
  });
});
