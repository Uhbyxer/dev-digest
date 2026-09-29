import { z } from 'zod';

/**
 * Project Context: Markdown "Context Documents" discovered under
 * `.devdigest/{specs,docs,insights}/` of a repo clone, attached (ordered) to
 * agents and skills, and injected into the run prompt as an untrusted block.
 */

export const ContextDocType = z.enum(['specs', 'docs', 'insights']);
export type ContextDocType = z.infer<typeof ContextDocType>;

export const ContextOwnerType = z.enum(['agent', 'skill']);
export type ContextOwnerType = z.infer<typeof ContextOwnerType>;

/** Per-document attach size limit (AC-24). */
export const CONTEXT_DOC_MAX_BYTES = 100 * 1024;
/** Effective-set token total above which the UI warns (AC-23). */
export const CONTEXT_TOKEN_WARN_THRESHOLD = 8000;

export const ContextDocument = z.object({
  /** Repo-relative POSIX path, e.g. `.devdigest/specs/auth.md`. */
  path: z.string(),
  type: ContextDocType,
  size: z.number().int(),
  /** Approximate tokens, ceil(chars / 4). */
  tokens: z.number().int(),
  /** Attached somewhere but the file no longer exists. */
  missing: z.boolean().optional(),
  /** Distinct enabled agents using it, directly or via skills. */
  used_by: z.number().int().optional(),
  mtime: z.string().optional(),
  hash: z.string().optional(),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

export const ContextAttachment = z.object({
  owner_type: ContextOwnerType,
  owner_id: z.string(),
  repo_id: z.string(),
  path: z.string(),
  order: z.number().int(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

// ---- requests / responses ---------------------------------------------------

export const ContextDocumentsResponse = z.object({
  documents: z.array(ContextDocument),
  /** Set when the clone/folders are absent so the UI can show an empty state. */
  state: z.enum(['ok', 'no_clone', 'no_folders']).optional(),
});
export type ContextDocumentsResponse = z.infer<typeof ContextDocumentsResponse>;

export const ContextDocumentContent = z.object({
  path: z.string(),
  type: ContextDocType,
  content: z.string(),
  size: z.number().int(),
  tokens: z.number().int(),
  mtime: z.string(),
  hash: z.string(),
});
export type ContextDocumentContent = z.infer<typeof ContextDocumentContent>;

export const ContextDocumentSaveRequest = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    /** Concurrent-edit guard: the mtime/hash the editor loaded. */
    expected_mtime: z.string().optional(),
    expected_hash: z.string().optional(),
  })
  .refine((r) => r.expected_hash !== undefined || r.expected_mtime !== undefined, {
    message: 'expected_hash or expected_mtime is required to save (concurrent-edit guard)',
    path: ['expected_hash'],
  });
export type ContextDocumentSaveRequest = z.infer<typeof ContextDocumentSaveRequest>;

export const ContextDocumentSaveResponse = z.object({
  document: ContextDocumentContent,
  /** True when the file changed on disk since it was loaded (not saved). */
  conflict: z.boolean().optional(),
});
export type ContextDocumentSaveResponse = z.infer<typeof ContextDocumentSaveResponse>;

export const ContextDocumentCreateRequest = z.object({
  type: ContextDocType,
  /** File name (no folders), `.md` appended if missing. */
  name: z.string().min(1).max(255),
});
export type ContextDocumentCreateRequest = z.infer<typeof ContextDocumentCreateRequest>;

export const ContextDocumentDeleteRequest = z.object({ path: z.string() });
export type ContextDocumentDeleteRequest = z.infer<typeof ContextDocumentDeleteRequest>;

/** Multipart upload metadata (file itself is the multipart part). */
export const ContextUploadRequest = z.object({ type: ContextDocType });
export type ContextUploadRequest = z.infer<typeof ContextUploadRequest>;

/** PUT /agents/:id/context and /skills/:id/context: ordered paths. */
export const SetContextAttachmentsRequest = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string()).max(200),
});
export type SetContextAttachmentsRequest = z.infer<typeof SetContextAttachmentsRequest>;

export const ContextAttachmentsResponse = z.object({
  attachments: z.array(ContextAttachment),
  /** Attached paths whose files are missing (AC-19). */
  missing: z.array(z.string()),
  tokens_total: z.number().int(),
  over_threshold: z.boolean(),
});
export type ContextAttachmentsResponse = z.infer<typeof ContextAttachmentsResponse>;

export const EffectiveContextEntry = z.object({
  path: z.string(),
  /** `agent` or `skill:<name>`. */
  origin: z.string(),
  tokens: z.number().int(),
});
export type EffectiveContextEntry = z.infer<typeof EffectiveContextEntry>;

export const EffectiveContextSkipped = z.object({
  path: z.string(),
  reason: z.string(),
});
export type EffectiveContextSkipped = z.infer<typeof EffectiveContextSkipped>;

/** Effective-set preview: deduped set + serialized block + token total. */
export const EffectiveContextPreview = z.object({
  entries: z.array(EffectiveContextEntry),
  skipped: z.array(EffectiveContextSkipped),
  /** Serialized `## Project context` block; null when the set is empty. */
  text: z.string().nullable(),
  tokens_total: z.number().int(),
  over_threshold: z.boolean(),
});
export type EffectiveContextPreview = z.infer<typeof EffectiveContextPreview>;
