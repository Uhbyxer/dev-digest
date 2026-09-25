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

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret introduced.',
  score: 60,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live secret is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

d('run_review (Testcontainers pg)', () => {
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

  it('a named agent runs just that agent and returns its findings', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-named',
    });
    await new AgentsService(ctx.container).create(ctx.workspaceId, {
      name: 'Security',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'You are a security reviewer.',
    });

    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'Security',
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Security');
    expect(result.text).toContain('Hardcoded secret key');
    expect(result.text).toContain('src/config.ts:11-11');
  });

  it('an omitted agent name runs every enabled agent', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-all',
    });
    const agents = new AgentsService(ctx.container);
    await agents.create(ctx.workspaceId, {
      name: 'Reviewer A',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
    });
    await agents.create(ctx.workspaceId, {
      name: 'Reviewer B',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
    });

    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('Reviewer A');
    expect(result.text).toContain('Reviewer B');
  });

  it('an unknown repo returns a repo-not-added error, not a generic 404', async () => {
    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: 'acme/does-not-exist',
      pr_number: 1,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('acme/does-not-exist');
    expect(result.text).toContain('not added');
  });

  it('an unimported PR number returns a pr-not-imported error naming the missing step', async () => {
    const { repo } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-unimported',
    });
    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: 999,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('999');
    expect(result.text).toContain('not been imported');
  });

  it('an unknown agent name returns a specific not-found error', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-unknown-agent',
    });
    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'Nonexistent Agent',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Nonexistent Agent');
    expect(result.text).toContain('list_agents');
  });

  it('a run that fails (no key configured for the agent provider) surfaces an error, not a silent empty result', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-failed',
    });
    // 'anthropic' has no override in this describe's context (only 'openai'
    // does) — container.llm('anthropic') throws ConfigError, so the executor
    // records this run as failed and persists no review.
    await new AgentsService(ctx.container).create(ctx.workspaceId, {
      name: 'Unconfigured',
      provider: 'anthropic',
      model: 'claude-x',
      system_prompt: 'p',
    });

    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'Unconfigured',
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Unconfigured');
    expect(result.text).not.toBe('No findings recorded for this PR yet.');
  });

  it('an ambiguous agent name (case-insensitive match on 2+ agents) returns a specific error', async () => {
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, ctx.workspaceId, {
      repoName: 'run-review-ambiguous',
    });
    const agents = new AgentsService(ctx.container);
    await agents.create(ctx.workspaceId, {
      name: 'dupe',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
    });
    await agents.create(ctx.workspaceId, {
      name: 'DUPE',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
    });

    const result = await runReviewTool(ctx.container, ctx.workspaceId, {
      repo: repo.fullName,
      pr_number: pr.number,
      agent_name: 'Dupe',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('more than one agent');
  });
});
