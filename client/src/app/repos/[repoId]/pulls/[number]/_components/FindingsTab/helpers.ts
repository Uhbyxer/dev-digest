import type { FindingRecord } from "@devdigest/shared";

export type SeverityCounts = Record<"CRITICAL" | "WARNING" | "SUGGESTION", number>;

/** Tally of findings per severity across all runs (dismissed/accepted included). */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof SeverityCounts] += 1;
  }
  return counts;
}
