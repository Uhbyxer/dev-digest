/**
 * Route-level integration test for `GET /pulls/:id/pr-history` (issue #32).
 * The dedup logic is covered at the pure seam (pr-history-dedupe.test.ts) and
 * the GitHubClient-facing resolver at pr-history-service.test.ts; this checks
 * the route validates against `PrHistory` and caches per (repo, file).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { PrHistory } from '@devdigest/shared';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[pr-history] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function stubRepoIntel(changedSymbolFile: string): RepoIntel {
  const result: BlastResult = {
    changedSymbols: [{ file: changedSymbolFile, name: 'foo', kind: 'function' }],
    callers: [],
    impactedEndpoints: [],
    degraded: false,
  };
  return { getBlastRadius: async () => result } as unknown as RepoIntel;
}

d('GET /pulls/:id/pr-history (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'history-repo', fullName: 'acme/history-repo' })
      .returning();
    repoId = repo!.id;

    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'Change the thing',
        author: 'dev',
        branch: 'feature',
        base: 'main',
        headSha: 'abc123',
      })
      .returning();
    prId = pr!.id;

    await pg.handle.db.insert(t.prFiles).values([{ prId, path: 'src/a.ts', additions: 1, deletions: 0 }]);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(github: MockGitHubClient) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github, repoIntel: stubRepoIntel('src/a.ts') },
    });
  }

  it('validates against PrHistory and caches the per-file result', async () => {
    const github = new MockGitHubClient({
      recentPrsForFile: {
        'src/a.ts': [{ pr_number: 9, title: 'Earlier fix', merged_at: '2026-01-01T00:00:00Z', author: 'sam' }],
      },
    });
    const app = await appWith(github);

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/pr-history` });
    expect(res.statusCode).toBe(200);
    const parsed = PrHistory.parse(res.json());
    expect(parsed.history).toEqual([
      {
        pr_number: 9,
        title: 'Earlier fix',
        merged_at: '2026-01-01T00:00:00Z',
        author: 'sam',
        files_overlap: ['src/a.ts'],
        notes: '',
      },
    ]);

    const cached = await pg.handle.db
      .select()
      .from(t.prHistoryCache)
      .where(eq(t.prHistoryCache.repoId, repoId));
    expect(cached).toHaveLength(1);
    expect(cached[0]!.filePath).toBe('src/a.ts');
  });

  it('404s for a PR outside the workspace / that does not exist', async () => {
    const app = await appWith(new MockGitHubClient());
    const res = await app.inject({
      method: 'GET',
      url: `/pulls/00000000-0000-0000-0000-000000000000/pr-history`,
    });
    expect(res.statusCode).toBe(404);
  });
});
