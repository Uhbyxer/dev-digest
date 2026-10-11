import { countBlockers, scoreFromFindings } from '@devdigest/reviewer-core';
import type { CiFailOn, CiRunVerdict, Finding } from '@devdigest/shared';

/**
 * Blocker count for a CI run, computed by the SAME reviewer-core function local
 * runs use (`countBlockers`), fed severity counts instead of full findings
 * (the CI artifact carries counts only) — AC-29.
 */
type SeverityCounts = { critical?: number | null; warning?: number | null; suggestion?: number | null };

function findingsFromCounts(counts: SeverityCounts): Finding[] {
  const sev = (severity: Finding['severity'], n: number | null | undefined) =>
    Array.from({ length: n ?? 0 }, () => ({ severity }) as Finding);
  return [
    ...sev('CRITICAL', counts.critical),
    ...sev('WARNING', counts.warning),
    ...sev('SUGGESTION', counts.suggestion),
  ];
}

export function blockersFromCounts(counts: SeverityCounts, failOn: CiFailOn): number {
  return countBlockers(findingsFromCounts(counts), failOn);
}

/** 0-100 score for a CI run: reviewer-core's `scoreFromFindings` (as local runs) fed severity counts. */
export function scoreFromCounts(counts: SeverityCounts): number {
  return scoreFromFindings(findingsFromCounts(counts));
}

/** Same event rule as `toReviewPayload`: none → APPROVE; gate tripped → REQUEST_CHANGES; else COMMENT. */
export function verdictOf(findingsCount: number | null, blockers: number | null): CiRunVerdict | null {
  if (findingsCount == null) return null;
  if (findingsCount === 0) return 'APPROVE';
  return (blockers ?? 0) > 0 ? 'REQUEST_CHANGES' : 'COMMENT';
}
