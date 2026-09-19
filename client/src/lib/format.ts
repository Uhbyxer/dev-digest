/** USD cost, e.g. "$0.06", "$0.014", "$0.0013". Null (unpriced/no run yet) → "—". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  // Round to 4 decimal places, then trim trailing zeros down to a 2-decimal
  // floor — keeps "$0.06" short while still showing "$0.0013" precisely.
  const trimmed = usd.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [, decimals = ""] = trimmed.split(".");
  return `$${usd.toFixed(Math.max(2, decimals.length))}`;
}

/** Compact relative time (e.g. "3h", "2d"). Null/unparseable → "—". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
