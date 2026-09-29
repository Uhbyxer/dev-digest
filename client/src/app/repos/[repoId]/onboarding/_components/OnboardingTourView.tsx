/* OnboardingTourView — the Onboarding Tour page content: empty state with
   Generate, header, sticky "On this page" nav, and the five collapsible
   sections. page.tsx only extracts :repoId and wires this up. */
"use client";

import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { useOnboardingTour, useGenerateOnboardingTour } from "../../../../../lib/hooks/onboarding";
import { useRepoIntelStatus } from "../../../../../lib/hooks/repo-intel";
import { ApiError } from "../../../../../lib/api";
import { relativeTime } from "../../../../../lib/format";
import { READY_INDEX_STATUSES, SECTION_KEYS } from "../constants";
import { s } from "../styles";
import { TourSection } from "./TourSection";

export function OnboardingTourView({ repoId, repoFullName }: { repoId: string; repoFullName: string }) {
  const t = useTranslations("onboarding");
  const { data, isLoading, isError, error, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const index = useRepoIntelStatus(repoId);

  const indexStatus = index.data?.status;
  const indexReady = indexStatus !== undefined && READY_INDEX_STATUSES.includes(indexStatus);
  const tour = data?.tour ?? null;

  if (isLoading) return <Skeleton height={320} />;
  if (isError) {
    return (
      <ErrorState
        title={t("loadError.title")}
        body={error instanceof ApiError ? error.message : t("unknownError")}
        onRetry={() => refetch()}
      />
    );
  }

  const generateButton = (kind: "primary" | "secondary", label: string) => (
    <Button
      kind={kind}
      size="sm"
      icon={tour ? "RefreshCw" : "Sparkles"}
      loading={generate.isPending}
      disabled={!indexReady}
      onClick={() => generate.mutate()}
    >
      {generate.isPending ? t("generate.generating") : label}
    </Button>
  );

  if (!tour) {
    return (
      <div style={s.empty}>
        <Icon.Sparkles size={28} />
        <h1 style={s.title}>{t("generate.title")}</h1>
        <p style={s.subtitle}>{t("generate.body")}</p>
        {generateButton("primary", t("generate.cta"))}
        {!indexReady && (
          <p style={s.muted}>{t("generate.disabledReason", { status: indexStatus ?? "unknown" })}</p>
        )}
        {generate.isError && (
          <p style={s.muted}>
            {generate.error instanceof ApiError ? generate.error.message : t("unknownError")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={s.layout}>
      <nav aria-label={t("onThisPage")} style={s.toc}>
        <div style={s.tocLabel}>{t("onThisPage")}</div>
        {SECTION_KEYS.map((k) => (
          <a key={k} href={`#${k}`} style={s.tocLink}>
            {t(`sectionTitles.${k}`)}
          </a>
        ))}
      </nav>

      <div style={s.main}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>{t("heading", { repo: repoFullName })}</h1>
            <p style={s.subtitle}>
              {t("subtitle", { count: tour.files_indexed, time: relativeTime(tour.generated_at) })}
            </p>
          </div>
          <div style={s.headerActions}>{generateButton("secondary", t("regenerate"))}</div>
        </div>

        {SECTION_KEYS.map((k) => (
          <TourSection key={k} id={k} status={tour.sections[k].status}>
            <SectionBody tour={tour} k={k} />
          </TourSection>
        ))}
      </div>
    </div>
  );
}

function SectionBody({ tour, k }: { tour: OnboardingTour; k: (typeof SECTION_KEYS)[number] }) {
  const t = useTranslations("onboarding");
  switch (k) {
    case "overview":
      return <p>{tour.sections.overview.text}</p>;
    case "critical_paths":
      return (
        <ul style={s.list}>
          {tour.sections.critical_paths.items.map((i) => (
            <li key={i.path} style={s.mono}>
              {`${i.path} — ${t("dependents", { count: i.dependents })}`}
              {i.role && <span style={s.muted}> · {i.role}</span>}
            </li>
          ))}
        </ul>
      );
    case "run_locally":
      return (
        <ol style={s.list}>
          {tour.sections.run_locally.steps.map((step) => (
            <li key={step.command} style={s.mono}>
              {step.command}
            </li>
          ))}
        </ol>
      );
    case "reading_path":
      return (
        <ol style={s.list}>
          {tour.sections.reading_path.items.map((i) => (
            <li key={i.path}>
              <div style={s.mono}>{i.path}</div>
              <div style={s.muted}>{i.reason}</div>
            </li>
          ))}
        </ol>
      );
    case "first_tasks":
      return (
        <ul style={s.list}>
          {tour.sections.first_tasks.items.map((i) => (
            <li key={i.title}>
              <div>{i.title}</div>
              <div style={{ ...s.muted, ...s.mono }}>{i.files.join(", ")}</div>
            </li>
          ))}
        </ul>
      );
  }
}
