import type { ContextDocType } from '@devdigest/shared';

/** Metadata of one Context Document file in the clone's working tree. */
export interface ContextFileMeta {
  /** Repo-relative POSIX path, e.g. `.devdigest/specs/auth.md`. */
  path: string;
  type: ContextDocType;
  /** Size in bytes. */
  size: number;
  mtime: string;
  /** sha256 of the content (concurrent-edit guard). */
  hash: string;
}

export interface ContextFileContent extends ContextFileMeta {
  content: string;
}

export interface ContextListing {
  state: 'ok' | 'no_clone' | 'no_folders';
  files: ContextFileContent[];
}

/**
 * Working-tree Context Document store, confined to
 * `.devdigest/{specs,docs,insights}` of a clone (traversal / symlink /
 * non-`.md` refused). All methods take the clone's absolute path.
 */
export interface ContextDocsStore {
  list(clonePath: string): Promise<ContextListing>;
  /** Null when the file does not exist. */
  read(clonePath: string, path: string): Promise<ContextFileContent | null>;
  stat(clonePath: string, path: string): Promise<ContextFileMeta | null>;
  /** Overwrite an existing document. */
  write(clonePath: string, path: string, content: string): Promise<ContextFileContent>;
  /** Create a new document (409 if it exists). */
  create(clonePath: string, type: ContextDocType, name: string, content?: string): Promise<ContextFileContent>;
  /** False when the file did not exist. */
  remove(clonePath: string, path: string): Promise<boolean>;
}

export { FsContextDocsStore } from './fs.js';
export { assertContextPath, normalizeDocName, CONTEXT_FOLDERS, CONTEXT_ROOT } from './paths.js';
