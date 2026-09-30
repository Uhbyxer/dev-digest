/* Onboarding Tour — /repos/:repoId/onboarding. Thin route entry: extracts
   :repoId, handles the "unknown repo" case, and wires the view. Not to be
   confused with /onboarding, which is the Add repository screen. */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { OnboardingTourView } from "./_components/OnboardingTourView";

export default function OnboardingTourPage() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [
    { label: activeRepo?.full_name ?? "…", href: `/repos/${repoId}/pulls` },
    { label: t("crumbTour") },
  ];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? (
        <RepoNotFound />
      ) : (
        <OnboardingTourView repoId={repoId} repoFullName={activeRepo?.full_name ?? ""} />
      )}
    </AppShell>
  );
}
