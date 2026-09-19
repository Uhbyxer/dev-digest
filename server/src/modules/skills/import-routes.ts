import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { parseMarkdownSkill, parseArchiveSkill, ImportParseError } from './import-parser.js';

/**
 * T6 — skill import: two-step preview + confirm flow, independent of the
 * (separate, not-yet-built) Plugin bundle mechanism. No skill is persisted on
 * upload alone (CONTEXT.md "Import (skill)").
 *
 *   POST /skills/import/preview  → parse an uploaded file, return the preview
 *                                   payload; nothing written to the DB.
 *   POST /skills/import/confirm  → persist the (possibly edited) preview
 *                                   payload as a new Skill row.
 */

/** Only these two `SkillSource` values may originate from the import flow. */
const ImportSource = z.enum(['imported_url', 'extracted']);

const ImportConfirmBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  source: ImportSource,
});

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — a single markdown file or small archive.

function isMarkdown(filename: string, mimetype: string): boolean {
  return /\.md$/i.test(filename) || mimetype === 'text/markdown';
}

function isZip(filename: string, mimetype: string): boolean {
  return (
    /\.zip$/i.test(filename) ||
    mimetype === 'application/zip' ||
    mimetype === 'application/x-zip-compressed'
  );
}

export default async function skillsImportRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const service = new SkillsService(app.container);

  app.post('/skills/import/preview', async (req) => {
    await getContext(app.container, req);
    const file = await req.file();
    if (!file) throw new ValidationError('No file uploaded');

    // Reject non-markdown, non-zip content types outright, before the parser
    // ever sees the bytes.
    if (!isMarkdown(file.filename, file.mimetype) && !isZip(file.filename, file.mimetype)) {
      throw new ValidationError('Only a markdown file or a zip archive is accepted', {
        filename: file.filename,
        mimetype: file.mimetype,
      });
    }

    const buffer = await file.toBuffer();
    try {
      return isZip(file.filename, file.mimetype)
        ? parseArchiveSkill(buffer)
        : parseMarkdownSkill(file.filename, buffer.toString('utf-8'));
    } catch (err) {
      if (err instanceof ImportParseError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  });

  app.post(
    '/skills/import/confirm',
    { schema: { body: ImportConfirmBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createFromImport(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
