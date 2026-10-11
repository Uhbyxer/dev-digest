import type { CSSProperties } from "react";

/** Co-located styles for ConfigureRun + AgentCard. */
export const s = {
  root: { maxWidth: 680, margin: "0 auto", padding: "36px 32px 60px", display: "flex", flexDirection: "column", gap: 20 },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  lead: { fontSize: 14, color: "var(--text-secondary)", margin: "6px 0 0", lineHeight: 1.5 },
  stepHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 99, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "var(--accent-bg, var(--bg-hover))" },
  stepTitle: { fontSize: 15, fontWeight: 600, flex: 1, margin: 0 },
  link: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 },
  selectWrap: { maxWidth: 420 },
  fieldset: { border: "none", margin: 0, padding: 0, minWidth: 0 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  prompt: { fontSize: 13, color: "var(--text-muted)", padding: "10px 2px" },
  runRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  summary: { fontSize: 12.5, color: "var(--text-muted)" },
  card: (accent: string, checked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 9,
    cursor: "pointer",
    border: `1px solid ${checked ? accent : "var(--border)"}`,
    background: checked ? `color-mix(in srgb, ${accent} 10%, transparent)` : "var(--bg-surface)",
    opacity: checked ? 1 : 0.7,
  }),
  iconBox: (accent: string): CSSProperties => ({ width: 30, height: 30, borderRadius: 7, display: "grid", placeItems: "center", color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, flexShrink: 0 }),
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 14, fontWeight: 600 },
  cardTeaser: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.45 },
  cardEst: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" },
} satisfies Record<string, CSSProperties | ((...a: never[]) => CSSProperties)>;
