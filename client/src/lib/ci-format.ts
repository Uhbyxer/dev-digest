import type { CiFailOn } from "@devdigest/shared";

/** The Fail-CI-on values the UI offers (`any` is a schema value never exposed — spec Q9). */
export const CI_FAIL_ON_UI_VALUES = ["critical", "warning", "never"] as const;
export type CiFailOnUi = (typeof CI_FAIL_ON_UI_VALUES)[number];

/** Map a stored value onto the three UI options (`any` is stricter than warning → shown as Warning +). */
export function toUiFailOn(v: CiFailOn): CiFailOnUi {
  return v === "any" ? "warning" : v;
}

const VERDICT_COLORS = {
  APPROVE: { color: "var(--ok)", bg: "var(--ok-bg)" },
  COMMENT: { color: "var(--warn)", bg: "var(--warn-bg)" },
  REQUEST_CHANGES: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const;

export function verdictStyle(verdict: string | null | undefined): { color: string; bg: string } | null {
  return verdict && verdict in VERDICT_COLORS ? VERDICT_COLORS[verdict as keyof typeof VERDICT_COLORS] : null;
}

/** Milliseconds → "42s" / "3m 05s"; null → "—". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}
