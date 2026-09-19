import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/**
 * Pure helper — DB row ⇄ DTO mapping for the conventions module. No I/O;
 * mirrors the skills module's helpers.ts.
 */

/** Map a persisted convention row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId,
    rule: row.rule,
    evidence_path: row.evidencePath ?? null,
    evidence_snippet: row.evidenceSnippet ?? null,
    confidence: row.confidence ?? null,
    status: row.status as ConventionStatus,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
