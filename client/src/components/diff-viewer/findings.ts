/* Inline-finding support for the DiffViewer (Files changed tab). Threads
   agent findings under the exact diff line they're about — reusing the same
   RIGHT:<line> anchoring the existing inline-comment code already uses, so a
   finding and a human comment can both anchor to one line without new
   positioning logic. Pure helpers here; React bits live in FindingLineCard. */
import type { FindingActionKind, FindingRecord } from "../../lib/types";
import type { Line } from "./helpers";

/** What the viewer needs to read + act on inline findings. */
export interface DiffFindingApi {
  /** Every finding for this PR (across all review runs), keyed by file path. */
  byPath: Map<string, FindingRecord[]>;
  /** Finding ids with an accept/dismiss request in flight. */
  pending: Set<string>;
  onAction: (findingId: string, action: FindingActionKind) => void;
}

/** Findings anchored to a given parsed line — always the RIGHT (new) side,
    matching `keysForLine`'s RIGHT:<newNo> convention for add/ctx lines. */
export function findingsForLine(ln: Line, findings: FindingRecord[]): FindingRecord[] {
  if (findings.length === 0) return [];
  if (ln.kind !== "add" && ln.kind !== "ctx") return [];
  if (ln.newNo == null) return [];
  return findings.filter((f) => f.start_line === ln.newNo);
}
