import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  filterInput: {
    width: "100%",
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    marginBottom: 12,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  row: (checked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    background: checked ? "var(--bg-hover)" : "transparent",
  }),
  grip: { color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 13 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;
