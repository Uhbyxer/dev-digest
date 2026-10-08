import type { FindingRecord } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence and/or non-matching-severity findings, then sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter?: Severity | null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severityFilter) shown = shown.filter((f) => f.severity === severityFilter);
  // Severity first, then a fixed tiebreak. Without it, equal-severity findings keep the
  // API's row order — and Postgres moves an updated row (accept/dismiss), so the card
  // you just acted on would jump away and the list would reshuffle.
  return [...shown].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line ||
      a.id.localeCompare(b.id),
  );
}
