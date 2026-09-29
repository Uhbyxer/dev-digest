/**
 * Route-level integration test for the Onboarding Tour (SPEC-02, ticket 01).
 * Drives `GET/POST /repos/:id/onboarding` against a real Postgres with the
 * repo-intel facade stubbed and a throwaway clone directory on disk.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { OnboardingTourResponse } from '@devdigest/shared';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const indexState = (over: Partial<IndexState> = {}): IndexState => ({
  repoId: 'x',
  status: 'full',
  filesIndexed: 120,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'sha-1',
  indexerVersion: 1,
  updatedAt: new Date(),
  ...over,
});

function stubRepoIntel(state: () => IndexState, topFiles: string[]): RepoIntel {
  return {
    getIndexState: async () => state(),
    getTopFilesByRank: async () => topFiles,
  } as unknown as RepoIntel;
}

d('Onboarding Tour routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let emptyRepoId: string;
  let cloneDir: string;
  let emptyCloneDir: string;
  let state = indexState();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    cloneDir = await mkdtemp(join(tmpdir(), 'onb-clone-'));
    await writeFile(
      join(cloneDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'next dev', build: 'next build', lint: 'eslint .' } }),
    );
    await writeFile(join(cloneDir, 'pnpm-lock.yaml'), '');
    await writeFile(join(cloneDir, '.env.example'), 'KEY=');
    await writeFile(join(cloneDir, 'docker-compose.yml'), 'services: {}');

    emptyCloneDir = await mkdtemp(join(tmpdir(), 'onb-empty-'));

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'tour', fullName: 'acme/tour', clonePath: cloneDir })
      .returning();
    repoId = repo!.id;
    const [empty] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'bare', fullName: 'acme/bare', clonePath: emptyCloneDir })
      .returning();
    emptyRepoId = empty!.id;

    // src/lib/redis.ts has 3 dependents, src/server.ts has 1, src/util.ts has 2.
    await pg.handle.db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/a.ts', toFile: 'src/lib/redis.ts' },
      { repoId, fromFile: 'src/b.ts', toFile: 'src/lib/redis.ts' },
      { repoId, fromFile: 'src/c.ts', toFile: 'src/lib/redis.ts' },
      { repoId, fromFile: 'src/a.ts', toFile: 'src/util.ts' },
      { repoId, fromFile: 'src/b.ts', toFile: 'src/util.ts' },
      { repoId, fromFile: 'src/main.ts', toFile: 'src/server.ts' },
    ]);
  });

  afterAll(async () => {
    await pg?.stop();
    await rm(cloneDir, { recursive: true, force: true });
    await rm(emptyCloneDir, { recursive: true, force: true });
  });

  // Rank order from the facade deliberately differs from dependents order.
  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel: stubRepoIntel(() => state, ['src/server.ts', 'src/util.ts', 'src/lib/redis.ts']),
      },
    });

  it('returns an empty result (not an error) before any Tour exists', async () => {
    state = indexState();
    const res = await (await app()).inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(OnboardingTourResponse.parse(res.json()).tour).toBeNull();
  });

  it('generates a Tour: critical paths ranked by dependents, run commands from repo files', async () => {
    state = indexState();
    const a = await app();
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    const { tour } = OnboardingTourResponse.parse(res.json());
    expect(tour).not.toBeNull();

    expect(tour!.sections.critical_paths.status).toBe('ok');
    expect(tour!.sections.critical_paths.items.map((i) => [i.path, i.dependents])).toEqual([
      ['src/lib/redis.ts', 3],
      ['src/util.ts', 2],
      ['src/server.ts', 1],
    ]);

    expect(tour!.sections.run_locally.status).toBe('ok');
    expect(tour!.sections.run_locally.steps.map((s) => s.command)).toEqual([
      'pnpm install',
      'cp .env.example .env',
      'docker compose up -d',
      'pnpm dev',
    ]);

    expect(tour!.files_indexed).toBe(120);
    expect(tour!.index_commit_sha).toBe('sha-1');
    expect(tour!.partial_index).toBe(false);

    const got = await a.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(OnboardingTourResponse.parse(got.json()).tour!.generated_at).toBe(tour!.generated_at);
  });

  it('regenerating replaces the Tour — still one row per repo', async () => {
    state = indexState({ lastIndexedSha: 'sha-2', filesIndexed: 130 });
    const a = await app();
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(OnboardingTourResponse.parse(res.json()).tour!.index_commit_sha).toBe('sha-2');

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
  });

  it('marks run_locally not_generated instead of inventing commands when the repo has none', async () => {
    state = indexState();
    const res = await (await app()).inject({ method: 'POST', url: `/repos/${emptyRepoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    const { tour } = OnboardingTourResponse.parse(res.json());
    expect(tour!.sections.run_locally).toEqual({ status: 'not_generated', steps: [] });
    // The other sections are unaffected by it.
    expect(tour!.sections.critical_paths.status).toBe('not_generated');
  });

  it('refuses generation with a clear reason while the index is not ready', async () => {
    state = indexState({ status: 'failed' });
    const res = await (await app()).inject({ method: 'POST', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('index_not_ready');
  });

  it('flags a partial index but still generates', async () => {
    state = indexState({ status: 'partial' });
    const res = await (await app()).inject({ method: 'POST', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(OnboardingTourResponse.parse(res.json()).tour!.partial_index).toBe(true);
  });

  it('404s for an unknown repo', async () => {
    const res = await (await app()).inject({
      method: 'GET',
      url: `/repos/00000000-0000-0000-0000-000000000000/onboarding`,
    });
    expect(res.statusCode).toBe(404);
  });
});
