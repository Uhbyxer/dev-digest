"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, MonoLink } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface PriorPrsPanelProps {
  prId: string | number | null | undefined;
  repoFullName: string | null | undefined;
}

/** "Prior PRs touching these files" — historical context alongside the live Blast Radius map. */
export function PriorPrsPanel({ prId, repoFullName }: PriorPrsPanelProps) {
  const t = useTranslations("brief");
  const { data } = usePrHistory(prId);

  if (!data) return null;

  return (
    <section>
      <SectionLabel icon="History">{t("block.history")}</SectionLabel>
      {data.history.length === 0 ? (
        <p style={s.emptyLine}>{t("noHistory")}</p>
      ) : (
        <div style={s.list}>
          {data.history.map((item) => (
            <div key={item.pr_number} style={s.row}>
              <span style={s.title}>
                {repoFullName ? (
                  <MonoLink href={githubPrUrl(repoFullName, item.pr_number)}>
                    #{item.pr_number} {item.title}
                  </MonoLink>
                ) : (
                  <>
                    #{item.pr_number} {item.title}
                  </>
                )}
              </span>
              <span style={s.meta}>
                {item.author} · {t("overlap", { count: item.files_overlap.length })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
