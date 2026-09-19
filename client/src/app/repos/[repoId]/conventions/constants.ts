import type { ConventionStatus } from "@devdigest/shared";

/** Constants for the per-repo Conventions page (/repos/:repoId/conventions). */

/** Status filter tabs shown above the list, in display order. "all" shows every
 *  status at once — the default, since user story #20 forbids hiding data by
 *  default (no confidence gate, and no status hidden unless the user filters). */
export const STATUS_FILTERS: { key: "all" | ConventionStatus; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "pending", labelKey: "pending" },
  { key: "accepted", labelKey: "accepted" },
  { key: "rejected", labelKey: "rejected" },
];

/** Number of skeleton rows shown while the list is loading. */
export const SKELETON_ROWS = 3;

export const MODAL_WIDTH = 640;

/** Status -> colour token for the row's status badge. */
export const STATUS_COLOR: Record<ConventionStatus, string> = {
  pending: "var(--text-muted)",
  accepted: "var(--ok)",
  rejected: "var(--crit)",
};
