/**
 * blast module — `GET /pulls/:id/blast`.
 *
 * Thin: resolves tenancy, calls `getBlastRadiusForPr`, validates the result
 * against the shared `BlastRadius` Zod contract at the route boundary so
 * client and server can never silently drift apart.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { getBlastRadiusForPr } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req): Promise<BlastRadius> => {
    const { workspaceId } = await getContext(container, req);
    const result = await getBlastRadiusForPr(container, workspaceId, req.params.id);
    return BlastRadius.parse(result);
  });
}
