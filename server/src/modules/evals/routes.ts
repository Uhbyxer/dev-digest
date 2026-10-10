import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalsService } from './service.js';

/**
 * Eval Pipeline (docs/specs/eval-pipeline.md).
 *   POST /findings/:id/eval-case     → Eval case from an accepted/dismissed finding
 *   GET  /agents/:id/eval-cases      → an agent's Eval cases
 *   POST /agents/:id/eval-runs       → run the agent over all its cases
 *   GET  /agents/:id/eval-runs       → an agent's run history (newest first)
 *   GET  /eval-runs                  → all runs in the workspace (Eval Dashboard)
 *   GET  /eval-runs/:id              → one run with per-case results
 */
export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.createFromFinding(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listCases(workspaceId, req.params.id);
  });

  app.post('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.run(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId, req.params.id);
  });

  app.get(
    '/eval-runs',
    { schema: { querystring: z.object({ agent_id: z.string().uuid().optional() }) } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.query.agent_id);
    },
  );

  app.get('/eval-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getRun(workspaceId, req.params.id);
  });
}
