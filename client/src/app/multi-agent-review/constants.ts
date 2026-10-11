/** Constants for the Multi-Agent Review feature (Configure run + results). */
import type { IconName } from "@devdigest/ui";

/** Presentation-only agent accent palette + icon (OQ-11: no DB column). Assigned
    by a stable hash of the agent id so an agent keeps its colour on every screen. */
export const AGENT_ACCENTS: { color: string; icon: IconName }[] = [
  { color: "#ef4444", icon: "Shield" },
  { color: "#f59e0b", icon: "Zap" },
  { color: "#3b82f6", icon: "Lightbulb" },
  { color: "#a855f7", icon: "Users" },
  { color: "#10b981", icon: "Boxes" },
  { color: "#14b8a6", icon: "Cpu" },
];

/** Severity → colour token + icon (AC-28). */
export const SEVERITY_STYLE: Record<string, { color: string; icon: IconName }> = {
  CRITICAL: { color: "var(--crit)", icon: "AlertOctagon" },
  WARNING: { color: "var(--warn)", icon: "AlertTriangle" },
  SUGGESTION: { color: "var(--sugg)", icon: "Lightbulb" },
};

export const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Score thresholds (AC-29): >= GOOD green, >= MID orange, else red. */
export const SCORE_GOOD = 70;
export const SCORE_MID = 50;
/** Confidence thresholds in percent (AC-29): >= 90 green, >= 50 orange, else red. */
export const CONF_GOOD = 90;
export const CONF_MID = 50;

/** Columns view minimum column width in px (OQ-12). */
export const COLUMN_MIN_WIDTH = 280;

export const VIEW_MODES = ["columns", "tabs"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** Route of the Configure run page and base of the results route. */
export const MULTI_AGENT_ROUTE = "/multi-agent-review";
