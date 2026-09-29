import { describe, it, expect, vi, afterEach } from 'vitest';
import { CONTEXT_DOC_MAX_BYTES } from '@devdigest/shared';
import { ContextService, buildEffectiveRefs } from './service.js';
import { ContextRepository } from './repository.js';
import { MockGitClient, MockContextDocsStore } from '../../adapters/mocks.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsRepository } from '../skills/repository.js';
import { AppError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';

afterEach(() => vi.restoreAllMocks());

const repoRow = { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main' } as never;

function service(git: MockGitClient) {
  return new ContextService({ db: {}, git } as unknown as Container);
}

describe('buildEffectiveRefs', () => {
  it('orders agent first then skills, first occurrence wins (AC-26)', () => {
    const refs = buildEffectiveRefs({
      agentPaths: ['.devdigest/docs/a.md', '.devdigest/docs/b.md'],
      skills: [
        { id: 's1', name: 'sec', paths: ['.devdigest/docs/b.md', '.devdigest/docs/c.md'] },
        { id: 's2', name: 'perf', paths: ['.devdigest/docs/c.md', '.devdigest/docs/d.md'] },
      ],
    });
    expect(refs).toEqual([
      { path: '.devdigest/docs/a.md', origin: 'agent' },
      { path: '.devdigest/docs/b.md', origin: 'agent' },
      { path: '.devdigest/docs/c.md', origin: 'skill:sec' },
      { path: '.devdigest/docs/d.md', origin: 'skill:perf' },
    ]);
  });
});

describe('ContextService.resolveForRun', () => {
  const logs: string[] = [];
  const log = { info: (m: string) => void logs.push(m) };

  it('returns undefined when the effective set is empty (AC-29)', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({ agentPaths: [], skills: [] });
    expect(await service(new MockGitClient()).resolveForRun(repoRow, 'a1', log)).toBeUndefined();
  });

  it('reads from the base ref, skips missing/oversize with reasons, snapshots the rest', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({
      agentPaths: ['.devdigest/specs/ok.md', '.devdigest/specs/gone.md'],
      skills: [{ id: 's', name: 'sec', paths: ['.devdigest/docs/big.md', '.devdigest/docs/e.md'] }],
    });
    const git = new MockGitClient({
      refFiles: {
        '.devdigest/specs/ok.md': 'hello',
        '.devdigest/docs/big.md': 'x'.repeat(CONTEXT_DOC_MAX_BYTES + 1),
        '.devdigest/docs/e.md': '',
      },
    });
    const spy = vi.spyOn(git, 'readFileAtRef');
    const r = await service(git).resolveForRun(repoRow, 'a1', log);
    expect(spy).toHaveBeenCalledWith({ owner: 'acme', name: 'app' }, 'origin/main', '.devdigest/specs/ok.md', CONTEXT_DOC_MAX_BYTES);
    expect(r!.specs).toHaveLength(2);
    expect(r!.snapshot.entries.map((e) => [e.path, e.origin])).toEqual([
      ['.devdigest/specs/ok.md', 'agent'],
      ['.devdigest/docs/e.md', 'skill:sec'],
    ]);
    expect(r!.snapshot.skipped.map((s) => s.path)).toEqual([
      '.devdigest/specs/gone.md',
      '.devdigest/docs/big.md',
    ]);
    expect(r!.snapshot.text).toContain('## Project context');
    expect(logs.some((l) => l.includes('gone.md'))).toBe(true);
  });

  it('is best-effort: repository failure logs and returns undefined', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockRejectedValue(new Error('db down'));
    expect(await service(new MockGitClient()).resolveForRun(repoRow, 'a1', log)).toBeUndefined();
  });

  it('all docs missing -> no specs but skipped recorded', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({
      agentPaths: ['.devdigest/specs/gone.md'],
      skills: [],
    });
    const r = await service(new MockGitClient()).resolveForRun(repoRow, 'a1', log);
    expect(r).toEqual({
      specs: [],
      snapshot: { text: '', entries: [], skipped: [{ path: '.devdigest/specs/gone.md', reason: 'missing on origin/main' }] },
    });
  });
});

// ---------------------------------------------------------------- CRUD / attachments

