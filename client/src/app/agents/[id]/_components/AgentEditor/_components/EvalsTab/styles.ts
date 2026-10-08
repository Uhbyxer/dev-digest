import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--danger, #f85149)", marginBottom: 12 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  metric: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  metricLabel: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  metricValue: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  h3: { fontSize: 13, fontWeight: 600, margin: "16px 0 8px" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    background: "var(--bg-hover)",
    fontSize: 13,
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;
