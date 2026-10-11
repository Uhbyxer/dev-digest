/* /ci-runs — CI Runs. CI-sourced agent runs (source='ci') pulled from GitHub
   Actions. Refreshes on load and via the button; a degraded refresh keeps the
   existing rows and shows a banner (spec AC-32, AC-33). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { PageContainer } from "../../../../components/page-shell";
import { CiVerdictBadge } from "../../../../components/ci-verdict-badge";
import { useCiRefresh, useCiRuns } from "../../../../lib/hooks";
import { formatCost, relativeTime } from "../../../../lib/format";
import { formatDuration } from "../../../../lib/ci-format";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const runs = useCiRuns();
  const refresh = useCiRefresh();

  const { mutate: doRefresh } = refresh;
  React.useEffect(() => {
    doRefresh();
  }, [doRefresh]);

  const list = runs.data ?? [];
  const cols = ["when", "pullRequest", "repository", "agent", "verdict", "findings", "cost", "duration", "job"] as const;

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <PageContainer
        title={t("runs.title")}
        subtitle={t("runs.subtitle")}
        actions={
          <Button icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        }
      >
        {refresh.data?.degraded && (
          <div style={s.banner} role="status">
            {t("runs.degraded")}
          </div>
        )}
        {runs.isError ? (
          <ErrorState body={t("runs.loadError")} onRetry={() => runs.refetch()} />
        ) : runs.isLoading ? (
          <Skeleton height={160} />
        ) : list.length === 0 ? (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} style={s.th}>
                    {t(`runs.table.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...s.td, ...s.muted }}>{relativeTime(r.ran_at)}</td>
                  <td style={s.td}>{r.pr_number != null ? `#${r.pr_number}` : "—"}</td>
                  <td style={s.td} className="mono">
                    {r.repo ?? "—"}
                  </td>
                  <td style={s.td}>{r.agent_name ?? "—"}</td>
                  <td style={s.td}>
                    <CiVerdictBadge verdict={r.verdict} />
                  </td>
                  <td style={s.td}>
                    {r.findings_count == null
                      ? "—"
                      : r.blockers
                        ? t("runs.findingsBlockers", { count: r.findings_count, blockers: r.blockers })
                        : r.findings_count}
                  </td>
                  <td style={s.td}>{formatCost(r.cost_usd)}</td>
                  <td style={s.td}>{formatDuration(r.duration_ms)}</td>
                  <td style={s.td}>
                    {r.job_url ? (
                      <a href={r.job_url} target="_blank" rel="noopener noreferrer">
                        {t("runs.viewJob")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageContainer>
    </AppShell>
  );
}
