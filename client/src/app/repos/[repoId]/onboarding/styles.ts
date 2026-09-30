import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page. */
export const s = {
  layout: { display: "flex", gap: 32, padding: "24px 32px", alignItems: "flex-start" } satisfies CSSProperties,
  toc: {
    position: "sticky",
    top: 24,
    width: 180,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  tocLabel: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  tocLink: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-end", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  banner: {
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sectionHeader: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  sectionToggle: { marginLeft: "auto" } satisfies CSSProperties,
  sectionBody: { marginTop: 12, fontSize: 14, lineHeight: 1.6 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", fontSize: 13 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  empty: { padding: "48px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 } satisfies CSSProperties,
} as const;
