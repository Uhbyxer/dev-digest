import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput, CiPreviewInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';
import { refreshCiRuns } from './ingest.js';

/**
 * Export to CI (SPEC-2026-07-08-export-to-ci).
 *   POST /agents/:id/ci/preview        → files that will ship (runner redacted to a size)
 *   POST /agents/:id/ci/export         → open_pr | files (zip) — CiExport
 *   GET  /agents/:id/ci/installations  → per-repo installations (+ last run)
 *   GET  /agents/:id/ci/runs           → CI-sourced runs for the agent (?installation_id=)
 *   GET  /ci/readiness                 → local OpenRouter key readiness
 *   POST /ci/refresh                   → pull workflow-run artifacts (?agent_id=); GETs are read-only
 *   GET  /ci/runs                      → all CI-sourced runs
 * There is deliberately NO inbound ingest route (AC-27).
 * "Fail CI on" persists through the existing `PUT /agents/:id` (`ci_fail_on`).
 */
const RunsQuery = z.object({ installation_id: z.string().uuid().optional() });
const RefreshQuery = z.object({ agent_id: z.string().uuid().optional() });

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.get('/ci/readiness', async () => service.readiness());

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/export',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.export(workspaceId, req.params.id, req.body);
    },
  );

  app.get('/agents/:id/ci/installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listInstallations(workspaceId, req.params.id);
  });

  app.get(
    '/agents/:id/ci/runs',
    { schema: { params: IdParams, querystring: RunsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, {
        agentId: req.params.id,
        ...(req.query.installation_id ? { installationId: req.query.installation_id } : {}),
      });
    },
  );

  app.get('/ci/runs', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId);
  });

  app.post('/ci/refresh', { schema: { querystring: RefreshQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return refreshCiRuns(app.container, workspaceId, {
      ...(req.query.agent_id ? { agentId: req.query.agent_id } : {}),
    });
  });
}
