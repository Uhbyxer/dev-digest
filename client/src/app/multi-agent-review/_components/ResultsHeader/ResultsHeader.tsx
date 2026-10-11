/* ResultsHeader — Configure run button, title/subtitle, Columns/Tabs segmented
   control and the totals line from MultiAgentRun (AC-25). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import type { MultiAgentRun } from "@/lib/types";
import { VIEW_MODES, type ViewMode } from "../../constants";
import { formatDuration } from "../../helpers";

export function ResultsHeader({
  run,
  prTitle,
  view,
  onView,
  onConfigure,
}: {
  run: MultiAgentRun;
  prTitle?: string | null;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  onConfigure: () => void;
}) {
  const t = useTranslations("multiAgent");
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Button kind="secondary" size="sm" icon="Settings" onClick={onConfigure}>
          {t("results.configureRun")}
        </Button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{t("nav.title")}</h1>
        <span style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>
          {t("results.subtitle", { count: run.agent_count })}
        </span>
        <div role="group" aria-label={t("results.viewLabel")} style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: 7, overflow: "hidden" }}>
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={view === m}
              onClick={() => onView(m)}
              style={{
                padding: "5px 14px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                color: view === m ? "var(--text-primary)" : "var(--text-secondary)",
                background: view === m ? "var(--bg-hover)" : "transparent",
              }}
            >
              {t(`results.view.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 13.5 }}>
        <span style={{ display: "inline-flex", gap: 8, minWidth: 0 }}>
          {run.pr_number != null && <span className="mono" style={{ color: "var(--text-muted)" }}>#{run.pr_number}</span>}
          {prTitle && <span style={{ fontWeight: 500 }}>{prTitle}</span>}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
          <Icon.Cpu size={13} style={{ color: "var(--accent)" }} aria-hidden />
          {t("results.totals", {
            count: run.agent_count,
            time: formatDuration(run.total_duration_ms),
            cost: formatCost(run.total_cost_usd),
          })}
        </span>
      </div>
    </header>
  );
}
