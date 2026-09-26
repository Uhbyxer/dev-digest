/**
 * Route-level integration test for `GET /pulls/:id/blast` (issue #32). Thin —
 * the mapping logic is covered at the pure `mapBlastResultToContract` seam
 * (blast-mapper.test.ts); this asserts the response validates against the
 * shared `BlastRadius` Zod contract and that a degraded facade result surfaces
 * `degraded`/`reason` unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { BlastRadius } from '@devdigest/shared';
import type { RepoIntel, BlastResult } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function stubRepoIntel(getBlastRadius: (repoId: string, files: string[]) => Promise<BlastResult>): RepoIntel {
  return { getBlastRadius } as unknown as RepoIntel;
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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
      .values({ workspaceId, owner: 'acme', name: 'blast-repo', fullName: 'acme/blast-repo' })
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

  function appWith(repoIntel: RepoIntel) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), repoIntel },
    });
  }

  it('validates against the BlastRadius contract for a persistent-index result', async () => {
    const app = await appWith(
      stubRepoIntel(async () => ({
        changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'src/caller.ts', symbol: 'handler', viaSymbol: 'foo', line: 3, rank: 1 }],
        impactedEndpoints: ['GET /foo'],
        factsByFile: { 'src/caller.ts': { endpoints: ['GET /foo'], crons: [] } },
        degraded: false,
      })),
    );

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadius.parse(res.json());
    expect(parsed.changed_symbols).toEqual([{ file: 'src/a.ts', name: 'foo', kind: 'function' }]);
    expect(parsed.downstream[0]!.endpoints_affected).toEqual(['GET /foo']);
    expect(parsed.degraded).toBe(false);
  });

  it('surfaces degraded/reason unchanged for the ripgrep-fallback path', async () => {
    const app = await appWith(
      stubRepoIntel(async () => ({
        changedSymbols: [],
        callers: [],
        impactedEndpoints: [],
        degraded: true,
        reason: 'no_data',
      })),
    );

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadius.parse(res.json());
    expect(parsed.degraded).toBe(true);
    expect(parsed.reason).toBe('no_data');
    expect(parsed.downstream).toEqual([]);
  });

  it('404s for a PR outside the workspace / that does not exist', async () => {
    const app = await appWith(stubRepoIntel(async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] })));
    const res = await app.inject({ method: 'GET', url: `/pulls/00000000-0000-0000-0000-000000000000/blast` });
    expect(res.statusCode).toBe(404);
  });
});
