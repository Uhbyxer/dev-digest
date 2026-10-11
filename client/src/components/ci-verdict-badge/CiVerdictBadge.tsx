"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { verdictStyle } from "../../lib/ci-format";

/** Verdict badge for a CI run (APPROVE / COMMENT / REQUEST_CHANGES); icon-less dot + label. */
export function CiVerdictBadge({ verdict }: { verdict: string | null | undefined }) {
  const t = useTranslations("ci");
  const st = verdictStyle(verdict);
  if (!st) return <Badge dot>{t("verdict.unknown")}</Badge>;
  return (
    <Badge dot color={st.color} bg={st.bg}>
      {t(`verdict.${verdict as "APPROVE"}`)}
    </Badge>
  );
}
