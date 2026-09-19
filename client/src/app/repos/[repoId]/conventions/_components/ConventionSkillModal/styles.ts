import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: -6 } satisfies CSSProperties,
} as const;
