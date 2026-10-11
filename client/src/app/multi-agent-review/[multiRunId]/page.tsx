/* Multi-Agent Review results — /multi-agent-review/[multiRunId]?pr=<prId>.
   The read endpoint is PR-scoped, so the PR id rides in `?pr=`. Both layouts read
   the same cached run resource (polled while any agent is running). Trace drawer
   is the shared RunTraceDrawer driven by `?trace=<runId>`. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useFindingAction } from "@/lib/hooks/reviews";
import { usePullDetail } from "@/lib/hooks/core";
import { ApiError } from "@/lib/api";
import { MULTI_AGENT_ROUTE, type ViewMode } from "../constants";
import { toFindingRecords } from "../helpers";
import { ResultsHeader } from "../_components/ResultsHeader";
import { ColumnsView } from "../_components/ColumnsView";
import { TabsView } from "../_components/TabsView";
import { DisagreeBlock } from "../_components/DisagreeBlock";

export default function MultiAgentResultsPage() {
  const t = useTranslations("multiAgent");
  const { multiRunId } = useParams<{ multiRunId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const prId = search.get("pr");
  const traceRunId = search.get("trace");
  const [view, setView] = React.useState<ViewMode>("columns");

  const { data: run, isLoading, isError, error, refetch } = useMultiAgentRun(prId, multiRunId);
  const { data: pr } = usePullDetail(prId);
  const action = useFindingAction();

  const crumb = [
    { label: t("nav.title"), href: MULTI_AGENT_ROUTE },
    { label: run?.pr_number != null ? `#${run.pr_number}` : "…", mono: true },
  ];
  const configureHref = `${MULTI_AGENT_ROUTE}${prId ? `?pr=${encodeURIComponent(prId)}` : ""}`;

  const setTrace = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id == null) sp.delete("trace");
    else sp.set("trace", id);
    router.replace(`${MULTI_AGENT_ROUTE}/${multiRunId}?${sp.toString()}`);
  };

  if (!prId) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("results.missingPrTitle")} body={t("results.missingPrBody")} />
      </AppShell>
    );
  }
  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={28} width={420} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }
  if (isError || !run) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("results.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("results.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const traceColumn = traceRunId ? run.columns.find((c) => c.run_id === traceRunId) : undefined;
  const onDecide = (findingId: string, a: "accept" | "dismiss") =>
    action.mutate({ findingId, action: a, prId });

  return (
    <AppShell crumb={crumb}>
      <div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24 }}>
        <ResultsHeader
          run={run}
          prTitle={pr?.title}
          view={view}
          onView={setView}
          onConfigure={() => router.push(configureHref)}
        />
        {view === "columns" ? (
          <ColumnsView columns={run.columns} onViewTrace={setTrace} />
        ) : (
          <TabsView
            columns={run.columns}
            onViewTrace={setTrace}
            onDecide={onDecide}
            pendingFindingId={action.isPending ? action.variables?.findingId : null}
          />
        )}
        <DisagreeBlock columns={run.columns} conflicts={run.conflicts} />
      </div>

      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          prNumber={run.pr_number ?? null}
          agentName={traceColumn.agent_name}
          findings={toFindingRecords(traceColumn.findings)}
          running={traceColumn.status === "running"}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
