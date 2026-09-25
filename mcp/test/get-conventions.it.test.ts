import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '@devdigest/server/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '@devdigest/server/adapters/mocks.js';
import { ConventionsRepository } from '@devdigest/server/modules/conventions/repository.js';
import * as t from '@devdigest/server/db/schema.js';
import { loadConfig } from '@devdigest/server/platform/config.js';
import { buildMcpContext, type McpContext } from '../src/platform/context.js';
import { getConventionsTool } from '../src/tools/get-conventions.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILE_SELECTION_FIXTURE = {
  groups: [{ theme: 'async style', files: ['src/a.ts'], rationale: 'uses async/await' }],
};
const EXTRACTION_FIXTURE = {
  candidates: [
    {
      rule: 'Always use async/await, never .then() chains',
      evidence_path: 'src/a.ts',
      evidence_snippet: 'export async function foo() {\n  await bar();\n  return 1;\n}',
      confidence: 0.9,
    },
  ],
};

function conventionsLlm() {
  return new MockLLMProvider('openai', {
    structuredBySchema: {
      ConventionFileSelection: FILE_SELECTION_FIXTURE,
      ConventionExtraction: EXTRACTION_FIXTURE,
    },
  });
}

d('get_conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ctx: McpContext;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-mcp-conventions-'));
    await mkdir(join(clonePath, 'src'), { recursive: true });
    await writeFile(
      join(clonePath, 'src', 'a.ts'),
      "export async function foo() {\n  await bar();\n  return 1;\n}\n",
    );

    ctx = await buildMcpContext({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: conventionsLlm() },
      },
    });
  });
  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  async function makeRepo(name: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ctx.workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    await pg.handle.db
      .insert(t.fileRank)
      .values([{ repoId: repo!.id, filePath: 'src/a.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 99 }]);
    return repo!;
  }

  it('first call on an unscanned repo triggers a scan and returns accepted-defaulted results', async () => {
    const repo = await makeRepo('conventions-unscanned');
    const result = await getConventionsTool(ctx.container, ctx.workspaceId, { repo: repo.fullName });
    // Freshly scanned candidates are `pending`, not `accepted` — the default
    // `status` filter (accepted) legitimately returns none yet, but the scan
    // itself must have inserted rows (asserted via the DB directly).
    expect(result.text).toBe('No accepted conventions for this repo.');
    const rows = await new ConventionsRepository(pg.handle.db).listByRepo(ctx.workspaceId, repo.id);
    expect(rows).toHaveLength(1);
  });

  it('the status filter round-trips to pending candidates from the auto-scan', async () => {
    const repo = await makeRepo('conventions-status-filter');
    await getConventionsTool(ctx.container, ctx.workspaceId, { repo: repo.fullName });

    const result = await getConventionsTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      status: 'pending',
    });
    expect(result.text).toContain('Always use async/await, never .then() chains');
    expect(result.text).toContain('src/a.ts');
  });

  it('a repo already scanned does not re-scan (no duplicate candidates)', async () => {
    const repo = await makeRepo('conventions-already-scanned');
    const conventionsRepo = new ConventionsRepository(pg.handle.db);
    await getConventionsTool(ctx.container, ctx.workspaceId, { repo: repo.fullName, status: 'pending' });
    const before = await conventionsRepo.listByRepo(ctx.workspaceId, repo.id);

    await getConventionsTool(ctx.container, ctx.workspaceId, { repo: repo.fullName, status: 'pending' });
    const after = await conventionsRepo.listByRepo(ctx.workspaceId, repo.id);

    expect(after.length).toBe(before.length);
  });

  it('an unknown repo returns a repo-not-added error', async () => {
    const result = await getConventionsTool(ctx.container, ctx.workspaceId, { repo: 'acme/nope' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('not added');
  });
});
