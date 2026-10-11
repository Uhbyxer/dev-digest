/* AgentSummary — the one per-agent header/summary used by BOTH layouts (AC-16).
   variant "header": Columns card header (icon, name, time·cost, ring/state).
   variant "card":   Tabs summary card (ring, accent name, one-line summary,
                     View trace, time·cost). Status drives ring / running / failed (AC-31). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import type { AgentColumn } from "@/lib/types";
import { accentFor, formatDuration } from "../../helpers";
import { ScoreRing } from "../ScoreRing";

export function StatusMark({ column, size }: { column: AgentColumn; size: number }) {
  const t = useTranslations("multiAgent");
  if (column.status === "running") {
    return (
      <span role="status" aria-label={t("status.running")} style={{ display: "inline-flex", color: "var(--accent)" }}>
        <Icon.RefreshCw size={size * 0.5} style={{ animation: "ddspin 1s linear infinite" }} />
      </span>
    );
  }
  if (column.status === "failed" || column.score == null) {
    return (
      <span role="img" aria-label={t("status.failed")} style={{ display: "inline-flex", color: "var(--crit)" }}>
        <Icon.AlertOctagon size={size * 0.55} />
      </span>
    );
  }
  return <ScoreRing score={column.score} size={size} />;
}

export function AgentSummary({
  column,
  variant,
  onViewTrace,
}: {
  column: AgentColumn;
  variant: "header" | "card";
  onViewTrace?: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const accent = accentFor(column.agent_id);
  const I = Icon[accent.icon];
  const meta = (
    <span className="mono tnum" style={{ fontSize: 12, color: "var(--text-muted)" }}>
      {formatDuration(column.duration_ms)} · {formatCost(column.cost_usd)}
    </span>
  );

  if (variant === "header") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <span
          aria-hidden
          style={{ width: 28, height: 28, borderRadius: 7, display: "grid", placeItems: "center", color: accent.color, background: `color-mix(in srgb, ${accent.color} 14%, transparent)` }}
        >
          <I size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={column.agent_name}>
            {column.agent_name}
          </div>
          {meta}
        </div>
        <StatusMark column={column} size={38} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        padding: "16px 18px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accent.color}`,
        background: "var(--bg-surface)",
      }}
    >
      <StatusMark column={column} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: accent.color }}>{column.agent_name}</div>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {column.status === "running"
            ? t("status.runningBody")
            : column.status === "failed"
              ? (column.summary ?? t("status.failedBody"))
              : (column.summary ?? "")}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <Button kind="tertiary" size="sm" onClick={() => onViewTrace?.(column.run_id)}>
          {t("viewTrace")}
        </Button>
        {meta}
      </div>
    </div>
  );
}
