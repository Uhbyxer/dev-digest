/* ConventionsView — the substantive Conventions page content (list, scan
   header, status filter, create-skill entry point). page.tsx only extracts
   :repoId/handles the "unknown repo" case and wires this component up. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionStatus } from "@devdigest/shared";
import { useConventions, useScanConventions, useUpdateConvention } from "../../../../../lib/hooks/conventions";
import { ApiError } from "../../../../../lib/api";
import { ConventionRow } from "./ConventionRow";
import { ConventionSkillModal } from "./ConventionSkillModal";
import { filterByStatus, relativeTime, sortConventions } from "./helpers";
import { SKELETON_ROWS, STATUS_FILTERS } from "../constants";
import { s } from "../styles";

export function ConventionsView({ repoId, repoFullName }: { repoId: string; repoFullName: string }) {
  const t = useTranslations("conventions");
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const scan = useScanConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [statusFilter, setStatusFilter] = React.useState<"all" | ConventionStatus>("all");
  const [creatingSkill, setCreatingSkill] = React.useState(false);

  const conventions = sortConventions(data?.conventions ?? []);
  const accepted = conventions.filter((c) => c.status === "accepted");
  const visible = filterByStatus(conventions, statusFilter);
  const lastScanned = relativeTime(data?.last_scanned_at ?? null);

  return (
    <>
      {creatingSkill && (
        <ConventionSkillModal
          repoId={repoId}
          repoFullName={repoFullName}
          accepted={accepted}
          onClose={() => setCreatingSkill(false)}
        />
      )}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.headingPrefix") + repoFullName}</h1>
          <p style={s.pageSubtitle}>
            {isLoading ? t("page.subtitle") : t("page.candidateCount", { count: conventions.length })}
          </p>
        </div>
        <div style={s.headerActions}>
          <span style={s.lastScanned}>
            {lastScanned ? t("page.lastScanned", { time: lastScanned }) : t("page.neverScanned")}
          </span>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={scan.isPending}
            onClick={() => scan.mutate()}
          >
            {scan.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon="Sparkles"
            disabled={accepted.length === 0}
            onClick={() => setCreatingSkill(true)}
          >
            {t("page.createSkill")}
          </Button>
        </div>
      </div>

      {!isLoading && !isError && conventions.length > 0 && (
        <div style={s.filterBar}>
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key}
              kind="tertiary"
              size="sm"
              active={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
            >
              {t(`filters.${f.labelKey}`)}
              {f.key !== "all" && ` (${conventions.filter((c) => c.status === f.key).length})`}
            </Button>
          ))}
        </div>
      )}

      <div style={s.listCard}>
        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={64} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.extractionFailed")}
            body={error instanceof ApiError ? error.message : t("page.loadError")}
            onRetry={() => refetch()}
          />
        ) : conventions.length === 0 ? (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => scan.mutate()}
            ctaLoading={scan.isPending}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="Filter" title={t("page.emptyFilterTitle")} />
        ) : (
          visible.map((c) => (
            <ConventionRow
              key={c.id}
              convention={c}
              onEditRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
              onSetStatus={(status) => update.mutate({ id: c.id, patch: { status } })}
            />
          ))
        )}
      </div>
    </>
  );
}
