/* ColumnsView — one card per agent in a horizontally scrolling row (min width
   280px). Header and disagree block live outside the scroller (AC-26, OQ-12). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentColumn } from "@/lib/types";
import { COLUMN_MIN_WIDTH } from "../../constants";
import { accentFor, sortFindings } from "../../helpers";
import { AgentSummary } from "../AgentSummary";
import { FindingRow } from "../FindingRow";

export function ColumnsView({
  columns,
  onViewTrace,
}: {
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6, alignItems: "stretch" }}>
      {columns.map((col) => {
        const accent = accentFor(col.agent_id);
        const findings = sortFindings(col.findings);
        return (
          <section
            key={col.run_id}
            aria-label={col.agent_name}
            data-testid="agent-column"
            style={{
              flex: `1 0 ${COLUMN_MIN_WIDTH}px`,
              minWidth: COLUMN_MIN_WIDTH,
              display: "flex",
              flexDirection: "column",
              borderRadius: 10,
              border: "1px solid var(--border)",
              borderTop: `3px solid ${accent.color}`,
              background: "var(--bg-surface)",
            }}
          >
            <AgentSummary column={col} variant="header" />
            <div style={{ flex: 1, padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              {col.status === "running" ? (
                <div role="status" style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 2px" }}>
                  {t("status.runningBody")}
                </div>
              ) : col.status === "failed" ? (
                <div role="alert" style={{ fontSize: 13, color: "var(--crit)", padding: "10px 2px", wordBreak: "break-word" }}>
                  {col.summary ?? t("status.failedBody")}
                </div>
              ) : findings.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "10px 2px" }}>{t("results.noFindings")}</div>
              ) : (
                findings.map((f) => <FindingRow key={f.id} finding={f} mode="compact" />)
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
              <Button kind="tertiary" size="sm" onClick={() => onViewTrace(col.run_id)}>
                {t("viewTrace")}
              </Button>
              <span className="tnum" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("results.findingsCount", { count: col.findings.length })}
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
