/**
 * `deriveIntentConfidence` — pure, deterministic stated-vs-inferred scoring
 * (decision #1, docs/plans/intent-layer.md). Confidence/sources are computed
 * from which signals were actually available, never from the LLM's output —
 * these tests exercise only the signal-derivation logic, no LLM involved.
 */
import { describe, it, expect } from 'vitest';
import { deriveIntentConfidence } from '../src/intent/index.js';

const baseSignals = {
  hasLinkedTicket: false,
  hasLinkedSpec: false,
  hasDiffStats: false,
  hasCommitMessages: false,
};

describe('deriveIntentConfidence — stated vs inferred', () => {
  it('marks "stated" when the description exceeds 40 non-whitespace chars', () => {
    const description = 'a'.repeat(41);
    const { confidence } = deriveIntentConfidence({ ...baseSignals, description });
    expect(confidence).toBe('stated');
  });

  it('marks "inferred" when the description is exactly at/under the 40-char threshold', () => {
    const description = 'a'.repeat(40);
    const { confidence } = deriveIntentConfidence({ ...baseSignals, description });
    expect(confidence).toBe('inferred');
  });

  it('marks "inferred" when there is no description at all', () => {
    const { confidence } = deriveIntentConfidence({ ...baseSignals });
    expect(confidence).toBe('inferred');
  });

  it('marks "inferred" when the description is whitespace-padded but thin (whitespace excluded from the count)', () => {
    // 41 chars total, but only ~10 are non-whitespace — must not cross the threshold.
    const description = 'short text' + ' '.repeat(31);
    const { confidence } = deriveIntentConfidence({ ...baseSignals, description });
    expect(confidence).toBe('inferred');
  });

  it('marks "inferred" even with linked ticket/spec present, if the description itself is thin', () => {
    const { confidence } = deriveIntentConfidence({
      ...baseSignals,
      description: 'fix bug',
      hasLinkedTicket: true,
      hasLinkedSpec: true,
    });
    expect(confidence).toBe('inferred');
  });
});

describe('deriveIntentConfidence — sources', () => {
  it('always includes "title", regardless of other signals', () => {
    const { sources } = deriveIntentConfidence({ ...baseSignals });
    expect(sources).toContain('title');
  });

  it('includes "description" only when a non-empty description was passed', () => {
    const withDesc = deriveIntentConfidence({ ...baseSignals, description: 'fixes a bug' });
    expect(withDesc.sources).toContain('description');

    const withoutDesc = deriveIntentConfidence({ ...baseSignals });
    expect(withoutDesc.sources).not.toContain('description');

    const blankDesc = deriveIntentConfidence({ ...baseSignals, description: '   ' });
    expect(blankDesc.sources).not.toContain('description');
  });

  it('includes "linked_ticket" only when hasLinkedTicket is true', () => {
    expect(deriveIntentConfidence({ ...baseSignals, hasLinkedTicket: true }).sources).toContain(
      'linked_ticket',
    );
    expect(deriveIntentConfidence({ ...baseSignals }).sources).not.toContain('linked_ticket');
  });

  it('includes "linked_spec" only when hasLinkedSpec is true', () => {
    expect(deriveIntentConfidence({ ...baseSignals, hasLinkedSpec: true }).sources).toContain(
      'linked_spec',
    );
    expect(deriveIntentConfidence({ ...baseSignals }).sources).not.toContain('linked_spec');
  });

  it('includes "diff_stats" only when hasDiffStats is true', () => {
    expect(deriveIntentConfidence({ ...baseSignals, hasDiffStats: true }).sources).toContain(
      'diff_stats',
    );
    expect(deriveIntentConfidence({ ...baseSignals }).sources).not.toContain('diff_stats');
  });

  it('includes "commit_messages" only when hasCommitMessages is true', () => {
    expect(
      deriveIntentConfidence({ ...baseSignals, hasCommitMessages: true }).sources,
    ).toContain('commit_messages');
    expect(deriveIntentConfidence({ ...baseSignals }).sources).not.toContain('commit_messages');
  });

  it('combines every signal into sources when all are present', () => {
    const { sources } = deriveIntentConfidence({
      description: 'a'.repeat(50),
      hasLinkedTicket: true,
      hasLinkedSpec: true,
      hasDiffStats: true,
      hasCommitMessages: true,
    });
    expect(sources.sort()).toEqual(
      ['title', 'description', 'linked_ticket', 'linked_spec', 'diff_stats', 'commit_messages'].sort(),
    );
  });
});
