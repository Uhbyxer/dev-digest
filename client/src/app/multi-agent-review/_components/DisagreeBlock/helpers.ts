import type { Conflict } from "@/lib/types";

/** A group is a real disagreement when agents diverge: at least one flagged and
    at least one did-not-flag, or the flagging agents' severities differ (AC-23). */
export function isConflict(c: Conflict): boolean {
  const flagged = c.takes.filter((t) => t.verdict !== "ignored");
  if (flagged.length === 0) return false;
  if (flagged.length < c.takes.length) return true;
  return new Set(flagged.map((t) => t.verdict)).size > 1;
}