const A = '.devdigest/specs/a.md';
const B = '.devdigest/docs/b.md';
const cloneRepo = { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/clone' } as never;

function crudService(docs: Record<string, string>, opts: { clone?: boolean } = {}) {
  const store = new MockContextDocsStore(docs);
  vi.spyOn(RepoRepository.prototype, 'getById').mockResolvedValue(
    (opts.clone === false ? { ...(cloneRepo as object), clonePath: null } : cloneRepo) as never,
  );
  const container = {
    db: {},
    git: new MockGitClient(),
    contextDocs: store,
    agentsRepo: { getById: async () => ({ id: 'ag', name: 'Sec' }) },
  } as unknown as Container;
  return { svc: new ContextService(container), store };
}

describe('ContextService documents', () => {
  it('AC-9/AC-19/AC-10: lists used_by, flags dangling attachments as missing, no_clone yields empty list', async () => {
    vi.spyOn(ContextRepository.prototype, 'listForRepo').mockResolvedValue([
      { path: A }, { path: '.devdigest/insights/gone.md' },
    ] as never);
    vi.spyOn(ContextRepository.prototype, 'usedByCounts').mockResolvedValue(new Map([[A, 2]]));
    const { svc } = crudService({ [A]: 'abcd' });
    const r = await svc.listDocuments('w1', 'r1');
    expect(r.documents.find((d) => d.path === A)).toMatchObject({ used_by: 2, tokens: 1, size: 4 });
    expect(r.documents.find((d) => d.path.endsWith('gone.md'))).toMatchObject({
      missing: true, type: 'insights', used_by: 0,
    });

    const nc = crudService({}, { clone: false });
    vi.spyOn(ContextRepository.prototype, 'listForRepo').mockResolvedValue([]);
    expect(await nc.svc.listDocuments('w1', 'r1')).toEqual({ documents: [], state: 'no_clone' });
  });

  it('AC-4: save persists and returns the updated token count; stale hash returns conflict without writing', async () => {
    const { svc, store } = crudService({ [A]: 'old' });
    const stale = await svc.saveDocument('w1', 'r1', { path: A, content: 'new', expected_hash: 'nope' });
    expect(stale.conflict).toBe(true);
    expect(store.docs[A]).toBe('old');

    const ok = await svc.saveDocument('w1', 'r1', { path: A, content: 'x'.repeat(40), expected_hash: 'h3' });
    expect(ok.conflict).toBeUndefined();
    expect(ok.document.tokens).toBe(10);
    expect(store.docs[A]).toBe('x'.repeat(40));
  });

  it('AC-7: delete removes the file and all attachments of it', async () => {
    const del = vi.spyOn(ContextRepository.prototype, 'deleteByPath').mockResolvedValue(2);
    const { svc, store } = crudService({ [A]: 'x' });
    expect(await svc.deleteDocument('w1', 'r1', A)).toEqual({ deleted: true });
    expect(del).toHaveBeenCalledWith('r1', A);
    expect(A in store.docs).toBe(false);
  });

  it('path traversal / non-md paths are refused on delete', async () => {
    const { svc } = crudService({});
    await expect(svc.deleteDocument('w1', 'r1', '../secret.md')).rejects.toThrow();
    await expect(svc.deleteDocument('w1', 'r1', '.devdigest/specs/a.txt')).rejects.toThrow();
  });

  it('upload keeps only the base name and rejects oversize content with 413', async () => {
    const { svc, store } = crudService({});
    const d = await svc.uploadDocument('w1', 'r1', 'docs', 'nested/dir/n.md', '# hi');
    expect(d.path).toBe('.devdigest/docs/n.md');
    expect(store.docs['.devdigest/docs/n.md']).toBe('# hi');
    await expect(svc.uploadDocument('w1', 'r1', 'docs', 'big.md', 'x'.repeat(1024 * 1024 + 1))).rejects.toMatchObject({
      statusCode: 413,
    });
  });
});

describe('ContextService attachments', () => {
  it('AC-24: refuses to attach a newly added document over 100 KB and does not persist', async () => {
    vi.spyOn(ContextRepository.prototype, 'listForOwner').mockResolvedValue([]);
    const set = vi.spyOn(ContextRepository.prototype, 'setForOwner');
    const { svc } = crudService({ [A]: 'x'.repeat(CONTEXT_DOC_MAX_BYTES + 1) });
    await expect(svc.setAttachments('w1', 'r1', 'agent', 'ag', [A])).rejects.toMatchObject({
      statusCode: 422,
      details: { path: A, max_bytes: CONTEXT_DOC_MAX_BYTES },
    });
    expect(set).not.toHaveBeenCalled();
  });

  it('AC-24 boundary: exactly 100 KB is allowed; an already-attached oversize/missing doc stays reorderable (AC-19)', async () => {
    vi.spyOn(ContextRepository.prototype, 'listForOwner').mockResolvedValue([{ path: B }] as never);
    const set = vi
      .spyOn(ContextRepository.prototype, 'setForOwner')
      .mockImplementation(async (repoId, ownerType, ownerId, paths) =>
        paths.map((path, order) => ({ repoId, ownerType, ownerId, path, order })) as never,
      );
    const { svc } = crudService({ [A]: 'x'.repeat(CONTEXT_DOC_MAX_BYTES) }); // B missing on disk
    const r = await svc.setAttachments('w1', 'r1', 'agent', 'ag', [A, B, A]);
    expect(set).toHaveBeenCalledWith('r1', 'agent', 'ag', [A, B]); // deduped, order kept
    expect(r.missing).toEqual([B]);
    expect(r.attachments.map((a) => a.order)).toEqual([0, 1]);
  });

  it('refuses to attach a document that does not exist', async () => {
    vi.spyOn(ContextRepository.prototype, 'listForOwner').mockResolvedValue([]);
    const { svc } = crudService({});
    await expect(svc.setAttachments('w1', 'r1', 'agent', 'ag', [A])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('AC-22/23: getAttachments totals tokens and flags the 8k threshold', async () => {
    vi.spyOn(ContextRepository.prototype, 'listForOwner').mockResolvedValue([
      { ownerType: 'agent', ownerId: 'ag', repoId: 'r1', path: A, order: 0 },
    ] as never);
    const { svc } = crudService({ [A]: 'x'.repeat(4 * 8000) });
    const r = await svc.getAttachments('w1', 'r1', 'agent', 'ag');
    expect(r.over_threshold).toBe(true);
    expect(r.tokens_total).toBeGreaterThan(8000);
  });

  it('AC-19/26: previewEffective skips missing files and dedupes across agent and skills', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({
      agentPaths: [A, '.devdigest/specs/gone.md'],
      skills: [{ id: 's', name: 'sec', paths: [A, B] }],
    });
    const { svc } = crudService({ [A]: 'aa', [B]: 'bb' });
    const r = await svc.previewEffective('w1', 'r1', 'agent', 'ag');
    expect(r.entries.map((e) => [e.path, e.origin])).toEqual([[A, 'agent'], [B, 'skill:sec']]);
    expect(r.skipped).toEqual([{ path: '.devdigest/specs/gone.md', reason: 'file missing' }]);
    expect(r.text).toContain('## Project context');
  });

  it('AC-29: previewEffective of an empty set has null text', async () => {
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({ agentPaths: [], skills: [] });
    const { svc } = crudService({});
    expect(await svc.previewEffective('w1', 'r1', 'agent', 'ag')).toMatchObject({ text: null, entries: [] });
  });

  it('skill owner lookup 404s for an unknown skill', async () => {
    vi.spyOn(SkillsRepository.prototype, 'getById').mockResolvedValue(undefined as never);
    const { svc } = crudService({});
    await expect(svc.getAttachments('w1', 'r1', 'skill', 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('ContextService regressions', () => {
  const clonedRepo = { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/c' } as never;
  const svc = (docs: MockContextDocsStore) => {
    vi.spyOn(RepoRepository.prototype, 'getById').mockResolvedValue(clonedRepo);
    return new ContextService({ db: {}, git: new MockGitClient(), contextDocs: docs } as unknown as Container);
  };

  it('deleteDocument detaches attachments even when remove() is forbidden, then surfaces the error', async () => {
    const docs = new MockContextDocsStore();
    vi.spyOn(docs, 'remove').mockRejectedValue(new AppError('forbidden_path', 'nope', 403));
    const detach = vi.spyOn(ContextRepository.prototype, 'deleteByPath').mockResolvedValue(2);
    await expect(svc(docs).deleteDocument('w', 'r1', '.devdigest/docs/a.md')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(detach).toHaveBeenCalledWith('r1', '.devdigest/docs/a.md');
  });

  it('saveDocument without expected_hash/expected_mtime is rejected (422) and does not write', async () => {
    const docs = new MockContextDocsStore({ '.devdigest/docs/a.md': 'x' });
    const write = vi.spyOn(docs, 'write');
    await expect(
      svc(docs).saveDocument('w', 'r1', { path: '.devdigest/docs/a.md', content: 'y' }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(write).not.toHaveBeenCalled();
  });

  it('previewEffective skips over-100KB docs with a reason, like the run does', async () => {
    const docs = new MockContextDocsStore({
      '.devdigest/docs/big.md': 'x'.repeat(CONTEXT_DOC_MAX_BYTES + 1),
      '.devdigest/docs/ok.md': 'fine',
    });
    vi.spyOn(ContextRepository.prototype, 'effectiveInputs').mockResolvedValue({
      agentPaths: ['.devdigest/docs/big.md', '.devdigest/docs/ok.md'],
      skills: [],
    });
    const s = svc(docs) as unknown as { owner: unknown };
    s.owner = async () => ({ name: 'A' });
    const p = await (s as unknown as ContextService).previewEffective('w', 'r1', 'agent', 'a1');
    expect(p.entries.map((e) => e.path)).toEqual(['.devdigest/docs/ok.md']);
    expect(p.skipped).toEqual([{ path: '.devdigest/docs/big.md', reason: 'over 100 KB limit' }]);
  });
});
