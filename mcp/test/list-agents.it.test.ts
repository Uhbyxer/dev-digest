import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '@devdigest/server/db/seed.js';
import { AgentsService } from '@devdigest/server/modules/agents/service.js';
import * as t from '@devdigest/server/db/schema.js';
import { loadConfig } from '@devdigest/server/platform/config.js';
import { buildMcpContext, type McpContext } from '../src/platform/context.js';
import { listAgentsTool } from '../src/tools/list-agents.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('list_agents (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ctx: McpContext;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ctx = await buildMcpContext({ config: config(), db: pg.handle.db });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns the configured agents for the workspace', async () => {
    const created = await new AgentsService(ctx.container).create(ctx.workspaceId, {
      name: 'MCP Test Agent',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'You review.',
    });

    const result = await listAgentsTool(ctx.container, ctx.workspaceId);
    expect(result.text).toContain('MCP Test Agent');
    expect(result.text).toContain('openai/gpt-4.1');
    expect(result.text).toContain(created.id);
  });

  it('reports no agents for a workspace with none configured', async () => {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `empty-ws-${Date.now()}` })
      .returning();
    const result = await listAgentsTool(ctx.container, ws!.id);
    expect(result.text).toBe('No agents configured in this workspace.');
  });
});
