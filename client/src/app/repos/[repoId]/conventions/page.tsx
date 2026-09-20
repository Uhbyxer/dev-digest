/* Conventions — /repos/:repoId/conventions. Thin route entry: extracts
   :repoId, handles the "unknown repo" case, and wires the view. The crumb's
   first segment links back to /skills — this feature lives alongside Skills
   in the app (user story #19). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [
    { label: t("page.crumbLab"), href: "/skills" },
    { label: t("page.crumbConventions") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ConventionsView repoId={repoId} repoFullName={activeRepo?.full_name ?? t("page.repoFallback")} />
    </AppShell>
  );
}
