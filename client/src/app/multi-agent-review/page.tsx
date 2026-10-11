/* Multi-Agent Review — Configure run. Global (not repo-scoped) route; the PR list
   comes from the active repo. Results live at /multi-agent-review/[multiRunId]. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { ConfigureRun } from "./_components/ConfigureRun";

export default function MultiAgentReviewPage() {
  const t = useTranslations("multiAgent");
  return (
    <AppShell crumb={[{ label: t("nav.title"), href: "/multi-agent-review" }, { label: t("nav.configure") }]}>
      <ConfigureRun />
    </AppShell>
  );
}
