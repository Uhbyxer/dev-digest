import { wrapUntrusted } from '../prompt.js';
import { estimateTokens, PROJECT_CONTEXT_WARN_TOKENS } from './tokens.js';

/** One document contributing to the effective set. */
export interface ProjectContextEntry {
  path: string;
  content: string;
  /** `agent` or `skill:<name>`. */
  origin: string;
}

export interface SerializedProjectContext {
  /** One string per document (path + content), fed to `PromptParts.specs`. */
  specs: string[];
  /**
   * The full block exactly as `assemblePrompt` renders it
   * (`## Project context` heading + untrusted-wrapped docs), for preview/trace.
   */
  text: string;
  /** Per-document tokens (of the document's spec string), same order as input. */
  entries: { path: string; origin: string; tokens: number }[];
  /** Token total of the whole block incl. heading and delimiters. */
  totalTokens: number;
  /** True when totalTokens > 8,000. */
  overThreshold: boolean;
}

export const PROJECT_CONTEXT_HEADING = '## Project context\n';

/**
 * Dedupe the effective set: agent's own docs first (in order), then each
 * skill's docs in skill order; first occurrence of a path wins (AC-26).
 * Callers pass entries already in that order; this drops later duplicates.
 */
export function dedupeEffectiveSet<T extends { path: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of entries) {
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    out.push(e);
  }
  return out;
}

/** Text of one document; the path lives here (wrapUntrusted label stays `spec-i`). */
function docText(e: ProjectContextEntry): string {
  return e.content.length === 0 ? `Path: ${e.path}\n(empty document)` : `Path: ${e.path}\n\n${e.content}`;
}

/**
 * Serialize an already-deduped, ordered set into the Project context block.
 * Empty set -> undefined (block omitted, AC-29). Byte-identical for identical
 * input (no timestamps, no ordering by hash/Map iteration).
 */
export function serializeProjectContext(
  entries: readonly ProjectContextEntry[],
): SerializedProjectContext | undefined {
  if (entries.length === 0) return undefined;
  const specs = entries.map(docText);
  const text = PROJECT_CONTEXT_HEADING + specs.map((s, i) => wrapUntrusted(`spec-${i}`, s)).join('\n\n');
  const totalTokens = estimateTokens(text);
  return {
    specs,
    text,
    entries: entries.map((e, i) => ({
      path: e.path,
      origin: e.origin,
      tokens: estimateTokens(specs[i]!),
    })),
    totalTokens,
    overThreshold: totalTokens > PROJECT_CONTEXT_WARN_TOKENS,
  };
}
