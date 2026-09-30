/* Project Context — /repos/:repoId/context. Thin route entry. */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ContextView } from "./_components/ContextView";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("page.crumb") }];

  return (
    <AppShell crumb={crumb}>{repoNotFound ? <RepoNotFound /> : <ContextView repoId={repoId} />}</AppShell>
  );
}
