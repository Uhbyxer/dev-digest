import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  dropZone: {
    border: "1.5px dashed var(--border-strong)",
    borderRadius: 8,
    padding: 24,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  fileName: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 6,
    padding: "8px 12px",
  } satisfies CSSProperties,
  previewTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
} as const;
