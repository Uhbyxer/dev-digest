import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  banner: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    color: "var(--warn)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 } satisfies CSSProperties,
  row: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  repo: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  history: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  historyRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 } satisfies CSSProperties,
} as const;
