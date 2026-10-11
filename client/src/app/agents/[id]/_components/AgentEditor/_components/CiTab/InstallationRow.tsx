"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { useAgentCiRuns } from "../../../../../../../lib/hooks";
import { formatCost, relativeTime } from "../../../../../../../lib/format";
import { CiVerdictBadge } from "../../../../../../../components/ci-verdict-badge";
import { s } from "./styles";

/** One installed repository: target badge, workflow version, last run, history. */
export function InstallationRow({
  agentId,
  installation,
  onUpdate,
}: {
  agentId: string;
  installation: CiInstallation;
  onUpdate: (i: CiInstallation) => void;
}) {
  const t = useTranslations("ci.ciTab");
  const [open, setOpen] = React.useState(false);
  const runs = useAgentCiRuns(agentId, open ? installation.id : null);
  const active = installation.status === "active";

  return (
    <div style={s.row}>
      <div style={s.rowMain}>
        <span className="mono" style={s.repo}>
          {installation.repo}
        </span>
        <Badge>{t(`target.${installation.target_type}`)}</Badge>
        <Badge color={active ? "var(--ok)" : "var(--warn)"} bg={active ? "var(--ok-bg)" : "var(--warn-bg)"} dot>
          {t(`status.${installation.status}`)}
        </Badge>
        <span style={s.muted}>{t("version", { version: installation.workflow_version })}</span>
        <span style={s.spacer} />
        <span style={s.muted}>
          {installation.last_run_at
            ? `${t("lastRun")}: ${installation.last_run_status ?? "—"} · ${relativeTime(installation.last_run_at)}`
            : t("noRuns")}
        </span>
        <Button size="sm" kind="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t("hideHistory") : t("history")}
        </Button>
        <Button size="sm" kind="secondary" onClick={() => onUpdate(installation)}>
          {t("updateConfig")}
        </Button>
      </div>
      {open && (
        <div style={s.history}>
          {runs.isLoading ? (
            <Skeleton height={32} />
          ) : (runs.data ?? []).length === 0 ? (
            <span style={s.muted}>{t("historyEmpty")}</span>
          ) : (
            runs.data!.map((r) => (
              <div key={r.id} style={s.historyRow}>
                <span>{r.pr_number != null ? t("pr", { number: r.pr_number }) : "—"}</span>
                <CiVerdictBadge verdict={r.verdict} />
                <span style={s.muted}>{formatCost(r.cost_usd)}</span>
                <span style={s.muted}>{relativeTime(r.ran_at)}</span>
                {r.job_url && (
                  <a href={r.job_url} target="_blank" rel="noopener noreferrer">
                    ↗
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
