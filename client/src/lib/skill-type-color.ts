import type { SkillType } from "@devdigest/shared";

/** Per-type badge color for a Skill — shared by the Skills Lab and the Agent
    Editor's Skills tab so a type reads the same badge color everywhere. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};
