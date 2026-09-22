/* FindingLineCard — a finding rendered inline, anchored directly under the
   diff line it's about (Smart Diff / Files changed tab). Same fields as the
   Agent runs tab's FindingCard (severity, category, confidence, rationale,
   suggested fix, Accept/Dismiss) minus the file:line link — redundant once
   the card is already sitting on that exact line. Defaults expanded: the
   explanation must be visible without an extra click here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "../../../lib/types";

export function FindingLineCard({
  finding,
  pending,
  onAction,
}: {
  finding: FindingRecord;
  pending?: boolean;
  onAction?: (action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={finding.id} style={s.card(muted)}>
      <div style={s.headerRow}>
        <SeverityBadge severity={finding.severity as Severity} compact />
        <span style={s.title(muted, dismissed)}>{finding.title}</span>
        <CategoryTag category={finding.category as Category} />
        {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
        {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
        <span style={s.confidenceWrap}>
          <ConfidenceNum value={finding.confidence} />
        </span>
      </div>

      <div style={s.prose}>
        <Markdown>{finding.rationale}</Markdown>
      </div>

      {finding.suggestion && (
        <div style={s.suggestionWrap}>
          <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
          <div style={s.prose}>
            <Markdown>{finding.suggestion}</Markdown>
          </div>
        </div>
      )}

      <div style={s.actions}>
        <Button
          kind="secondary"
          size="sm"
          icon="Check"
          disabled={pending}
          active={accepted}
          onClick={() => onAction?.("accept")}
        >
          {t("finding.accept")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="X"
          disabled={pending}
          active={dismissed}
          onClick={() => onAction?.("dismiss")}
        >
          {t("finding.dismiss")}
        </Button>
      </div>
    </div>
  );
}

const s = {
  card: (muted: boolean) =>
    ({
      borderRadius: 6,
      borderStyle: "solid",
      borderColor: "var(--border)",
      borderWidth: 1,
      background: "var(--bg-elevated)",
      padding: "10px 12px",
      opacity: muted ? 0.6 : 1,
    }) as React.CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } as React.CSSProperties,
  title: (muted: boolean, dismissed: boolean) =>
    ({
      fontSize: 13,
      fontWeight: 600,
      color: muted ? "var(--text-muted)" : "var(--text-primary)",
      textDecoration: dismissed ? "line-through" : "none",
      flex: 1,
      minWidth: 0,
    }) as React.CSSProperties,
  acceptedTag: { fontSize: 11.5, fontWeight: 600, color: "var(--ok)" } as React.CSSProperties,
  dismissedTag: { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" } as React.CSSProperties,
  confidenceWrap: { flexShrink: 0 } as React.CSSProperties,
  prose: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    marginTop: 8,
  } as React.CSSProperties,
  suggestionWrap: { marginTop: 10 } as React.CSSProperties,
  suggestionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginBottom: 6,
    textTransform: "uppercase",
  } as React.CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" } as React.CSSProperties,
} as const;
