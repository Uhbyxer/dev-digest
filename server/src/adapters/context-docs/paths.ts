import { posix } from 'node:path';
import { ContextDocType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/** Repo-relative roots that may hold Context Documents. */
export const CONTEXT_ROOT = '.devdigest';
export const CONTEXT_FOLDERS: readonly ContextDocType[] = ['specs', 'docs', 'insights'];

/**
 * Normalise + validate a repo-relative Context Document path (pure, no fs).
 * Accepts only `.devdigest/{specs,docs,insights}/<...>.md` with no traversal,
 * no absolute/backslash/NUL/empty segments. Returns the POSIX-normalised path
 * and its folder type. Throws ValidationError otherwise.
 */
export function assertContextPath(input: string): { path: string; type: ContextDocType } {
  if (typeof input !== 'string' || input.length === 0 || input.includes('\0')) {
    throw new ValidationError('Invalid document path');
  }
  if (input.includes('\\') || input.startsWith('/')) {
    throw new ValidationError('Invalid document path');
  }
  const segments = input.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new ValidationError('Path traversal is not allowed');
  }
  const normalized = posix.normalize(input);
  const [root, folder, ...rest] = normalized.split('/');
  if (root !== CONTEXT_ROOT || !CONTEXT_FOLDERS.includes(folder as ContextDocType) || rest.length === 0) {
    throw new ValidationError(
      `Documents must live under ${CONTEXT_ROOT}/{${CONTEXT_FOLDERS.join(',')}}/`,
    );
  }
  if (!/\.md$/i.test(normalized)) {
    throw new ValidationError('Only Markdown (.md) documents are allowed');
  }
  return { path: normalized, type: folder as ContextDocType };
}

/** Validate a bare file name for create/upload (no folders), append `.md` if missing. */
export function normalizeDocName(name: string): string {
  const n = name.trim();
  if (!n || n.includes('/') || n.includes('\\') || n.includes('\0') || n === '.' || n === '..' || n.startsWith('.')) {
    throw new ValidationError('Invalid file name');
  }
  return /\.md$/i.test(n) ? n : `${n}.md`;
}
