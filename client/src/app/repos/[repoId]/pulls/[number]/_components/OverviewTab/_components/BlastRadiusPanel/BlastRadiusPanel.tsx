"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { SectionLabel, Badge, Button, Chip } from "@devdigest/ui";
import { useBlastRadius, useResyncRepoIntel, useRepoIntelStatus } from "@/lib/hooks";
import { BlastTree } from "./BlastTree";
import { BlastGraph } from "./BlastGraph";
import { s } from "./styles";

type ViewMode = "tree" | "graph";

interface BlastRadiusPanelProps {
  prId: string | number | null | undefined;
  repoId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.stat}>
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

/**
 * Blast Radius panel: stat row + a Tree/Graph toggle over the same downstream
 * data (user story 12) — Tree is the "minimum acceptable" layout from issue
 * #32's mockups (expandable/collapsible per changed symbol, user story 11);
 * Graph is a hand-rolled inline SVG node-link view of the same data.
 */
export function BlastRadiusPanel({ prId, repoId, repoFullName, headSha }: BlastRadiusPanelProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const qc = useQueryClient();
  const { data: blast } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);
  const [view, setView] = React.useState<ViewMode>("tree");

  // A resync only *enqueues* a reindex job (202) — polling the index state
  // until `lastIndexedSha` actually advances (repo-intel.ts's own completion
  // signal) is what tells us the panel's stale/degraded blast data can be
  // safely refetched, rather than invalidating right after the 202 and still
  // showing the old degraded result.
  const [awaitingResync, setAwaitingResync] = React.useState(false);
  const resyncBaselineShaRef = React.useRef<string | null>(null);
  const { data: indexState } = useRepoIntelStatus(repoId, awaitingResync);

  React.useEffect(() => {
    if (!awaitingResync || !indexState) return;
    if (resyncBaselineShaRef.current === null) {
      resyncBaselineShaRef.current = indexState.lastIndexedSha;
      return;
    }
    if (indexState.lastIndexedSha !== resyncBaselineShaRef.current) {
      setAwaitingResync(false);
      qc.invalidateQueries({ queryKey: ["pr-blast", prId] });
    }
  }, [awaitingResync, indexState, qc, prId]);

  function handleResync() {
    resyncBaselineShaRef.current = null;
    setAwaitingResync(true);
    resync.mutate();
  }

  if (!blast) return null;

  const totalCallers = blast.downstream.reduce((n, d) => n + d.callers.length, 0);
  const totalEndpoints = new Set(blast.downstream.flatMap((d) => d.endpoints_affected)).size;
  const totalCrons = new Set(blast.downstream.flatMap((d) => d.crons_affected)).size;
  const hasAnyCallers = totalCallers > 0;

  return (
    <section>
      <SectionLabel
        icon="GitBranch"
        right={blast.degraded ? <Badge icon="AlertTriangle">{t("degraded.title")}</Badge> : undefined}
      >
        {tBrief("block.blast")}
      </SectionLabel>

      {blast.degraded && (
        <div style={s.degradedBox}>
          <p style={s.degradedText}>
            {t("degraded.body")}
            {blast.reason ? ` (${blast.reason})` : ""}
          </p>
          {repoId && (
            <Button
              size="sm"
              icon="RefreshCw"
              loading={resync.isPending || awaitingResync}
              onClick={handleResync}
            >
              {t("resync")}
            </Button>
          )}
        </div>
      )}

      <div style={s.statRow}>
        <Stat label={t("stat.symbols")} value={blast.changed_symbols.length} />
        <Stat label={t("stat.callers")} value={totalCallers} />
        <Stat label={t("stat.endpoints")} value={totalEndpoints} />
        <Stat label={t("stat.crons")} value={totalCrons} />
      </div>

      {!hasAnyCallers ? (
        <p style={s.emptyLine}>{t("noDownstream", { count: blast.changed_symbols.length })}</p>
      ) : (
        <>
          <div style={s.toggleRow}>
            <Chip active={view === "tree"} icon="ListChecks" onClick={() => setView("tree")}>
              {t("view.tree")}
            </Chip>
            <Chip active={view === "graph"} icon="Workflow" onClick={() => setView("graph")}>
              {t("view.graph")}
            </Chip>
          </div>
          {view === "tree" ? (
            <BlastTree blast={blast} repoFullName={repoFullName} headSha={headSha} />
          ) : (
            <BlastGraph blast={blast} />
          )}
        </>
      )}

      <p style={s.summary}>{blast.summary}</p>
    </section>
  );
}
