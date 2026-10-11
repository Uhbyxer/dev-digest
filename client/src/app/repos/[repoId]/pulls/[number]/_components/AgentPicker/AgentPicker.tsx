/* AgentPicker — "Run Review ▾" on the PR page. Opens "Pick agents to run":
   checkbox rows (name + ~Ns estimate), all enabled agents pre-checked, and
   "Run multi-agent review (N)" which POSTs one multi-agent run over exactly the
   checked agents, then navigates to the result page (AC-1..AC-3, AC-7, AC-9). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";
import { formatApproxSeconds, formatDuration, resultsHref, startErrorKey, summarizeEstimate } from "@/app/multi-agent-review/helpers";
import { PICKER_WIDTH } from "./constants";
import { s } from "./styles";

export function AgentPicker({
  prId,
  warnMerged = false,
}: {
  prId: string;
  /** PR is already merged/closed — warn, but still allow (OQ-6). */
  warnMerged?: boolean;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const start = useStartMultiAgentRun(prId);
  const [open, setOpen] = React.useState(false);
  // null = default selection (every enabled agent); not persisted (OQ-4).
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const enabled = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  const selectedIds = picked ?? new Set(enabled.map((a) => a.id));
  const selected = enabled.filter((a) => selectedIds.has(a.id));
  const count = selected.length;
  const estimate = summarizeEstimate(selected);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      setOpen(false);
      router.push(resultsHref(res.multi_run_id, prId));
    } catch (e) {
      // Keep the popover open with the selection intact so the user can retry.
      setError(t(`agentPicker.startError.${startErrorKey(e)}`));
    }
  };

  return (
    <div ref={rootRef} style={s.root}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind="secondary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div role="dialog" aria-label={t("agentPicker.title")} style={{ ...s.popover, width: PICKER_WIDTH }}>
          <div style={s.header}>
            <span style={s.title}>{t("agentPicker.title")}</span>
            <button type="button" style={s.clear} onClick={() => setPicked(new Set())}>
              {t("agentPicker.clear")}
            </button>
          </div>
          {warnMerged && (
            <div style={s.warn}>
              <Icon.AlertTriangle size={13} style={{ color: "var(--warn)" }} />
              {t("runReview.mergedWarning")}
            </div>
          )}
          {enabled.length === 0 ? (
            <div style={s.empty}>
              <strong>{t("agentPicker.emptyTitle")}</strong>
              <span>{t("agentPicker.emptyBody")}</span>
              <button type="button" style={{ ...s.clear, textAlign: "left" }} onClick={() => router.push("/agents")}>
                {t("agentPicker.emptyLink")}
              </button>
            </div>
          ) : (
            <div role="group" aria-label={t("agentPicker.listLabel")} style={s.list}>
              {enabled.map((a) => (
                <label key={a.id} style={s.row}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={s.rowName}>{a.name}</span>
                  <span style={s.rowEst} title={a.has_history ? undefined : t("agentPicker.noHistory")}>
                    {a.has_history ? formatApproxSeconds(a.est_duration_ms) : "—"}
                  </span>
                </label>
              ))}
            </div>
          )}
          <Button
            kind="primary"
            size="md"
            full
            icon="Users"
            disabled={count === 0}
            loading={start.isPending}
            onClick={run}
          >
            {t("agentPicker.run", { count })}
          </Button>
          {error && (
            <div role="alert" style={{ ...s.warn, color: "var(--danger, #e5484d)" }}>
              {error}
            </div>
          )}
          {count > 0 && (
            <div style={s.summary}>
              {estimate.durationMs == null && estimate.costUsd == null
                ? t("agentPicker.noEstimate")
                : t("agentPicker.estimateSummary", {
                    time: formatDuration(estimate.durationMs),
                    cost: formatCost(estimate.costUsd),
                  })}
            </div>
          )}
          <button type="button" style={s.footerLink} onClick={() => router.push("/agents")}>
            <Icon.Settings size={13} />
            {t("runReview.configureAgents")}
          </button>
        </div>
      )}
    </div>
  );
}
