import type { ContextDocType, ContextDocument } from '@devdigest/shared';
import { estimateTokens } from '@devdigest/reviewer-core';
import type { ContextFileContent } from '../../adapters/context-docs/index.js';

/** Folder type of a repo-relative context path (`.devdigest/<type>/...`); falls back to `docs`. */
export function typeOfPath(path: string): ContextDocType {
  const t = path.split('/')[1];
  return t === 'specs' || t === 'docs' || t === 'insights' ? t : 'docs';
}

export function toDocument(f: ContextFileContent, usedBy: number): ContextDocument {
  return {
    path: f.path,
    type: f.type,
    size: f.size,
    tokens: estimateTokens(f.content),
    used_by: usedBy,
    mtime: f.mtime,
    hash: f.hash,
  };
}

/** Dangling attachment (file gone): flagged, zero size. */
export function missingDocument(path: string, usedBy: number): ContextDocument {
  return { path, type: typeOfPath(path), size: 0, tokens: 0, missing: true, used_by: usedBy };
}

export interface EffectiveRef {
  path: string;
  origin: string;
}
