import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertContextPath, normalizeDocName, FsContextDocsStore } from './index.js';
import { CONTEXT_FILE_MAX_BYTES } from './fs.js';

describe('assertContextPath', () => {
  it('accepts .md files under the three folders', () => {
    expect(assertContextPath('.devdigest/specs/auth.md')).toEqual({
      path: '.devdigest/specs/auth.md',
      type: 'specs',
    });
    expect(assertContextPath('.devdigest/insights/sub/x.MD').type).toBe('insights');
  });

  it.each([
    '../etc/passwd',
    '.devdigest/specs/../../secret.md',
    '/abs/.devdigest/specs/a.md',
    '.devdigest\\specs\\a.md',
    '.devdigest/other/a.md',
    '.devdigest/specs/a.txt',
    '.devdigest/specs',
    '.devdigest/specs//a.md',
    'README.md',
    '',
  ])('rejects %j', (p) => {
    expect(() => assertContextPath(p)).toThrow();
  });
});

describe('normalizeDocName', () => {
  it('appends .md and rejects folders / dotfiles', () => {
    expect(normalizeDocName('auth')).toBe('auth.md');
    expect(normalizeDocName('auth.md')).toBe('auth.md');
    expect(() => normalizeDocName('a/b')).toThrow();
    expect(() => normalizeDocName('..')).toThrow();
    expect(() => normalizeDocName('.hidden')).toThrow();
    expect(() => normalizeDocName('  ')).toThrow();
  });
});

describe('FsContextDocsStore', () => {
  let clone: string;
  const store = new FsContextDocsStore();
  beforeEach(async () => {
    clone = await mkdtemp(join(tmpdir(), 'ctxdocs-'));
  });
  afterEach(async () => {
    await rm(clone, { recursive: true, force: true });
  });

  it('reports no_clone / no_folders states', async () => {
    expect((await store.list(join(clone, 'nope'))).state).toBe('no_clone');
    expect(await store.list(clone)).toEqual({ state: 'no_folders', files: [] });
  });

  it('lists only .md files, skips symlinks, sorted, with hash and size', async () => {
    await mkdir(join(clone, '.devdigest/specs'), { recursive: true });
    await mkdir(join(clone, '.devdigest/docs'), { recursive: true });
    await writeFile(join(clone, '.devdigest/specs/b.md'), 'bbbb');
    await writeFile(join(clone, '.devdigest/specs/a.md'), '');
    await writeFile(join(clone, '.devdigest/docs/n.txt'), 'x');
    const outside = join(clone, 'outside.md');
    await writeFile(outside, 'secret');
    await symlink(outside, join(clone, '.devdigest/docs/link.md'));
    const l = await store.list(clone);
    expect(l.state).toBe('ok');
    expect(l.files.map((f) => f.path)).toEqual(['.devdigest/specs/a.md', '.devdigest/specs/b.md']);
    expect(l.files[1]).toMatchObject({ type: 'specs', size: 4 });
    expect(l.files[1]!.hash).toHaveLength(64);
  });

  it('refuses to read a symlink escaping the folder and traversal', async () => {
    await mkdir(join(clone, '.devdigest/docs'), { recursive: true });
    await writeFile(join(clone, 'outside.md'), 'secret');
    await symlink(join(clone, 'outside.md'), join(clone, '.devdigest/docs/link.md'));
    await expect(store.read(clone, '.devdigest/docs/link.md')).rejects.toThrow(/symlink/i);
    await expect(store.read(clone, '.devdigest/docs/../../outside.md')).rejects.toThrow();
  });

  it('refuses to read a file larger than the cap without loading it (413); list skips it', async () => {
    await mkdir(join(clone, '.devdigest/docs'), { recursive: true });
    await writeFile(join(clone, '.devdigest/docs/big.md'), 'x'.repeat(CONTEXT_FILE_MAX_BYTES + 1));
    await writeFile(join(clone, '.devdigest/docs/ok.md'), 'ok');
    await expect(store.read(clone, '.devdigest/docs/big.md')).rejects.toMatchObject({ statusCode: 413 });
    expect((await store.list(clone)).files.map((f) => f.path)).toEqual(['.devdigest/docs/ok.md']);
  });

  it('refuses a symlinked folder root on create', async () => {
    await mkdir(join(clone, '.devdigest'), { recursive: true });
    await mkdir(join(clone, 'elsewhere'));
    await symlink(join(clone, 'elsewhere'), join(clone, '.devdigest/specs'));
    await expect(store.create(clone, 'specs', 'x')).rejects.toThrow(/symlink/i);
  });

  it('create / read / write / remove round trip; create conflicts', async () => {
    const c = await store.create(clone, 'specs', 'auth');
    expect(c.path).toBe('.devdigest/specs/auth.md');
    expect(c.size).toBe(0);
    await expect(store.create(clone, 'specs', 'auth')).rejects.toMatchObject({ statusCode: 409 });
    const w = await store.write(clone, c.path, 'hello');
    expect(w.hash).not.toBe(c.hash);
    expect(await readFile(join(clone, c.path), 'utf8')).toBe('hello');
    expect((await store.read(clone, c.path))?.content).toBe('hello');
    expect(await store.remove(clone, c.path)).toBe(true);
    expect(await store.read(clone, c.path)).toBeNull();
    expect(await store.remove(clone, c.path)).toBe(false);
  });

  describe('symlinked chain (regression: escape via .devdigest or type folder)', () => {
    let outside: string;
    beforeEach(async () => {
      outside = await mkdtemp(join(tmpdir(), 'ctxout-'));
      await writeFile(join(outside, 'secret.md'), 'top secret');
    });
    afterEach(async () => {
      await rm(outside, { recursive: true, force: true });
    });

    it('symlinked .devdigest: list empty, read/write/create/remove refused, outside untouched', async () => {
      await mkdir(join(outside, 'specs'));
      await writeFile(join(outside, 'specs/secret.md'), 'top secret');
      await symlink(outside, join(clone, '.devdigest'));
      expect((await store.list(clone)).files).toEqual([]);
      await expect(store.read(clone, '.devdigest/specs/secret.md')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.write(clone, '.devdigest/specs/secret.md', 'pwn')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.remove(clone, '.devdigest/specs/secret.md')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.create(clone, 'specs', 'new')).rejects.toMatchObject({ statusCode: 403 });
      expect(await readFile(join(outside, 'specs/secret.md'), 'utf8')).toBe('top secret');
    });

    it('symlinked specs folder: same guarantees', async () => {
      await mkdir(join(clone, '.devdigest'));
      await symlink(outside, join(clone, '.devdigest/specs'));
      expect((await store.list(clone)).files).toEqual([]);
      await expect(store.read(clone, '.devdigest/specs/secret.md')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.write(clone, '.devdigest/specs/secret.md', 'pwn')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.remove(clone, '.devdigest/specs/secret.md')).rejects.toMatchObject({ statusCode: 403 });
      await expect(store.create(clone, 'specs', 'new')).rejects.toMatchObject({ statusCode: 403 });
      expect(await readFile(join(outside, 'secret.md'), 'utf8')).toBe('top secret');
    });
  });
});
