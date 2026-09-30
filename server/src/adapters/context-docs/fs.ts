import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContextDocType } from '@devdigest/shared';
import { NotFoundError, AppError } from '../../platform/errors.js';
import type { ContextDocsStore, ContextFileMeta, ContextFileContent, ContextListing } from './index.js';
import { assertContextPath, CONTEXT_FOLDERS, CONTEXT_ROOT, normalizeDocName } from './paths.js';

/** Hard cap for reading a doc from disk (matches the upload/save cap). */
export const CONTEXT_FILE_MAX_BYTES = 1024 * 1024;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const forbidden = () => new AppError('forbidden_path', 'Symlinks are not allowed in context paths', 403);

/**
 * Walk `segments` down from `base` (a realpath'd directory), lstat-ing every
 * step. Returns the absolute path if it exists (`exists:true`) or the first
 * missing point (`exists:false`). Throws 403 if ANY step is a symlink, so no
 * path can ever resolve outside `base`.
 */
async function walkNoSymlinks(
  base: string,
  segments: string[],
): Promise<{ abs: string; exists: boolean; isFile: boolean; isDir: boolean }> {
  let cur = base;
  for (let i = 0; i < segments.length; i++) {
    cur = join(cur, segments[i]!);
    let st;
    try {
      st = await lstat(cur);
    } catch {
      return { abs: join(base, ...segments), exists: false, isFile: false, isDir: false };
    }
    if (st.isSymbolicLink()) throw forbidden();
    if (i < segments.length - 1 && !st.isDirectory()) throw forbidden();
    if (i === segments.length - 1) return { abs: cur, exists: true, isFile: st.isFile(), isDir: st.isDirectory() };
  }
  return { abs: base, exists: true, isFile: false, isDir: true };
}

/**
 * Filesystem Context Document store confined to
 * `<clone>/.devdigest/{specs,docs,insights}`. Containment root is
 * `realpath(clone)`; every segment from there down is lstat-checked and a
 * symlink ANYWHERE in the chain (`.devdigest`, the type folder, subdirs, the
 * file) is refused (read/write/create/remove) or skipped (list).
 */
export class FsContextDocsStore implements ContextDocsStore {
  private async cloneReal(clonePath: string): Promise<string | null> {
    try {
      return await realpath(clonePath);
    } catch {
      return null;
    }
  }

  async list(clonePath: string): Promise<ContextListing> {
    const base = await this.cloneReal(clonePath);
    if (!base) return { state: 'no_clone', files: [] };
    const files: ContextFileContent[] = [];
    let anyFolder = false;
    for (const type of CONTEXT_FOLDERS) {
      let dir;
      try {
        dir = await walkNoSymlinks(base, [CONTEXT_ROOT, type]);
      } catch {
        continue; // symlinked chain: ignore silently
      }
      if (!dir.exists || !dir.isDir) continue;
      anyFolder = true;
      await this.walk(dir.abs, `${CONTEXT_ROOT}/${type}`, type, files);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { state: anyFolder ? 'ok' : 'no_folders', files };
  }

  private async walk(dirAbs: string, dirRel: string, type: ContextDocType, out: ContextFileContent[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = join(dirAbs, e.name);
      const rel = `${dirRel}/${e.name}`;
      if (e.isDirectory()) {
        await this.walk(abs, rel, type, out);
      } else if (e.isFile() && /\.md$/i.test(e.name)) {
        try {
          out.push(await this.load(abs, rel, type));
        } catch {
          /* unreadable file: skip */
        }
      }
    }
  }

  private async load(abs: string, rel: string, type: ContextDocType): Promise<ContextFileContent> {
    // Size-guard BEFORE buffering: never load an arbitrarily large file.
    const st = await stat(abs);
    if (st.size > CONTEXT_FILE_MAX_BYTES) {
      throw new AppError('too_large', 'Document is too large (max 1 MB)', 413);
    }
    const content = await readFile(abs, 'utf8');
    return {
      path: rel,
      type,
      content,
      size: Buffer.byteLength(content, 'utf8'),
      mtime: st.mtime.toISOString(),
      hash: sha(content),
    };
  }

  /** Verify an existing regular file with no symlink anywhere in its chain. */
  private async resolveExisting(clonePath: string, input: string) {
    const { path, type } = assertContextPath(input);
    const base = await this.cloneReal(clonePath);
    if (!base) throw new NotFoundError('Document not found');
    const r = await walkNoSymlinks(base, path.split('/'));
    if (!r.exists) throw new NotFoundError('Document not found');
    if (!r.isFile) throw new AppError('forbidden_path', 'Not a regular file', 403);
    return { path, type, abs: r.abs };
  }

  async read(clonePath: string, input: string): Promise<ContextFileContent | null> {
    let r;
    try {
      r = await this.resolveExisting(clonePath, input);
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
    return this.load(r.abs, r.path, r.type);
  }

  async stat(clonePath: string, input: string): Promise<ContextFileMeta | null> {
    const f = await this.read(clonePath, input);
    if (!f) return null;
    const { content: _c, ...meta } = f;
    return meta;
  }

  async write(clonePath: string, input: string, content: string): Promise<ContextFileContent> {
    const r = await this.resolveExisting(clonePath, input);
    await writeFile(r.abs, content, 'utf8');
    return this.load(r.abs, r.path, r.type);
  }

  async create(clonePath: string, type: ContextDocType, name: string, content = ''): Promise<ContextFileContent> {
    const { path } = assertContextPath(`${CONTEXT_ROOT}/${type}/${normalizeDocName(name)}`);
    const base = await this.cloneReal(clonePath);
    if (!base) throw new NotFoundError('Repo has no local clone yet');
    // Refuse a symlinked .devdigest / type folder BEFORE creating anything.
    const dir = await walkNoSymlinks(base, [CONTEXT_ROOT, type]);
    if (!dir.exists) await mkdir(join(base, CONTEXT_ROOT, type), { recursive: true });
    const target = await walkNoSymlinks(base, path.split('/'));
    if (target.exists) throw new AppError('conflict', 'A document with that name already exists', 409);
    try {
      await writeFile(target.abs, content, { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new AppError('conflict', 'A document with that name already exists', 409);
      }
      throw err;
    }
    return this.load(target.abs, path, type);
  }

  async remove(clonePath: string, input: string): Promise<boolean> {
    let r;
    try {
      r = await this.resolveExisting(clonePath, input);
    } catch (err) {
      if (err instanceof NotFoundError) return false;
      throw err;
    }
    await rm(r.abs);
    return true;
  }
}
