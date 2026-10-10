/* /eval — Eval Dashboard. Latest run per agent, plus a side-by-side
   comparison of any two runs (metrics, deltas, and what changed in the
   system prompt / model — the "old prompt vs new prompt" view). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { AgentEvalRun } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { PageContainer } from "../../../../components/page-shell";
import { useAllEvalRuns, useEvalRun } from "../../../../lib/hooks/evals";
import { deltaColor, deltaPp, pct } from "../../../../lib/eval-format";
import { latestPerAgent, runLabel } from "./helpers";
import { s } from "./styles";

const METRICS = [
  ["recall", "pipeline.metrics.recall"],
  ["precision", "pipeline.metrics.precision"],
  ["citation_accuracy", "pipeline.metrics.citation"],
] as const;

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data: runs, isLoading, isError, refetch } = useAllEvalRuns();
  const [aId, setAId] = React.useState("");
  const [bId, setBId] = React.useState("");
  const a = useEvalRun(aId || null).data;
  const b = useEvalRun(bId || null).data;

  const list = React.useMemo(() => runs ?? [], [runs]);
  // Default the comparison to the two newest runs of the newest run's agent.
  React.useEffect(() => {
    if (aId || bId || list.length === 0) return;
    const same = list.filter((r) => r.agent_id === list[0]!.agent_id);
    if (same.length > 1) {
      setBId(same[0]!.id);
      setAId(same[1]!.id);
    }
  }, [list, aId, bId]);

  return (
    <AppShell crumb={[{ label: t("dashboard.defaultTitle") }]}>
      <PageContainer title={t("dashboard.defaultTitle")}>
        {isError ? (
          <ErrorState body={t("pipeline.tab.runError")} onRetry={() => refetch()} />
        ) : isLoading ? (
          <Skeleton height={140} />
        ) : list.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("dashboard.defaultTitle")} body={t("pipeline.dash.noRuns")} />
        ) : (
          <>
            <h2 style={s.h2}>{t("pipeline.dash.latestPerAgent")}</h2>
            <div style={s.grid}>
              {latestPerAgent(list).map((r) => (
                <div key={r.id} style={s.card}>
                  <div style={s.cardTitle}>{r.agent_name ?? r.agent_id}</div>
                  <div style={s.muted}>
                    {t("pipeline.dash.ranAt", { when: new Date(r.ran_at).toLocaleString() })} · {r.model}
                  </div>
                  {METRICS.map(([key, label]) => (
                    <div key={key} style={s.metricRow}>
                      <span>{t(label)}</span>
                      <strong>{pct(r[key])}</strong>
                    </div>
                  ))}
                  <div style={{ ...s.muted, marginTop: 6 }}>
                    {t("pipeline.dash.cases", { passed: r.cases_passed, total: r.cases_total })}
                  </div>
                </div>
              ))}
            </div>

            <h2 style={s.h2}>{t("pipeline.dash.compareTitle")}</h2>
            <div style={s.pickers}>
              <RunPicker label={t("pipeline.dash.runA")} value={aId} onChange={setAId} runs={list} pick={t("pipeline.dash.pick")} />
              <RunPicker label={t("pipeline.dash.runB")} value={bId} onChange={setBId} runs={list} pick={t("pipeline.dash.pick")} />
            </div>
            {a && b && (
              <>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th} />
                      <th style={s.th}>A</th>
                      <th style={s.th}>B</th>
                      <th style={s.th}>{t("pipeline.dash.delta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map(([key, label]) => (
                      <tr key={key}>
                        <td style={s.td}>{t(label)}</td>
                        <td style={s.td}>{pct(a[key])}</td>
                        <td style={s.td}>{pct(b[key])}</td>
                        <td style={{ ...s.td, color: deltaColor(a[key], b[key]), fontWeight: 600 }}>
                          {deltaPp(a[key], b[key])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={s.diffGrid}>
                  {[a, b].map((r, i) => {
                    const other = i === 0 ? b : a;
                    const changed = r.system_prompt !== other.system_prompt;
                    return (
                      <div key={i === 0 ? "a" : "b"}>
                        <div style={s.tag(changed)}>
                          {t("pipeline.dash.systemPrompt")} · {changed ? t("pipeline.dash.changed") : t("pipeline.dash.unchanged")}
                        </div>
                        <pre style={s.pre(changed)}>{r.system_prompt}</pre>
                        <div style={{ ...s.tag(r.model !== other.model), marginTop: 8 }}>
                          {t("pipeline.dash.model")} · {r.model}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </PageContainer>
    </AppShell>
  );
}

function RunPicker({
  label,
  value,
  onChange,
  runs,
  pick,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  runs: AgentEvalRun[];
  pick: string;
}) {
  return (
    <div>
      <div style={s.label}>{label}</div>
      <select style={s.select} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{pick}</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {runLabel(r)}
          </option>
        ))}
      </select>
    </div>
  );
}
