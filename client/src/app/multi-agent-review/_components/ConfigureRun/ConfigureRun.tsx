/* ConfigureRun — two-step form: 1 Pull request, 2 Agents to run (AC-4..AC-7, AC-9).
   Starts one multi-agent run via POST /pulls/:id/multi-agent-run and navigates to
   the result page. Selection is not persisted (OQ-4): all enabled agents default on. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SelectInput } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { usePullDetail, usePulls } from "@/lib/hooks/core";
import { useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useActiveRepo } from "@/lib/repo-context";
import { formatCost } from "@/lib/format";
import { formatDuration, resultsHref, startErrorKey, summarizeEstimate } from "../../helpers";
import { AgentCard } from "./AgentCard";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const { repoId } = useActiveRepo();
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const { data: agents } = useAgents();
  // Pre-select from `?pr=<prId>` (arriving from a PR page); user choice wins after.
  const [chosenPr, setChosenPr] = React.useState<string | null>(null);
  const prId = chosenPr ?? search.get("pr") ?? "";
  const start = useStartMultiAgentRun(prId || null);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Set<string> | null>(null);

  // A `?pr=` deep link can point at a PR outside the active repo's list: resolve it by id.
  const inList = (pulls ?? []).some((p) => p.id === prId);
  const { data: linked } = usePullDetail(prId && !pullsLoading && !inList ? prId : null);
  const prs = React.useMemo(() => {
    const list = (pulls ?? []).filter((p) => !!p.id);
    return linked?.id && !list.some((p) => p.id === linked.id) ? [linked, ...list] : list;
  }, [pulls, linked]);
  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  const selectedIds = picked ?? new Set(enabled.map((a) => a.id));
  const selected = enabled.filter((a) => selectedIds.has(a.id));
  const estimate = summarizeEstimate(selected);
  const hasPr = prs.some((p) => p.id === prId);
  const canRun = hasPr && selected.length > 0;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selectedIds);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  const run = async () => {
    setError(null);
    try {
      const res = await start.mutateAsync(selected.map((a) => a.id));
      router.push(resultsHref(res.multi_run_id, prId));
    } catch (e) {
      setError(t(`configure.startError.${startErrorKey(e)}`));
    }
  };

  return (
    <div style={s.root}>
      <div>
        <h1 style={s.h1}>{t("configure.title")}</h1>
        <p style={s.lead}>{t("configure.lead")}</p>
      </div>

      <section aria-labelledby="ma-step-pr">
        <div style={s.stepHead}>
          <span style={s.stepNum} aria-hidden>1</span>
          <h2 id="ma-step-pr" style={s.stepTitle}>{t("configure.stepPr")}</h2>
        </div>
        {!pullsLoading && prs.length === 0 ? (
          <div style={s.prompt}>{t("configure.noPrs")}</div>
        ) : (
          <div style={s.selectWrap} aria-label={t("configure.stepPr")}>
            <SelectInput
              mono={false}
              value={hasPr ? prId : ""}
              onChange={(v) => setChosenPr(v)}
              options={[
                { value: "", label: t("configure.prPlaceholder") },
                ...prs.map((p) => ({ value: p.id as string, label: `#${p.number} · ${p.title}` })),
              ]}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="ma-step-agents">
        <div style={s.stepHead}>
          <span style={s.stepNum} aria-hidden>2</span>
          <h2 id="ma-step-agents" style={s.stepTitle}>{t("configure.stepAgents")}</h2>
          <button
            type="button"
            style={s.link}
            disabled={!hasPr || enabled.length === 0}
            onClick={() => setPicked(new Set(enabled.map((a) => a.id)))}
          >
            {t("configure.selectAll")}
          </button>
        </div>
        {!hasPr && <div style={s.prompt}>{t("configure.pickPrFirst")}</div>}
        {hasPr && enabled.length === 0 ? (
          <EmptyState
            icon="Cpu"
            title={t("configure.noAgentsTitle")}
            body={t("configure.noAgentsBody")}
            cta={t("configure.noAgentsCta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <fieldset disabled={!hasPr} style={{ ...s.fieldset, opacity: hasPr ? 1 : 0.5 }}>
            <legend style={{ position: "absolute", left: -9999 }}>{t("configure.stepAgents")}</legend>
            <div style={s.list}>
              {enabled.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  checked={selectedIds.has(a.id)}
                  onChange={(v) => toggle(a.id, v)}
                />
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <div style={s.runRow}>
        <Button kind="primary" size="md" icon="Users" disabled={!canRun} loading={start.isPending} onClick={run}>
          {t("configure.run", { count: selected.length })}
        </Button>
        {selected.length > 0 && (
          <span style={s.summary}>
            {estimate.durationMs == null && estimate.costUsd == null
              ? t("configure.noEstimate")
              : t("configure.estimateSummary", {
                  time: formatDuration(estimate.durationMs),
                  cost: formatCost(estimate.costUsd),
                })}
          </span>
        )}
      </div>
      {error && (
        <div role="alert" style={s.prompt}>
          {error}
        </div>
      )}
    </div>
  );
}
