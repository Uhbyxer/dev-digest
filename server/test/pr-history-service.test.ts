import { describe, it, expect } from 'vitest';
import { resolvePriorPrsForFiles } from '../src/modules/pr-history/service.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

describe('resolvePriorPrsForFiles', () => {
  it('queries each file (capped at 3 commits/file, enforced by the GitHubClient) and dedupes cross-file', async () => {
    const github = new MockGitHubClient({
      recentPrsForFile: {
        'src/a.ts': [
          { pr_number: 7, title: 'Fix a', merged_at: '2026-02-01T00:00:00Z', author: 'dee' },
        ],
        'src/b.ts': [
          { pr_number: 7, title: 'Fix a', merged_at: '2026-02-01T00:00:00Z', author: 'dee' },
          { pr_number: 3, title: 'Old b change', merged_at: '2026-01-01T00:00:00Z', author: 'eve' },
        ],
      },
    });

    const history = await resolvePriorPrsForFiles(github, { owner: 'acme', name: 'repo' }, [
      'src/a.ts',
      'src/b.ts',
    ]);

    expect(history).toEqual([
      {
        pr_number: 7,
        title: 'Fix a',
        merged_at: '2026-02-01T00:00:00Z',
        author: 'dee',
        files_overlap: ['src/a.ts', 'src/b.ts'],
        notes: '',
      },
      {
        pr_number: 3,
        title: 'Old b change',
        merged_at: '2026-01-01T00:00:00Z',
        author: 'eve',
        files_overlap: ['src/b.ts'],
        notes: '',
      },
    ]);
  });

  it('returns [] for a file with no resolvable history, without throwing', async () => {
    const github = new MockGitHubClient();
    const history = await resolvePriorPrsForFiles(github, { owner: 'acme', name: 'repo' }, ['src/unknown.ts']);
    expect(history).toEqual([]);
  });
});
