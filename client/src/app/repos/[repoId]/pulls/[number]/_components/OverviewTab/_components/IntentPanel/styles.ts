import type { CSSProperties } from "react";

export const s = {
  list: {
    margin: "8px 0 0",
    paddingLeft: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  intentLine: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  scopeGroups: {
    display: "grid",
    gap: 16,
    marginTop: 12,
  } satisfies CSSProperties,
  scopeHeading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
