/* DisagreeBlock — "Where agents disagree" (AC-20..AC-23, AC-30..AC-32), shared by
   Columns and Tabs. Renders the server-computed conflict groups only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentColumn, Conflict } from "@/lib/types";
import { SEVERITY_STYLE } from "../../constants";
import { isConflict } from "./helpers";

export function DisagreeBlock({ columns, conflicts }: { columns: AgentColumn[]; conflicts: Conflict[] }) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  const totalFindings = columns.reduce((n, c) => n + c.findings.length, 0);
  const running = columns.filter((c) => c.status === "running").length;
  // AC-32: nothing to compare when no findings exist and nothing is still running.
  if (totalFindings === 0 && running === 0) return null;

  const rows = onlyConflicts ? conflicts.filter(isConflict) : conflicts;

  return (
    <section aria-labelledby="ma-disagree" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon.Activity size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
        <h2 id="ma-disagree" style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", flex: 1 }}>
          {t("disagree.title")}
        </h2>
        <span aria-hidden style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {t("disagree.onlyConflicts")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={onlyConflicts}
          aria-label={t("disagree.onlyConflicts")}
          onClick={() => setOnlyConflicts((v) => !v)}
          style={{ width: 34, height: 20, borderRadius: 99, border: "none", padding: 2, cursor: "pointer", background: onlyConflicts ? "var(--accent)" : "var(--border-strong)" }}
        >
          <span style={{ display: "block", width: 16, height: 16, borderRadius: 99, background: "#fff", transform: onlyConflicts ? "translateX(14px)" : "none", transition: "transform .15s" }} />
        </button>
      </div>

      {running > 0 && (
        <div role="status" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {t("disagree.waiting", { count: running })}
        </div>
      )}

      {rows.length === 0 && running === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("disagree.none")}</div>
      )}

      {rows.map((c, i) => (
        <div
          key={`${i}:${c.file}:${c.line}:${c.title}`}
          data-testid="conflict-row"
          style={{ border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-surface)", overflow: "hidden" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", minWidth: 0 }}>
            <Icon.Code size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} aria-hidden />
            <span className="mono" title={`${c.file}:${c.line}`} style={{ fontSize: 12.5, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.file}:{c.line}
            </span>
            <span title={c.title} style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.title}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {c.takes.map((take, ti) => {
              const ignored = take.verdict === "ignored";
              const color = ignored ? "var(--text-muted)" : (SEVERITY_STYLE[take.verdict]?.color ?? "var(--text-muted)");
              return (
                <div key={`${ti}:${take.agent_id}`} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5, borderRight: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{take.persona}</span>
                  <span>
                    <Badge dot color={color} bg="transparent" style={{ padding: 0 }}>
                      {ignored ? t("disagree.didNotFlag") : take.verdict}
                    </Badge>
                  </span>
                  {take.note && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{take.note}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
