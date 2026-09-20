import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module.
 *   POST   /repos/:id/conventions/scan          → trigger detection, return
 *                                                  { inserted, conventions, last_scanned_at }
 *   GET    /repos/:id/conventions               → { conventions, last_scanned_at }
 *   PATCH  /conventions/:id                     → update rule and/or status
 *   POST   /repos/:id/conventions/create-skill  → merge accepted conventions into a new Skill
 */

const UpdateConventionBody = z
  .object({
    rule: z.string().min(1).optional(),
    status: ConventionStatus.optional(),
  })
  .refine((v) => v.rule !== undefined || v.status !== undefined, {
    message: 'At least one of rule or status must be provided',
  });

const CreateSkillFromAcceptedBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/scan', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.scan(workspaceId, req.params.id);
    return {
      inserted: result.inserted,
      conventions: result.conventions,
      last_scanned_at: result.lastScannedAt,
    };
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.list(workspaceId, req.params.id);
    return { conventions: result.conventions, last_scanned_at: result.lastScannedAt };
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const convention = await service.update(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );

  app.post(
    '/repos/:id/conventions/create-skill',
    { schema: { params: IdParams, body: CreateSkillFromAcceptedBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkillFromAccepted(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
