import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  topLine: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  ruleInput: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  } satisfies CSSProperties,
  metaLine: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  evidencePath: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
} as const;
