import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { setupRepoAndPr } from './helpers/fixtures.js';
import { seed } from '@devdigest/server/db/seed.js';
import { AgentsService } from '@devdigest/server/modules/agents/service.js';
import { MockLLMProvider, MockEmbedder } from '@devdigest/server/adapters/mocks.js';
import { loadConfig } from '@devdigest/server/platform/config.js';
import type { Review } from '@devdigest/shared';
import { buildMcpContext, type McpContext } from '../src/platform/context.js';
import { runReviewTool } from '../src/tools/run-review.js';
import { getFindingsTool } from '../src/tools/get-findings.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [
    {
      id: 'f1',
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Consider a named constant',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'Magic number.',
      confidence: 0.6,
      kind: 'finding',
    },
  ],
};

d('get_findings (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ctx: McpContext;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ctx = await buildMcpContext({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns all persisted reviews for a PR', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'get-findings-all',
    });
    await new AgentsService(ctx.container).create(ctx.workspaceId, {
      name: 'Finder',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
    });
    await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'Finder',
    });

    const result = await getFindingsTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
    });
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Finder');
    expect(result.text).toContain('Consider a named constant');
  });

  it('narrows correctly when agent_name is given', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'get-findings-narrow',
    });
    const agents = new AgentsService(ctx.container);
    await agents.create(ctx.workspaceId, { name: 'First', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' });
    await agents.create(ctx.workspaceId, { name: 'Second', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' });
    await runReviewTool(ctx.container, ctx.workspaceId, { repo: repo.fullName, pr_number: pr.number });

    const result = await getFindingsTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'First',
    });
    expect(result.text).toContain('First');
    expect(result.text).not.toContain('## Second');
  });

  it('reports no findings for a PR with no reviews yet', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'get-findings-none',
    });
    const result = await getFindingsTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
    });
    expect(result.text).toBe('No findings recorded for this PR yet.');
  });

  it('an unknown repo/PR returns the specific missing-step error', async () => {
    const result = await getFindingsTool(ctx.container, ctx.workspaceId, {
      repo: 'acme/missing-repo',
      pr_number: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('not added');
  });
});
