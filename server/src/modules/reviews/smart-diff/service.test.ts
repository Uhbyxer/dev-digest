import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from './service.js';

describe('buildSmartDiff', () => {
  it('groups files by role in fixed display order and omits zero-file groups', () => {
    const files = [
      { path: 'pnpm-lock.yaml', additions: 3, deletions: 0 },
      { path: 'src/service.ts', additions: 10, deletions: 2 },
      { path: 'src/service.test.ts', additions: 20, deletions: 0 },
    ];

    const result = buildSmartDiff(files, new Map());

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'boilerplate']);
    expect(result.groups.find((g) => g.role === 'wiring')).toBeUndefined();
    expect(result.groups.find((g) => g.role === 'docs')).toBeUndefined();
  });

  it('preserves each file\'s original relative order within its group (no alphabetical reordering)', () => {
    const files = [
      { path: 'src/z.test.ts', additions: 1, deletions: 0 },
      { path: 'src/a.test.ts', additions: 1, deletions: 0 },
    ];

    const result = buildSmartDiff(files, new Map());

    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/z.test.ts', 'src/a.test.ts']);
  });

  it('attaches finding_lines per path and defaults to an empty array when absent', () => {
    const files = [
      { path: 'src/service.ts', additions: 10, deletions: 2 },
      { path: 'src/other.ts', additions: 1, deletions: 0 },
    ];
    const findingLines = new Map([['src/service.ts', [12, 40]]]);

    const result = buildSmartDiff(files, findingLines);

    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/service.ts')!.finding_lines).toEqual([12, 40]);
    expect(core.files.find((f) => f.path === 'src/other.ts')!.finding_lines).toEqual([]);
  });

  it('computes split_suggestion minimally: too_big false, total_lines summed, no proposed splits', () => {
    const files = [
      { path: 'a.ts', additions: 10, deletions: 5 },
      { path: 'b.ts', additions: 3, deletions: 2 },
    ];

    const result = buildSmartDiff(files, new Map());

    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 20, proposed_splits: [] });
  });
});
