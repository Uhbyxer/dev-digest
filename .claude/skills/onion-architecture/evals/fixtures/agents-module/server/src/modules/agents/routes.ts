import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { agents } from '../../db/schema/agents.js';
import { AgentsRepository } from './repository.js';
import { AgentsService } from './service.js';
import { AgentIdParams, CreateAgentBody } from './schemas.js';

const WorkspaceParams = z.object({ workspaceId: z.string().uuid() });

export async function agentsRoutes(app: FastifyInstance) {
  const { container } = app;
  const service = new AgentsService(new AgentsRepository(container.db), container.notifier);

  app.get('/workspaces/:workspaceId/agents', async (req) => {
    const { workspaceId } = WorkspaceParams.parse(req.params);
    return service.list(workspaceId);
  });

  app.post('/workspaces/:workspaceId/agents', async (req, reply) => {
    WorkspaceParams.parse(req.params);
    const body = CreateAgentBody.parse(req.body);
    const created = await service.create(req, body);
    return reply.code(201).send(created);
  });

  app.delete('/agents/:agentId', async (req, reply) => {
    const { agentId } = AgentIdParams.parse(req.params);
    await container.db.delete(agents).where(eq(agents.id, agentId));
    return reply.code(204).send();
  });
}
