import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR Brief module (ADR-0004).
 *   GET  /pulls/:id/brief  → { brief: PrBrief | null, stale }
 *   POST /pulls/:id/brief  → generate / regenerate (one model call); replaces the stored Brief.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req): Promise<PrBriefResponse> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/pulls/:id/brief', { schema: { params: IdParams } }, async (req): Promise<PrBriefResponse> => {
    const { workspaceId } = await getContext(app.container, req);
    return { brief: await service.generate(workspaceId, req.params.id, req.log), stale: false };
  });
}
