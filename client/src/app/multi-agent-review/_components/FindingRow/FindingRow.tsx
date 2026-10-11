/* FindingRow — the one finding row used by BOTH layouts (AC-16).
   mode "compact" (Columns): severity icon + left border, truncated title, file:line.
   mode "accordion" (Tabs): + category chip, confidence badge, expandable body with
   rationale, Suggested fix and the action row (AC-17, AC-19, AC-28).
   Accept/Dismiss are functional; Learn / Turn into eval case / Reply to author are
   disabled placeholders (no persisted action). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Markdown } from "@devdigest/ui";
import type { AgentColumnFinding } from "@/lib/types";
import { SEVERITY_STYLE } from "../../constants";
import { confidenceColor, confidencePercent, fileLine } from "../../helpers";

export type FindingDecision = "accept" | "dismiss";

export function FindingRow({
  finding,
  mode,
  expanded = false,
  onToggle,
  onDecide,
  pending = false,
}: {
  finding: AgentColumnFinding;
  mode: "compact" | "accordion";
  expanded?: boolean;
  onToggle?: () => void;
  onDecide?: (action: FindingDecision) => void;
  pending?: boolean;
}) {
  const t = useTranslations("multiAgent");
  const sev = SEVERITY_STYLE[finding.severity] ?? SEVERITY_STYLE.SUGGESTION!;
  const SevIcon = Icon[sev.icon];
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;
  const conf = confidencePercent(finding.confidence);
  const loc = fileLine(finding);
  const bodyId = `finding-body-${finding.id}`;

  const head = (
    <>
      <SevIcon size={15} style={{ color: sev.color, flexShrink: 0, marginTop: 2 }} aria-label={finding.severity} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            title={finding.title}
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              overflow: mode === "compact" ? undefined : "hidden",
              textOverflow: "ellipsis",
              whiteSpace: mode === "compact" ? "normal" : "nowrap",
              textDecoration: dismissed ? "line-through" : undefined,
              wordBreak: "break-word",
            }}
          >
            {finding.title}
          </span>
          {mode === "accordion" && (
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 5, padding: "0 6px" }}>
              {finding.category}
            </span>
          )}
          {accepted && <span style={{ fontSize: 11.5, color: "var(--ok)", fontWeight: 600 }}>{t("finding.accepted")}</span>}
          {dismissed && <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{t("finding.dismissed")}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
          <span
            className="mono"
            title={loc}
            style={{ fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {loc}
          </span>
          {mode === "accordion" && conf != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: confidenceColor(conf) }} />
              {t("finding.confidence", { pct: conf })}
            </span>
          )}
        </div>
      </div>
    </>
  );

  const frame: React.CSSProperties = {
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${sev.color}`,
    background: "var(--bg-surface)",
    opacity: dismissed ? 0.6 : 1,
  };

  if (mode === "compact") {
    return (
      <div data-finding-id={finding.id} style={{ ...frame, display: "flex", gap: 8, padding: "9px 11px" }}>
        {head}
      </div>
    );
  }

  return (
    <div data-finding-id={finding.id} style={frame}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        style={{ display: "flex", gap: 10, padding: "11px 14px", width: "100%", textAlign: "left", background: "transparent", border: "none", color: "inherit", cursor: "pointer", alignItems: "flex-start" }}
      >
        {head}
        <Icon.ChevronDown size={16} style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : undefined }} aria-hidden />
      </button>
      {expanded && (
        <div id={bodyId} style={{ padding: "4px 14px 14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
          {finding.rationale && (
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)", paddingTop: 10 }}>
              <Markdown>{finding.rationale}</Markdown>
            </div>
          )}
          {finding.suggestion && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
                {t("finding.suggestedFix")}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                <Markdown>{finding.suggestion}</Markdown>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button kind="secondary" size="sm" icon="Check" disabled={pending || accepted} active={accepted} onClick={() => onDecide?.("accept")}>
              {t("finding.accept")}
            </Button>
            <Button kind="ghost" size="sm" icon="X" disabled={pending || dismissed} active={dismissed} onClick={() => onDecide?.("dismiss")}>
              {t("finding.dismiss")}
            </Button>
            {/* Placeholders reserved for future work (AC-19): no handler, disabled. */}
            <span title={t("finding.comingSoon")}>
              <Button kind="ghost" size="sm" icon="Brain" disabled>
                {t("finding.learn")}
              </Button>
            </span>
            <span title={t("finding.comingSoon")}>
              <Button kind="ghost" size="sm" icon="FlaskConical" disabled>
                {t("finding.turnIntoEval")}
              </Button>
            </span>
            <span title={t("finding.comingSoon")}>
              <Button kind="ghost" size="sm" icon="MessageSquare" disabled>
                {t("finding.reply")}
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
