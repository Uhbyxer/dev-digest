import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { OnboardingTourResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding Tour module (SPEC-02).
 *   GET  /repos/:id/onboarding  → { tour: OnboardingTour | null, stale }
 *   POST /repos/:id/onboarding  → generate / regenerate; replaces the stored Tour.
 *                                 409 `index_not_ready` while the index is not usable.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams } },
    async (req): Promise<OnboardingTourResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding',
    { schema: { params: IdParams } },
    async (req): Promise<OnboardingTourResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return { tour: await service.generate(workspaceId, req.params.id, req.log), stale: false };
    },
  );
}
