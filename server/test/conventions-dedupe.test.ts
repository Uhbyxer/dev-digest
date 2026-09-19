import { describe, it, expect } from 'vitest';
import {
  normalizeRuleText,
  ruleSimilarity,
  isDuplicateOf,
  dedupeNewCandidates,
  DUPLICATE_RULE_SIMILARITY_THRESHOLD,
  type DedupeCandidate,
  type ExistingConventionForDedupe,
} from '../src/modules/conventions/dedupe.js';

describe('conventions/dedupe', () => {
  it('normalizeRuleText lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeRuleText('Always use async/await, never `.then()` chains!')).toBe(
      'always use async await never then chains',
    );
    expect(normalizeRuleText('  Multiple   spaces  ')).toBe('multiple spaces');
  });

  it('ruleSimilarity is 1 for identical text and 0 for disjoint text', () => {
    expect(ruleSimilarity('Always use async/await', 'Always use async/await')).toBe(1);
    expect(ruleSimilarity('foo bar', 'baz qux')).toBe(0);
  });

  it('an exact-duplicate candidate (same path, same rule) is dropped', () => {
    const candidate: DedupeCandidate = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    const existing: ExistingConventionForDedupe = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    expect(isDuplicateOf(candidate, existing)).toBe(true);
    expect(dedupeNewCandidates([candidate], [existing])).toEqual([]);
  });

  it('same rule text at a DIFFERENT evidence path is NOT dropped', () => {
    const candidate: DedupeCandidate = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/b.ts',
    };
    const existing: ExistingConventionForDedupe = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    expect(isDuplicateOf(candidate, existing)).toBe(false);
    expect(dedupeNewCandidates([candidate], [existing])).toEqual([candidate]);
  });

  it('a similar-but-reworded rule at the SAME path is dropped', () => {
    const candidate: DedupeCandidate = {
      rule: 'Always use async/await, never use .then() chains',
      evidencePath: 'src/a.ts',
    };
    const existing: ExistingConventionForDedupe = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    expect(ruleSimilarity(candidate.rule, existing.rule)).toBeGreaterThanOrEqual(
      DUPLICATE_RULE_SIMILARITY_THRESHOLD,
    );
    expect(dedupeNewCandidates([candidate], [existing])).toEqual([]);
  });

  it('a REJECTED existing row still suppresses resurfacing', () => {
    const candidate: DedupeCandidate = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    const rejected: ExistingConventionForDedupe = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    // Status is not modeled in ExistingConventionForDedupe (caller passes
    // rows of any status) — the dedupe function itself is status-agnostic.
    expect(dedupeNewCandidates([candidate], [rejected])).toEqual([]);
  });

  it('within-batch near-duplicates collapse to one (first occurrence kept)', () => {
    const first: DedupeCandidate = {
      rule: 'Always use async/await, never .then() chains',
      evidencePath: 'src/a.ts',
    };
    const nearDuplicate: DedupeCandidate = {
      rule: 'Always use async/await, never use .then() chains',
      evidencePath: 'src/a.ts',
    };
    const distinct: DedupeCandidate = {
      rule: 'Prefer named exports over default exports',
      evidencePath: 'src/b.ts',
    };
    const result = dedupeNewCandidates([first, nearDuplicate, distinct], []);
    expect(result).toEqual([first, distinct]);
  });
});
