import type { Container } from '../../platform/container.js';
import {
  CONTEXT_DOC_MAX_BYTES,
  type ContextAttachmentsResponse,
  type ContextDocType,
  type ContextDocumentContent,
  type ContextDocumentSaveRequest,
  type ContextDocumentSaveResponse,
  type ContextDocumentsResponse,
  type ContextOwnerType,
  type EffectiveContextPreview,
  type ProjectContextSnapshot,
} from '@devdigest/shared';
import {
  dedupeEffectiveSet,
  estimateTokens,
  serializeProjectContext,
  type ProjectContextEntry,
} from '@devdigest/reviewer-core';
import { ContextRepository, type EffectiveInputs } from './repository.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { assertContextPath, type ContextFileContent } from '../../adapters/context-docs/index.js';
import { CONTEXT_UPLOAD_MAX_BYTES, BASE_REF_REMOTE } from './constants.js';
import { missingDocument, toDocument, type EffectiveRef } from './helpers.js';

/** Minimal logger surface (RunLogger-compatible) used by run-time resolution. */
export interface ContextLog {
  info: (msg: string) => void;
}

export interface RunProjectContext {
  /** One string per document, fed to `PromptParts.specs`. */
  specs: string[];
  snapshot: ProjectContextSnapshot;
}

/** Build the ordered, deduped effective set: agent own docs, then skills in order (AC-26). */
export function buildEffectiveRefs(inputs: EffectiveInputs): EffectiveRef[] {
  const refs: EffectiveRef[] = inputs.agentPaths.map((path) => ({ path, origin: 'agent' }));
  for (const s of inputs.skills) {
    for (const path of s.paths) refs.push({ path, origin: `skill:${s.name}` });
  }
  return dedupeEffectiveSet(refs);
}

/**
 * Project Context: working-tree document CRUD (via the ContextDocsStore
 * adapter), attachments per agent/skill, effective-set preview, and the
 * run-time snapshot read from the BASE branch.
 */
