import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { CONTEXT_DOC_MAX_BYTES } from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider, MockContextDocsStore, MockGitClient } from '../src/adapters/mocks.js';
import { RepoRepository } from '../src/modules/repos/repository.js';
import { ContextRepository } from '../src/modules/context/repository.js';
import type { FastifyInstance } from 'fastify';

/**
 * No-DB route tests for the Project Context module via app.inject(): auth and
 * contextDocs are mocks, repo/attachment repositories are stubbed on the prototype.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const REPO = '11111111-1111-4111-8111-111111111111';
const AGENT = '22222222-2222-4222-8222-222222222222';
const A = '.devdigest/specs/a.md';

let app: FastifyInstance;
let store: MockContextDocsStore;

beforeEach(async () => {
  store = new MockContextDocsStore({ [A]: 'old' });
  vi.spyOn(RepoRepository.prototype, 'getById').mockResolvedValue({
    id: REPO, owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/clone',
  } as never);
  app = await buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(),
      contextDocs: store,
      git: new MockGitClient(),
    },
  });
  // agents lookup for attachment routes
  vi.spyOn(app.container.agentsRepo, 'getById').mockResolvedValue({ id: AGENT, name: 'Sec' } as never);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

function multipart(filename: string, body: string, type = 'specs') {
  const b = '----b';
  const payload =
    `--${b}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${type}\r\n` +
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n${body}\r\n--${b}--\r\n`;
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

describe('context routes (no DB)', () => {
  it('AC-6: upload rejects a non-.md file with an explanatory 422 and writes nothing', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/upload`, ...multipart('notes.txt', 'hi') });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/\.md/);
    expect(Object.keys(store.docs)).toEqual([A]);
  });

  it('AC-6: upload accepts a .md file into the chosen folder (201)', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/upload`, ...multipart('n.md', '# hi', 'insights') });
    expect(res.statusCode).toBe(201);
    expect(res.json().path).toBe('.devdigest/insights/n.md');
    expect(store.docs['.devdigest/insights/n.md']).toBe('# hi');
  });

  it('AC-4: PUT with a stale hash returns conflict and leaves the file; matching hash saves', async () => {
    const stale = await app.inject({
      method: 'PUT', url: `/repos/${REPO}/context/document`,
      payload: { path: A, content: 'new', expected_hash: 'stale' },
    });
    expect(stale.statusCode).toBe(200);
    expect(stale.json().conflict).toBe(true);
    expect(store.docs[A]).toBe('old');

    const ok = await app.inject({
      method: 'PUT', url: `/repos/${REPO}/context/document`,
      payload: { path: A, content: 'newer', expected_hash: 'h3' },
    });
    expect(ok.json().conflict).toBeUndefined();
    expect(store.docs[A]).toBe('newer');
  });

  it('AC-7: DELETE removes the file and its attachments', async () => {
    const del = vi.spyOn(ContextRepository.prototype, 'deleteByPath').mockResolvedValue(3);
    const res = await app.inject({ method: 'DELETE', url: `/repos/${REPO}/context/document?path=${encodeURIComponent(A)}` });
    expect(res.json()).toEqual({ deleted: true });
    expect(del).toHaveBeenCalledWith(REPO, A);
    expect(A in store.docs).toBe(false);
  });

  it('AC-24: PUT agent context refuses a >100 KB document with 422', async () => {
    store.docs[A] = 'x'.repeat(CONTEXT_DOC_MAX_BYTES + 1);
    vi.spyOn(ContextRepository.prototype, 'listForOwner').mockResolvedValue([]);
    const set = vi.spyOn(ContextRepository.prototype, 'setForOwner');
    const res = await app.inject({
      method: 'PUT', url: `/agents/${AGENT}/context`, payload: { repo_id: REPO, paths: [A] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/100 KB/);
    expect(set).not.toHaveBeenCalled();
  });

  it('rejects path traversal on delete', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/repos/${REPO}/context/document?path=${encodeURIComponent('../x.md')}` });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('PUT document without expected_hash/expected_mtime is a 422 (zod refine)', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/repos/${REPO}/context/document`,
      payload: { path: A, content: 'x' },
    });
    expect(res.statusCode).toBe(422);
    expect(store.docs[A]).toBe('old');
  });

  it('rejects invalid attach bodies (non-uuid repo_id, >200 paths) and bad create/upload input with 422', async () => {
    const put = (payload: unknown) =>
      app.inject({ method: 'PUT', url: `/agents/${AGENT}/context`, payload: payload as never });
    expect((await put({ repo_id: 'nope', paths: [] })).statusCode).toBe(422);
    expect((await put({ repo_id: REPO, paths: Array.from({ length: 201 }, (_, i) => `.devdigest/specs/${i}.md`) })).statusCode).toBe(422);
    const create = (name: string) =>
      app.inject({ method: 'POST', url: `/repos/${REPO}/context/document`, payload: { type: 'specs', name } });
    expect((await create('')).statusCode).toBe(422);
    expect((await create('x'.repeat(256))).statusCode).toBe(422);
    const up = await app.inject({ method: 'POST', url: `/repos/${REPO}/context/upload`, ...multipart('n.md', 'hi', 'bogus') });
    expect(up.statusCode).toBe(422);
    const q = await app.inject({ method: 'GET', url: `/repos/${REPO}/context/document?path=` });
    expect(q.statusCode).toBe(422);
  });
});
