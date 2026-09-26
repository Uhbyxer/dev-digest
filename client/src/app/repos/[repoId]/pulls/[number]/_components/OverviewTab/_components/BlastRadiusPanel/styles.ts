import type { CSSProperties } from "react";

export const s = {
  statRow: {
    display: "flex",
    gap: 24,
    marginTop: 12,
    marginBottom: 4,
  } satisfies CSSProperties,
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  degradedBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid var(--warning-border, var(--border))",
    background: "var(--warning-bg, var(--bg-elevated))",
    borderRadius: 8,
    padding: "10px 14px",
    marginTop: 12,
  } satisfies CSSProperties,
  degradedText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  symbolList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 16,
  } satisfies CSSProperties,
  symbolGroup: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
  } satisfies CSSProperties,
  symbolHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 13,
  } satisfies CSSProperties,
  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    margin: "8px 0 0",
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.7,
  } satisfies CSSProperties,
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  } satisfies CSSProperties,
  emptyLine: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 12,
  } satisfies CSSProperties,
  summary: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 14,
  } satisfies CSSProperties,
} as const;
