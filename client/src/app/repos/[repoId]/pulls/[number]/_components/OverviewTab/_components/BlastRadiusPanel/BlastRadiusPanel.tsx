"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { SectionLabel, Badge, MonoLink, Button, Chip } from "@devdigest/ui";
import { useBlastRadius, useResyncRepoIntel, useRepoIntelStatus } from "@/lib/hooks";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

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
 * Baseline (plain-list) Blast Radius panel — the "minimum acceptable" layout
 * from issue #32's mockups: stat row + flat caller list per changed symbol.
 * The tree/graph toggle is an explicit stretch target in that spec and is not
 * implemented here.
 */
export function BlastRadiusPanel({ prId, repoId, repoFullName, headSha }: BlastRadiusPanelProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const qc = useQueryClient();
  const { data: blast } = useBlastRadius(prId);
  const resync = useResyncRepoIntel(repoId);

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
        <div style={s.symbolList}>
          {blast.downstream.map((d, i) => {
            // `symbol` alone isn't unique — the same method name can be
            // declared in several changed files/classes (e.g. two
            // `listPullRequests` on different clients). `downstream[i]`
            // corresponds 1:1 to `changed_symbols[i]` (the mapper builds both
            // from the same ordered list), so pull the file from there to
            // disambiguate and to key the group uniquely.
            const declFile = blast.changed_symbols[i]?.file;
            return (
              <div key={`${d.symbol}-${declFile ?? i}`} style={s.symbolGroup}>
                <div style={s.symbolHeading}>
                  <span className="mono">
                    {d.symbol}
                    {declFile && <span style={s.declFile}> — {declFile}</span>}
                  </span>
                  <span style={s.callerCount}>{t("callerCount", { count: d.callers.length })}</span>
                </div>
                {d.callers.length === 0 ? (
                  <p style={s.emptyLine}>{t("noCallers")}</p>
                ) : (
                  <ul style={s.list}>
                    {d.callers.map((c, ci) => {
                      const label = `${c.name} — ${c.file}:${c.line}`;
                      return (
                        <li key={ci}>
                          {repoFullName && headSha ? (
                            <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>{label}</MonoLink>
                          ) : (
                            <span className="mono">{label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                  <div style={s.chips}>
                    {d.endpoints_affected.map((e) => (
                      <Chip key={`e-${e}`}>{e}</Chip>
                    ))}
                    {d.crons_affected.map((c) => (
                      <Chip key={`c-${c}`}>{c}</Chip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={s.summary}>{blast.summary}</p>
    </section>
  );
}
