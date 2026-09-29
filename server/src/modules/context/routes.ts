import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import {
  ContextDocType,
  ContextDocumentCreateRequest,
  ContextDocumentSaveRequest,
  SetContextAttachmentsRequest,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { ContextService } from './service.js';
import { CONTEXT_UPLOAD_MAX_BYTES } from './constants.js';

/**
 * Project Context module.
 *   GET    /repos/:repoId/context/documents        -> { documents, state }
 *   POST   /repos/:repoId/context/refresh          -> { documents, state } (re-scan)
 *   GET    /repos/:repoId/context/document?path=   -> ContextDocumentContent
 *   PUT    /repos/:repoId/context/document         -> { document, conflict? }
 *   POST   /repos/:repoId/context/document         -> 201 ContextDocumentContent (create empty)
 *   POST   /repos/:repoId/context/upload           -> 201 ContextDocumentContent (multipart .md)
 *   DELETE /repos/:repoId/context/document?path=   -> { deleted }
 *   GET|PUT /agents/:id/context?repo_id=           -> ContextAttachmentsResponse
 *   GET    /agents/:id/context/effective?repo_id=  -> EffectiveContextPreview
 *   GET|PUT /skills/:id/context?repo_id=           -> ContextAttachmentsResponse
 *   GET    /skills/:id/context/preview?repo_id=    -> EffectiveContextPreview
 */
const RepoParams = z.object({ repoId: z.string().uuid() });
const PathQuery = z.object({ path: z.string().min(1) });
const RepoIdQuery = z.object({ repo_id: z.string().uuid() });
const UploadQuery = z.object({ type: ContextDocType.optional() });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  await app.register(multipart, { limits: { fileSize: CONTEXT_UPLOAD_MAX_BYTES, files: 1 } });
  const service = new ContextService(app.container);
  const ws = async (req: Parameters<typeof getContext>[1]) =>
    (await getContext(app.container, req)).workspaceId;

  app.get('/repos/:repoId/context/documents', { schema: { params: RepoParams } }, async (req) =>
    service.listDocuments(await ws(req), req.params.repoId),
  );

  app.post('/repos/:repoId/context/refresh', { schema: { params: RepoParams } }, async (req) =>
    service.listDocuments(await ws(req), req.params.repoId),
  );

  app.get(
    '/repos/:repoId/context/document',
    { schema: { params: RepoParams, querystring: PathQuery } },
    async (req) => service.readDocument(await ws(req), req.params.repoId, req.query.path),
  );

  app.put(
    '/repos/:repoId/context/document',
    { schema: { params: RepoParams, body: ContextDocumentSaveRequest } },
    async (req) => service.saveDocument(await ws(req), req.params.repoId, req.body),
  );

  app.post(
    '/repos/:repoId/context/document',
    { schema: { params: RepoParams, body: ContextDocumentCreateRequest } },
    async (req, reply) => {
      const doc = await service.createDocument(await ws(req), req.params.repoId, req.body.type, req.body.name);
      reply.status(201);
      return doc;
    },
  );

  // Multipart: file part + `type` (form field sent BEFORE the file, or `?type=`).
  app.post(
    '/repos/:repoId/context/upload',
    { schema: { params: RepoParams, querystring: UploadQuery } },
    async (req, reply) => {
      const workspaceId = await ws(req);
      const file = await req.file();
      if (!file) throw new ValidationError('No file uploaded');
      if (!/\.md$/i.test(file.filename)) throw new ValidationError('Only Markdown (.md) files are allowed');
      const typeField = file.fields.type;
      const field = typeField && !Array.isArray(typeField) && typeField.type === 'field' ? typeField.value : undefined;
      const type = ContextDocType.safeParse(req.query.type ?? field);
      if (!type.success) throw new ValidationError('type must be one of specs, docs, insights');
      const buffer = await file.toBuffer();
      if (file.file.truncated) throw new ValidationError('File is too large');
      const doc = await service.uploadDocument(
        workspaceId,
        req.params.repoId,
        type.data,
        file.filename,
        buffer.toString('utf8'),
      );
      reply.status(201);
      return doc;
    },
  );

  app.delete(
    '/repos/:repoId/context/document',
    { schema: { params: RepoParams, querystring: PathQuery } },
    async (req) => service.deleteDocument(await ws(req), req.params.repoId, req.query.path),
  );

  for (const [base, ownerType] of [
    ['agents', 'agent'],
    ['skills', 'skill'],
  ] as const) {
    app.get(
      `/${base}/:id/context`,
      { schema: { params: IdParams, querystring: RepoIdQuery } },
      async (req) =>
        service.getAttachments(await ws(req), req.query.repo_id, ownerType, req.params.id),
    );
    app.put(
      `/${base}/:id/context`,
      { schema: { params: IdParams, body: SetContextAttachmentsRequest } },
      async (req) =>
        service.setAttachments(await ws(req), req.body.repo_id, ownerType, req.params.id, req.body.paths),
    );
    app.get(
      `/${base}/:id/context/${ownerType === 'agent' ? 'effective' : 'preview'}`,
      { schema: { params: IdParams, querystring: RepoIdQuery } },
      async (req) =>
        service.previewEffective(await ws(req), req.query.repo_id, ownerType, req.params.id),
    );
  }
}
