import { describe, it, expect } from 'vitest';
import { dedupePriorPrs } from '../src/modules/pr-history/dedupe.js';

describe('dedupePriorPrs', () => {
  it('caps at 3 commits/file upstream and dedupes cross-file by pr_number', () => {
    const result = dedupePriorPrs([
      {
        file: 'src/a.ts',
        items: [
          { pr_number: 42, title: 'Refactor a', merged_at: '2026-01-01T00:00:00Z', author: 'alice' },
          { pr_number: 40, title: 'Older a change', merged_at: '2025-12-01T00:00:00Z', author: 'bob' },
        ],
      },
      {
        file: 'src/b.ts',
        items: [
          { pr_number: 42, title: 'Refactor a', merged_at: '2026-01-01T00:00:00Z', author: 'alice' },
          { pr_number: 41, title: 'Touch b', merged_at: '2025-12-15T00:00:00Z', author: 'carol' },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        pr_number: 42,
        title: 'Refactor a',
        merged_at: '2026-01-01T00:00:00Z',
        author: 'alice',
        files_overlap: ['src/a.ts', 'src/b.ts'],
        notes: '',
      },
      {
        pr_number: 41,
        title: 'Touch b',
        merged_at: '2025-12-15T00:00:00Z',
        author: 'carol',
        files_overlap: ['src/b.ts'],
        notes: '',
      },
      {
        pr_number: 40,
        title: 'Older a change',
        merged_at: '2025-12-01T00:00:00Z',
        author: 'bob',
        files_overlap: ['src/a.ts'],
        notes: '',
      },
    ]);
  });

  it('returns [] for no matches, never throwing on empty input', () => {
    expect(dedupePriorPrs([])).toEqual([]);
    expect(dedupePriorPrs([{ file: 'src/a.ts', items: [] }])).toEqual([]);
  });
});
