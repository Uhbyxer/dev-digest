/**
 * Pure dedupe logic for Convention detections. No DB, no I/O — unit-testable
 * in isolation (server-unit lane). A candidate is a duplicate of an existing
 * row (of ANY status — pending/accepted/rejected) when they share the exact
 * same evidence path AND their rule text is similar enough. Rejected rows
 * suppress resurfacing exactly like pending/accepted ones.
 */

export interface DedupeCandidate {
  rule: string;
  evidencePath: string;
}

export interface ExistingConventionForDedupe {
  rule: string;
  evidencePath: string | null;
}

export const DUPLICATE_RULE_SIMILARITY_THRESHOLD = 0.6;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeRuleText(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard similarity (0..1) over normalized word sets. */
export function ruleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeRuleText(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeRuleText(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isDuplicateOf(
  candidate: DedupeCandidate,
  existing: ExistingConventionForDedupe,
): boolean {
  if (existing.evidencePath !== candidate.evidencePath) return false;
  return ruleSimilarity(candidate.rule, existing.rule) >= DUPLICATE_RULE_SIMILARITY_THRESHOLD;
}

/**
 * Drop candidates matching an existing row of any status, AND collapse
 * near-duplicates within the new batch itself (keeping the first occurrence).
 */
export function dedupeNewCandidates(
  candidates: DedupeCandidate[],
  existing: ExistingConventionForDedupe[],
): DedupeCandidate[] {
  const survivors: DedupeCandidate[] = [];
  for (const candidate of candidates) {
    const dupeOfExisting = existing.some((e) => isDuplicateOf(candidate, e));
    if (dupeOfExisting) continue;
    const dupeWithinBatch = survivors.some((s) => isDuplicateOf(candidate, { rule: s.rule, evidencePath: s.evidencePath }));
    if (dupeWithinBatch) continue;
    survivors.push(candidate);
  }
  return survivors;
}
