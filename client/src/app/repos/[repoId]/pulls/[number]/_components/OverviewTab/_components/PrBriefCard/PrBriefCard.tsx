"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief, Risk, Verdict } from "@devdigest/shared";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { VerdictBanner } from "../../../VerdictBanner";
import { s } from "./styles";

const SEVERITY_COLOR: Record<Risk["severity"], string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

interface PrBriefCardProps {
  prId: string | number | null | undefined;
  repoId: string | null | undefined;
  prNumber: number | string | null | undefined;
  /** Intent + Blast radius, shown beside the summary. */
  aside?: React.ReactNode;
}

/** Files changed deep link: file always, line only when the server verified it. */
function filesChangedHref(repoId: string, prNumber: number | string, file: string, line?: number): string {
  const sp = new URLSearchParams({ tab: "diff", file });
  if (line !== undefined) sp.set("line", String(line));
  return `/repos/${repoId}/pulls/${prNumber}?${sp.toString()}`;
}

function RiskItem({ risk }: { risk: Risk }) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  return (
    <li>
      <button
        type="button"
        style={s.riskRow}
        aria-expanded={open}
        aria-label={`${risk.title} — ${open ? t("card.collapse") : t("card.expand")}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span title={t(`card.severity.${risk.severity}`)} data-severity={risk.severity} style={{ color: SEVERITY_COLOR[risk.severity], display: "inline-flex" }}>
          <Icon.AlertTriangle size={15} />
        </span>
        <span style={s.riskTitle}>{risk.title}</span>
        <span className="mono" style={s.file}>
          {risk.file_refs[0]}
        </span>
        <Icon.ChevronRight size={13} style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : undefined }} />
      </button>
      {open && <p style={s.riskExplanation}>{risk.explanation}</p>}
    </li>
  );
}

function BriefBody({ brief, repoId, prNumber, aside, prId }: { brief: PrBrief } & PrBriefCardProps) {
  const t = useTranslations("brief");
  const router = useRouter();
  const { data: reviews } = usePrReviews(prId == null ? null : String(prId));
  const review = (reviews ?? []).find((r) => r.verdict);
  const blockers = review ? review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length : 0;
  const risks = brief.risks.risks;

  return (
    <>
      {review && (
        <VerdictBanner
          verdict={review.verdict as Verdict}
          summary={review.summary}
          score={review.score}
          findingsCount={review.findings.length}
          blockers={blockers}
          agentName={review.agent_name}
        />
      )}
      <p style={s.summary}>{brief.summary}</p>
      {brief.missing.length > 0 && (
        <div style={s.notice} role="note">
          {t("card.missing", {
            items: brief.missing.map((m) => t(m === "intent" ? "card.missingIntent" : "card.missingBlast")).join(", "),
          })}
        </div>
      )}
      {aside && <div style={s.aside}>{aside}</div>}
      <section aria-label={t("card.riskAreas")}>
        <h3 style={s.heading}>{t("card.riskAreas")}</h3>
        {risks.length === 0 ? (
          <p style={s.muted}>{t("noRisks")}</p>
        ) : (
          <ul style={s.list}>
            {risks.map((r, i) => (
              <RiskItem key={`${r.title}-${i}`} risk={r} />
            ))}
          </ul>
        )}
      </section>
      {brief.review_focus.length > 0 && (
        <section aria-label={t("card.reviewFocus")}>
          <h3 style={s.heading}>
            {t("card.reviewFocus")} · {t("card.reviewFocusHint")}
          </h3>
          <ol style={s.list}>
            {brief.review_focus.map((item, i) => (
              <li key={`${item.file}:${item.line ?? ""}:${i}`} style={{ display: "flex" }}>
                <span style={s.ordinal}>{i + 1}.</span>
                <button
                  type="button"
                  style={s.focusItem}
                  aria-label={t("card.openFile", { file: item.file })}
                  disabled={!repoId || prNumber == null}
                  onClick={() => repoId && prNumber != null && router.push(filesChangedHref(repoId, prNumber, item.file, item.line))}
                >
                  <span className="mono" style={s.focusFile}>
                    {item.line !== undefined ? `${item.file}:${item.line}` : item.file}
                  </span>
                  <span style={s.focusReason}>— {item.reason}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

/**
 * PR Brief card (ADR-0004): Generate brief → summary, Risk areas, Review focus
 * next to Intent/Blast radius. The Brief is stored server-side; refresh
 * regenerates on demand, stale is a display-only marker (never auto-regenerates).
 */
export function PrBriefCard(props: PrBriefCardProps) {
  const { prId } = props;
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const brief = data?.brief ?? null;

  const errorRow = (label: string, retry: () => void) => (
    <div style={s.error} role="alert">
      <span>{label}</span>
      <Button kind="secondary" size="sm" onClick={retry}>
        {t("card.retry")}
      </Button>
    </div>
  );

  return (
    <section style={s.card} aria-label={t("card.title")}>
      <div style={s.header}>
        <SectionLabel icon="Sparkles">{t("card.title")}</SectionLabel>
        {brief && data?.stale && (
          <Badge icon="Clock" color="var(--warn)">
            {t("card.stale")}
          </Badge>
        )}
        {brief && (
          <div style={s.actions}>
            <span style={s.muted}>{t("card.generatedAt", { time: relativeTime(brief.generated_at) })}</span>
            <Button kind="secondary" size="sm" icon="RefreshCw" loading={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? t("card.generating") : t("card.refresh")}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton height={120} />
      ) : isError ? (
        errorRow(t("card.loadError"), () => refetch())
      ) : (
        <>
          {generate.isError && errorRow(t("card.generateError"), () => generate.mutate())}
          {brief ? (
            <BriefBody brief={brief} {...props} />
          ) : (
            <div style={s.empty}>
              <span>{t("card.emptyBody")}</span>
              <Button kind="primary" size="sm" icon="Sparkles" loading={generate.isPending} onClick={() => generate.mutate()}>
                {generate.isPending ? t("card.generating") : t("card.generate")}
              </Button>
            </div>
          )}
          {/* Before a Brief exists Intent / Blast radius still show (BriefBody renders them otherwise). */}
          {!brief && props.aside && <div style={s.aside}>{props.aside}</div>}
        </>
      )}
    </section>
  );
}
