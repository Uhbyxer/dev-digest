/* eval-format.ts — shared formatting for Eval metrics (0..1 ratios). */

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Signed percentage-point change, e.g. "+25 pp" / "-10 pp" / "0 pp". */
export const deltaPp = (from: number, to: number) => {
  const d = Math.round((to - from) * 100);
  return `${d > 0 ? "+" : ""}${d} pp`;
};

export const deltaColor = (from: number, to: number) =>
  to > from ? "var(--success, #3fb950)" : to < from ? "var(--danger, #f85149)" : "var(--text-muted)";
