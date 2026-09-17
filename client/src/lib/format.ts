/** USD cost, e.g. "$0.06", "$0.014", "$0.0013". Null (unpriced/no run yet) → "—". */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  // Round to 4 decimal places, then trim trailing zeros down to a 2-decimal
  // floor — keeps "$0.06" short while still showing "$0.0013" precisely.
  const trimmed = usd.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [, decimals = ""] = trimmed.split(".");
  return `$${usd.toFixed(Math.max(2, decimals.length))}`;
}
