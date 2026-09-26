import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
  } satisfies CSSProperties,
  title: {
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    color: "var(--text-muted)",
    fontSize: 12,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  emptyLine: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 12,
  } satisfies CSSProperties,
} as const;
