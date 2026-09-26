import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Container } from '@devdigest/server/platform/container.js';
import type { RepoRow } from '@devdigest/server/modules/repos/repository.js';
import type { PullRow } from '@devdigest/server/db/rows.js';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';

vi.mock('../src/resolvers/repo-pr.js', async () => {
  const actual = await vi.importActual<typeof import('../src/resolvers/repo-pr.js')>(
    '../src/resolvers/repo-pr.js',
  );
  return { ...actual, resolveRepoAndPr: vi.fn() };
});

vi.mock('@devdigest/server/modules/blast/service.js', () => ({
  getBlastRadiusForPr: vi.fn(),
}));

import { resolveRepoAndPr } from '../src/resolvers/repo-pr.js';
import { getBlastRadiusForPr } from '@devdigest/server/modules/blast/service.js';

const REPO = { id: 'repo-1' } as RepoRow;
const PULL = { id: 'pull-1' } as PullRow;

describe('get_blast_radius', () => {
  beforeEach(() => {
    vi.mocked(resolveRepoAndPr).mockReset();
    vi.mocked(getBlastRadiusForPr).mockReset();
  });

  it('resolves the repo/PR, calls getBlastRadiusForPr in-process, and formats the result', async () => {
    vi.mocked(resolveRepoAndPr).mockResolvedValue({ kind: 'ok', repo: REPO, pull: PULL });
    vi.mocked(getBlastRadiusForPr).mockResolvedValue({
      changed_symbols: [{ name: 'foo', file: 'src/a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'foo',
          callers: [{ name: 'handler', file: 'src/caller.ts', line: 3 }],
          endpoints_affected: ['GET /foo'],
          crons_affected: [],
        },
      ],
      summary: '1 changed symbol(s), 1 caller(s), 1 endpoint(s), 0 cron job(s) affected.',
      degraded: false,
    });

    const container = {} as unknown as Container;
    const result = await getBlastRadiusTool(container, 'ws-1', { repo: 'acme/whatever', pr_number: 1 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('1 changed symbol(s)');
    expect(result.text).toContain('foo');
    expect(result.text).toContain('handler — src/caller.ts:3');
    expect(vi.mocked(getBlastRadiusForPr)).toHaveBeenCalledWith(container, 'ws-1', 'pull-1');
  });

  it('returns a friendly error for an unresolvable repo/PR, without calling getBlastRadiusForPr', async () => {
    vi.mocked(resolveRepoAndPr).mockResolvedValue({
      kind: 'pr_not_imported',
      fullName: 'acme/whatever',
      number: 1,
    });

    const container = {} as unknown as Container;
    const result = await getBlastRadiusTool(container, 'ws-1', { repo: 'acme/whatever', pr_number: 1 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('has not been imported');
    expect(vi.mocked(getBlastRadiusForPr)).not.toHaveBeenCalled();
  });
});
