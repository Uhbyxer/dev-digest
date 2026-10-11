import type { CSSProperties } from "react";

/** Co-located styles for AgentPicker. */
export const s = {
  root: { position: "relative", display: "inline-block" },
  popover: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 10,
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase" },
  clear: { background: "transparent", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 },
  list: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" },
  row: { display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", width: "100%" },
  rowName: { flex: 1, fontSize: 14, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowEst: { fontSize: 12, color: "var(--text-muted)" },
  summary: { fontSize: 12, color: "var(--text-muted)", textAlign: "center" },
  footerLink: { background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderTop: "1px solid var(--border)" },
  warn: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" },
  empty: { display: "flex", flexDirection: "column", gap: 4, padding: "6px 4px", fontSize: 13, color: "var(--text-secondary)" },
} satisfies Record<string, CSSProperties>;
