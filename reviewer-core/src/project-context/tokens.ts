/** Approximate token count: ceil(chars / 4). Pure, deterministic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Effective-set token total above which callers should warn (AC-23). */
export const PROJECT_CONTEXT_WARN_TOKENS = 8000;
