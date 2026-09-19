import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page and its view component. */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
  } satisfies CSSProperties,
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  pageSubtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  headerActions: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  lastScanned: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 32px 14px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  listCard: {
    margin: "0 32px 44px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  loadingStack: {
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
} as const;
