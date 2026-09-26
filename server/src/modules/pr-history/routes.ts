/**
 * pr-history module — `GET /pulls/:id/pr-history`. A schema sibling of the
 * blast route (both compose into `PrBrief`), not folded into it — keeps the
 * `/pulls/:id/blast` contract from breaking when this route's shape changes.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { getPriorPrsForPr } from './service.js';

export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/pr-history',
    { schema: { params: IdParams } },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      const result = await getPriorPrsForPr(container, workspaceId, req.params.id);
      return PrHistory.parse(result);
    },
  );
}
