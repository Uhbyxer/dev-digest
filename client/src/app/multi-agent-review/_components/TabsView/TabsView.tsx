/* TabsView — one tab per agent (score badge / failed marker), the shared agent
   summary card and a finding accordion with one expanded row at a time. Tab
   switching is local state: the run resource is not re-fetched (AC-27). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentColumn } from "@/lib/types";
import { accentFor, scoreColor, sortFindings } from "../../helpers";
import { AgentSummary } from "../AgentSummary";
import { FindingRow, type FindingDecision } from "../FindingRow";

export function TabsView({
  columns,
  onViewTrace,
  onDecide,
  pendingFindingId,
}: {
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
  onDecide: (findingId: string, action: FindingDecision) => void;
  pendingFindingId?: string | null;
}) {
  const t = useTranslations("multiAgent");
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const active = columns.find((c) => c.run_id === activeRunId) ?? columns[0];
  if (!active) return null;
  const findings = sortFindings(active.findings);

  const selectTab = (runId: string) => {
    setActiveRunId(runId);
    setExpandedId(null);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = columns[(i + (e.key === "ArrowRight" ? 1 : -1) + columns.length) % columns.length]!;
    selectTab(next.run_id);
    document.getElementById(`ma-tab-${next.run_id}`)?.focus();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="tablist" aria-label={t("results.tabsLabel")} style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {columns.map((c, i) => {
          const on = c.run_id === active.run_id;
          const accent = accentFor(c.agent_id);
          const I = Icon[accent.icon];
          return (
            <button
              key={c.run_id}
              id={`ma-tab-${c.run_id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls="ma-tabpanel"
              tabIndex={on ? 0 : -1}
              onClick={() => selectTab(c.run_id)}
              onKeyDown={(e) => onKey(e, i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: on ? 600 : 500,
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              <I size={14} style={{ color: accent.color }} aria-hidden />
              {c.agent_name}
              {c.status === "running" ? (
                <Icon.RefreshCw size={12} aria-label={t("status.running")} style={{ animation: "ddspin 1s linear infinite", color: "var(--accent)" }} />
              ) : c.status === "failed" || c.score == null ? (
                <Icon.AlertOctagon size={13} aria-label={t("status.failed")} style={{ color: "var(--crit)" }} />
              ) : (
                <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: scoreColor(c.score) }}>
                  {c.score}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="ma-tabpanel" aria-labelledby={`ma-tab-${active.run_id}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <AgentSummary column={active} variant="card" onViewTrace={onViewTrace} />
        {active.status === "done" && findings.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "6px 2px" }}>{t("results.noFindings")}</div>
        )}
        {active.status === "done" &&
          findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              mode="accordion"
              expanded={expandedId === f.id}
              onToggle={() => setExpandedId((cur) => (cur === f.id ? null : f.id))}
              onDecide={(a) => onDecide(f.id, a)}
              pending={pendingFindingId === f.id}
            />
          ))}
      </div>
    </div>
  );
}
