import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * version-bump rule. No I/O; mirrors the agents module's helpers.ts.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Only a `body` edit is versioned (skill_versions snapshots the body alone). */
export interface VersionChangePatch {
  body?: string;
}

/**
 * True when a patch changes the skill's body (vs. just editing metadata or
 * toggling `enabled`) relative to the existing row — a body change bumps the
 * version and snapshots skill_versions (mirrors `isConfigChange` in the
 * agents module).
 */
export function isVersionChange(
  existing: Pick<SkillRow, 'body'>,
  patch: VersionChangePatch,
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
