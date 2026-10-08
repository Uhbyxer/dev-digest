/* EvalsTab — Agent Editor "Evals" tab. The agent's Eval cases (born from
   accepted/dismissed findings), a Run button that scores the agent over all of
   them, the latest metrics and the run history. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentEvalCases,
  useAgentEvalRuns,
  useEvalRun,
  useRunAgentEvals,
} from "../../../../../../../lib/hooks/evals";
import { pct } from "../../../../../../../lib/eval-format";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const cases = useAgentEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id);
  const run = useRunAgentEvals(agent.id);
  const latest = runs.data?.[0];
  const latestDetail = useEvalRun(latest?.id);
  const resultByCase = new Map((latestDetail.data?.results ?? []).map((r) => [r.case_id, r]));

  if (cases.isError || runs.isError) {
    return <ErrorState body={t("pipeline.tab.runError")} onRetry={() => { cases.refetch(); runs.refetch(); }} />;
  }
  if (cases.isLoading || runs.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ marginTop: 12 }}>
          <Skeleton height={140} />
        </div>
      </div>
    );
  }

  const list = cases.data ?? [];
  const metrics = latest
    ? [
        [t("pipeline.metrics.recall"), latest.recall],
        [t("pipeline.metrics.precision"), latest.precision],
        [t("pipeline.metrics.citation"), latest.citation_accuracy],
      ] as const
    : [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("pipeline.tab.title")}</h2>
        <Button
          kind="primary"
          size="sm"
          icon="Play"
          disabled={list.length === 0 || run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending ? t("pipeline.tab.running") : t("pipeline.tab.run", { count: list.length })}
        </Button>
      </div>
      <div style={s.hint}>{t("pipeline.tab.subtitle")}</div>
      {run.isError && <div style={s.error}>{t("pipeline.tab.runError")}: {(run.error as Error).message}</div>}

      {latest && (
        <>
          <div style={s.metrics}>
            {metrics.map(([label, value]) => (
              <div key={label} style={s.metric}>
                <div style={s.metricLabel}>{label}</div>
                <div style={s.metricValue}>{pct(value)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {list.length === 0 ? (
        <div style={s.empty}>{t("pipeline.tab.empty")}</div>
      ) : (
        <div style={s.list}>
          {list.map((c) => {
            const result = resultByCase.get(c.id);
            return (
              <div key={c.id} style={s.row}>
                <Badge>{t(`pipeline.type.${c.expectation.type}`)}</Badge>
                <div style={s.rowMain}>
                  <div>{c.expectation.title}</div>
                  <div style={s.mono}>
                    {c.expectation.file}:{c.expectation.start_line}
                    {c.expectation.end_line !== c.expectation.start_line ? `–${c.expectation.end_line}` : ""}
                  </div>
                </div>
                {result && (
                  <span title={result.error ?? undefined}>
                    <Badge>
                      {result.error ? t("pipeline.tab.error") : result.pass ? t("dashboard.pass") : t("dashboard.fail")}
                    </Badge>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h3 style={s.h3}>{t("pipeline.tab.history")}</h3>
      {(runs.data ?? []).length === 0 ? (
        <div style={s.empty}>{t("pipeline.tab.noRuns")}</div>
      ) : (
        <div style={s.list}>
          {runs.data!.map((r) => (
            <div key={r.id} style={s.row}>
              <div style={s.rowMain}>
                <div>{new Date(r.ran_at).toLocaleString()}</div>
                <div style={s.muted}>{r.model}</div>
              </div>
              <span style={s.muted}>
                {t("pipeline.metrics.recall")} {pct(r.recall)} · {t("pipeline.metrics.precision")} {pct(r.precision)} ·{" "}
                {t("pipeline.tab.passed", { passed: r.cases_passed, total: r.cases_total })}
              </span>
            </div>
          ))}
        </div>
      )}
      {(runs.data ?? []).length > 1 && (
        <div style={{ marginTop: 12 }}>
          <Link href="/eval">{t("pipeline.tab.compare")} →</Link>
        </div>
      )}
    </div>
  );
}