export class ContextService {
  private repo: ContextRepository;
  private reposRepo: RepoRepository;
  private skillsRepo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
    this.skillsRepo = new SkillsRepository(container.db);
  }

  private async getRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Clone path or a clear 404 for operations that need files on disk. */
  private clone(repo: RepoRow): string {
    if (!repo.clonePath) throw new NotFoundError('Repo has no local clone yet');
    return repo.clonePath;
  }

  // ---------------------------------------------------------------- documents

  async listDocuments(workspaceId: string, repoId: string): Promise<ContextDocumentsResponse> {
    const repo = await this.getRepo(workspaceId, repoId);
    const [attachments, usedBy] = await Promise.all([
      this.repo.listForRepo(repoId),
      this.repo.usedByCounts(workspaceId, repoId),
    ]);
    const listing = repo.clonePath
      ? await this.container.contextDocs.list(repo.clonePath)
      : { state: 'no_clone' as const, files: [] };

    const documents = listing.files.map((f) => toDocument(f, usedBy.get(f.path) ?? 0));
    const present = new Set(listing.files.map((f) => f.path));
    const dangling = [...new Set(attachments.map((a) => a.path))].filter((p) => !present.has(p));
    for (const p of dangling) documents.push(missingDocument(p, usedBy.get(p) ?? 0));
    return { documents, state: listing.state };
  }

  async readDocument(workspaceId: string, repoId: string, path: string): Promise<ContextDocumentContent> {
    const repo = await this.getRepo(workspaceId, repoId);
    const f = await this.container.contextDocs.read(this.clone(repo), path);
    if (!f) throw new NotFoundError('Document not found');
    return toContent(f);
  }

  async saveDocument(
    workspaceId: string,
    repoId: string,
    req: ContextDocumentSaveRequest,
  ): Promise<ContextDocumentSaveResponse> {
    const repo = await this.getRepo(workspaceId, repoId);
    const clone = this.clone(repo);
    assertSize(req.content);
    if (req.expected_hash === undefined && req.expected_mtime === undefined) {
      throw new ValidationError('expected_hash or expected_mtime is required to save (concurrent-edit guard)');
    }
    const current = await this.container.contextDocs.read(clone, req.path);
    if (!current) throw new NotFoundError('Document not found');
    const stale =
      (req.expected_hash !== undefined && req.expected_hash !== current.hash) ||
      (req.expected_hash === undefined && req.expected_mtime !== current.mtime);
    if (stale) return { document: toContent(current), conflict: true };
    const saved = await this.container.contextDocs.write(clone, req.path, req.content);
    return { document: toContent(saved) };
  }

  async createDocument(
    workspaceId: string,
    repoId: string,
    type: ContextDocType,
    name: string,
  ): Promise<ContextDocumentContent> {
    const repo = await this.getRepo(workspaceId, repoId);
    return toContent(await this.container.contextDocs.create(this.clone(repo), type, name));
  }

  async uploadDocument(
    workspaceId: string,
    repoId: string,
    type: ContextDocType,
    filename: string,
    content: string,
  ): Promise<ContextDocumentContent> {
    const repo = await this.getRepo(workspaceId, repoId);
    assertSize(content);
    const base = filename.split(/[\\/]/).pop() ?? filename;
    return toContent(await this.container.contextDocs.create(this.clone(repo), type, base, content));
  }

  /** Delete the file AND every attachment of it (AC-7). Idempotent on a missing file. */
  async deleteDocument(workspaceId: string, repoId: string, path: string): Promise<{ deleted: boolean }> {
    const repo = await this.getRepo(workspaceId, repoId);
    const { path: safe } = assertContextPath(path);
    // Detach attachments even when the file can't be removed (e.g. a forbidden
    // symlink/non-file): otherwise they would dangle forever. The removal error
    // is re-thrown AFTER detaching so the caller still sees why the file stayed.
    let removed = false;
    let removeErr: unknown;
    if (repo.clonePath) {
      try {
        removed = await this.container.contextDocs.remove(repo.clonePath, safe);
      } catch (err) {
        removeErr = err;
      }
    }
    const detached = await this.repo.deleteByPath(repoId, safe);
    if (removeErr && !removed) {
      if (removeErr instanceof AppError) {
        throw new AppError(removeErr.code, `${removeErr.message} (attachments were detached)`, removeErr.statusCode, {
          detached,
        });
      }
      throw removeErr;
    }
    return { deleted: removed || detached > 0 };
  }

  // -------------------------------------------------------------- attachments

  private async owner(
    workspaceId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
  ): Promise<{ name: string }> {
    if (ownerType === 'agent') {
      const a = await this.container.agentsRepo.getById(workspaceId, ownerId);
      if (!a) throw new NotFoundError('Agent not found');
      return { name: a.name };
    }
    const s = await this.skillsRepo.getById(workspaceId, ownerId);
    if (!s) throw new NotFoundError('Skill not found');
    return { name: s.name };
  }

  private async summarize(
    repo: RepoRow,
    origin: string,
    attachments: { owner_type: ContextOwnerType; owner_id: string; repo_id: string; path: string; order: number }[],
  ): Promise<ContextAttachmentsResponse> {
    const files = await this.loadFiles(repo, attachments.map((a) => a.path));
    const { entries, skipped } = classifyDocs(
      attachments.map((a) => ({ path: a.path, origin })),
      (p) => files.get(p)?.content ?? null,
      'file missing',
    );
    const missing = skipped.filter((k) => k.missing).map((k) => k.path);
    const ser = serializeProjectContext(entries);
    return {
      attachments,
      missing,
      tokens_total: ser?.totalTokens ?? 0,
      over_threshold: ser?.overThreshold ?? false,
    };
  }

  async getAttachments(
    workspaceId: string,
    repoId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
  ): Promise<ContextAttachmentsResponse> {
    const repo = await this.getRepo(workspaceId, repoId);
    const o = await this.owner(workspaceId, ownerType, ownerId);
    const rows = await this.repo.listForOwner(repoId, ownerType, ownerId);
    return this.summarize(repo, originOf(ownerType, o.name), rows.map(toAttachment));
  }

  async setAttachments(
    workspaceId: string,
    repoId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
    rawPaths: string[],
  ): Promise<ContextAttachmentsResponse> {
    const repo = await this.getRepo(workspaceId, repoId);
    const o = await this.owner(workspaceId, ownerType, ownerId);
    const paths = [...new Set(rawPaths.map((p) => assertContextPath(p).path))];

    // Only NEWLY added paths are validated: an already-attached doc that later
    // grew or vanished must stay reorderable/removable (AC-19).
    const existing = new Set((await this.repo.listForOwner(repoId, ownerType, ownerId)).map((r) => r.path));
    const added = paths.filter((p) => !existing.has(p));
    const files = await this.loadFiles(repo, added);
    for (const p of added) {
      const f = files.get(p);
      if (!f) throw new ValidationError(`Document not found: ${p}`, { path: p });
      if (f.size > CONTEXT_DOC_MAX_BYTES) {
        throw new ValidationError(
          `${p} is ${Math.ceil(f.size / 1024)} KB, over the ${CONTEXT_DOC_MAX_BYTES / 1024} KB limit, and can't be attached`,
          { path: p, size: f.size, max_bytes: CONTEXT_DOC_MAX_BYTES },
        );
      }
    }
    const rows = await this.repo.setForOwner(repoId, ownerType, ownerId, paths);
    return this.summarize(repo, originOf(ownerType, o.name), rows.map(toAttachment));
  }

  /** Effective-set preview from the WORKING TREE (what the editor currently sees). */
  async previewEffective(
    workspaceId: string,
    repoId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
  ): Promise<EffectiveContextPreview> {
    const repo = await this.getRepo(workspaceId, repoId);
    const o = await this.owner(workspaceId, ownerType, ownerId);
    const refs =
      ownerType === 'agent'
        ? buildEffectiveRefs(await this.repo.effectiveInputs(repoId, ownerId))
        : (await this.repo.listForOwner(repoId, 'skill', ownerId)).map((r) => ({
            path: r.path,
            origin: `skill:${o.name}`,
          }));
    const files = await this.loadFiles(repo, refs.map((r) => r.path));
    const { entries, skipped: sk } = classifyDocs(refs, (p) => files.get(p)?.content ?? null, 'file missing');
    const skipped = sk.map(({ path, reason }) => ({ path, reason }));
    const ser = serializeProjectContext(entries);
    return {
      entries: ser?.entries ?? [],
      skipped,
      text: ser?.text ?? null,
      tokens_total: ser?.totalTokens ?? 0,
      over_threshold: ser?.overThreshold ?? false,
    };
  }

  private async loadFiles(repo: RepoRow, paths: string[]): Promise<Map<string, ContextFileContent>> {
    const out = new Map<string, ContextFileContent>();
    if (!repo.clonePath || paths.length === 0) return out;
    for (const p of paths) {
      try {
        const f = await this.container.contextDocs.read(repo.clonePath, p);
        if (f) out.set(p, f);
      } catch {
        /* forbidden / unreadable => treated as missing */
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ run time

  /**
   * Resolve the run's Project context: the agent's effective set, each doc read
   * ONCE from the base branch (`git show origin/<default>:<path>`) so the run
   * sees a stable snapshot. Missing/oversize docs are skipped with a log line.
   * Returns undefined when nothing to inject and nothing skipped. Never throws.
   */
  async resolveForRun(
    repo: RepoRow,
    agentId: string,
    log: ContextLog,
  ): Promise<RunProjectContext | undefined> {
    try {
      const refs = buildEffectiveRefs(await this.repo.effectiveInputs(repo.id, agentId));
      if (refs.length === 0) return undefined;

      const ref = `${BASE_REF_REMOTE}/${repo.defaultBranch}`;
      const gitRepo = { owner: repo.owner, name: repo.name };
      const contents = new Map<string, string | null>();
      for (const r of refs) {
        let content: string | null = null;
        try {
          assertContextPath(r.path);
          content = await this.container.git.readFileAtRef(gitRepo, ref, r.path, CONTEXT_DOC_MAX_BYTES);
        } catch {
          content = null;
        }
        contents.set(r.path, content);
      }
      const { entries, skipped: sk } = classifyDocs(refs, (p) => contents.get(p) ?? null, `missing on ${ref}`);
      const skipped = sk.map(({ path, reason }) => ({ path, reason }));
      for (const k of skipped) log.info(`project context: skipped ${k.path} — ${k.reason}`);
      const ser = serializeProjectContext(entries);
      if (!ser) return skipped.length > 0 ? { specs: [], snapshot: { text: '', entries: [], skipped } } : undefined;
      log.info(
        `project context: ${ser.entries.length} document(s), ~${ser.totalTokens} token(s)${ser.overThreshold ? ' (over 8k warn threshold)' : ''}`,
      );
      return { specs: ser.specs, snapshot: { text: ser.text, entries: ser.entries, skipped } };
    } catch (err) {
      log.info(`project context: failed to resolve — ${(err as Error).message}`);
      return undefined;
    }
  }
}

// -------------------------------------------------------------------- helpers

/**
 * Shared by previews and run-time: turn ordered refs + their content into
 * injectable entries, skipping absent docs and docs over the 100 KB limit so a
 * preview never shows a doc the run would drop.
 */
function classifyDocs(
  refs: EffectiveRef[],
  contentOf: (path: string) => string | null,
  missingReason: string,
): { entries: ProjectContextEntry[]; skipped: { path: string; reason: string; missing: boolean }[] } {
  const entries: ProjectContextEntry[] = [];
  const skipped: { path: string; reason: string; missing: boolean }[] = [];
  for (const r of refs) {
    const content = contentOf(r.path);
    if (content === null) {
      skipped.push({ path: r.path, reason: missingReason, missing: true });
    } else if (Buffer.byteLength(content, 'utf8') > CONTEXT_DOC_MAX_BYTES) {
      skipped.push({ path: r.path, reason: `over ${CONTEXT_DOC_MAX_BYTES / 1024} KB limit`, missing: false });
    } else {
      entries.push({ path: r.path, content, origin: r.origin });
    }
  }
  return { entries, skipped };
}

function originOf(ownerType: ContextOwnerType, name: string): string {
  return ownerType === 'agent' ? 'agent' : `skill:${name}`;
}

function toAttachment(r: {
  ownerType: ContextOwnerType;
  ownerId: string;
  repoId: string;
  path: string;
  order: number;
}) {
  return { owner_type: r.ownerType, owner_id: r.ownerId, repo_id: r.repoId, path: r.path, order: r.order };
}

function toContent(f: ContextFileContent): ContextDocumentContent {
  return {
    path: f.path,
    type: f.type,
    content: f.content,
    size: f.size,
    tokens: estimateTokens(f.content),
    mtime: f.mtime,
    hash: f.hash,
  };
}

function assertSize(content: string): void {
  if (Buffer.byteLength(content, 'utf8') > CONTEXT_UPLOAD_MAX_BYTES) {
    throw new AppError('payload_too_large', 'Document is too large', 413);
  }
}
