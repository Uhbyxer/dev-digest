import type { IntentConfidence, IntentSource } from '@devdigest/shared';

/**
 * Pure, deterministic confidence/provenance derivation for a generated
 * Intent. Decision #1 (see docs/plans/intent-layer.md): a cheap model's own
 * confidence claim is not trustworthy enough to gate a UI badge, so
 * `confidence`/`sources` are computed here from which signals were actually
 * available BEFORE the LLM call — never from the LLM's output.
 */

/** PR description shorter than this (non-whitespace chars) doesn't count as "substantive". */
const MIN_SUBSTANTIVE_DESCRIPTION_CHARS = 40;

export interface IntentConfidenceSignals {
  /** The PR author's raw body text, if any — length is measured here, not by the caller. */
  description?: string;
  hasLinkedTicket: boolean;
  hasLinkedSpec: boolean;
  hasDiffStats: boolean;
  hasCommitMessages: boolean;
}

export interface IntentConfidenceResult {
  confidence: IntentConfidence;
  sources: IntentSource[];
}

/** Non-whitespace character count — a blank/whitespace-only body doesn't count as substantive. */
function nonWhitespaceLength(s: string): number {
  return s.replace(/\s/g, '').length;
}

export function deriveIntentConfidence(signals: IntentConfidenceSignals): IntentConfidenceResult {
  const hasSubstantiveDescription =
    !!signals.description && nonWhitespaceLength(signals.description) > MIN_SUBSTANTIVE_DESCRIPTION_CHARS;

  // 'stated' only when the PR author actually wrote a substantive description —
  // a linked ticket/spec alone still counts as 'inferred' (the PR itself states
  // nothing; we derived it from elsewhere).
  const confidence: IntentConfidence = hasSubstantiveDescription ? 'stated' : 'inferred';

  // `title` is always a source — every PR has one, and it's always fed in.
  const sources: IntentSource[] = ['title'];
  if (signals.description && signals.description.trim().length > 0) sources.push('description');
  if (signals.hasLinkedTicket) sources.push('linked_ticket');
  if (signals.hasLinkedSpec) sources.push('linked_spec');
  if (signals.hasDiffStats) sources.push('diff_stats');
  if (signals.hasCommitMessages) sources.push('commit_messages');

  return { confidence, sources };
}
