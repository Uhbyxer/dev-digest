import type { CSSProperties } from "react";

const card: CSSProperties = {
  padding: 14,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
};

export const s = {
  h2: { fontSize: 15, fontWeight: 700, margin: "24px 0 10px" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 } satisfies CSSProperties,
  card,
  cardTitle: { fontSize: 14, fontWeight: 600, marginBottom: 2 } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  metricRow: { display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 } satisfies CSSProperties,
  pickers: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  select: {
    width: "100%",
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  label: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 } satisfies CSSProperties,
  td: { padding: "6px 8px", borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  diffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 } satisfies CSSProperties,
  pre: (changed: boolean): CSSProperties => ({
    ...card,
    margin: 0,
    whiteSpace: "pre-wrap",
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    borderColor: changed ? "var(--warning, #d29922)" : "var(--border)",
  }),
  tag: (changed: boolean): CSSProperties => ({
    fontSize: 11,
    color: changed ? "var(--warning, #d29922)" : "var(--text-muted)",
    marginBottom: 4,
  }),
} as const;
