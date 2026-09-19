import type { Skill } from "@devdigest/shared";

/** Toggle a skill's link: attach (append to the end) or detach. */
export function toggleSkillLink(linkedIds: string[], skillId: string): string[] {
  return linkedIds.includes(skillId)
    ? linkedIds.filter((id) => id !== skillId)
    : [...linkedIds, skillId];
}

/** Move `draggedId` to sit immediately AFTER `targetId` (both must already be
    linked). No-op when either id isn't in the linked set, or they're equal. */
export function reorderSkillLink(linkedIds: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return linkedIds;
  if (!linkedIds.includes(draggedId) || !linkedIds.includes(targetId)) return linkedIds;
  const without = linkedIds.filter((id) => id !== draggedId);
  const targetIndex = without.indexOf(targetId);
  const next = [...without];
  next.splice(targetIndex + 1, 0, draggedId);
  return next;
}

/**
 * Rows to render: linked skills first (in link order), then unlinked skills
 * (alphabetical) — both filtered by name against `search`. The "N of M
 * enabled" count is computed separately (over ALL skills, unaffected by the
 * filter).
 */
export function sortSkillsForTab(allSkills: Skill[], linkedIds: string[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  const filtered = q ? allSkills.filter((sk) => sk.name.toLowerCase().includes(q)) : allSkills;
  const byId = new Map(filtered.map((sk) => [sk.id, sk]));
  const linkedOrdered = linkedIds.map((id) => byId.get(id)).filter((sk): sk is Skill => !!sk);
  const unlinked = filtered
    .filter((sk) => !linkedIds.includes(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...linkedOrdered, ...unlinked];
}
