"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { TARGETS } from "../constants";
import { s } from "../styles";

/** Step 1 — pick the CI target (exactly four; GitHub Actions recommended). */
export function TargetStep({ target, onChange }: { target: CiTarget; onChange: (t: CiTarget) => void }) {
  const t = useTranslations("ci.exportWizard");
  return (
    <div>
      <h3 style={s.h3}>{t("target.heading")}</h3>
      <div style={s.targetGrid} role="radiogroup" aria-label={t("target.heading")}>
        {TARGETS.map((tg) => (
          <button
            key={tg}
            type="button"
            role="radio"
            aria-checked={target === tg}
            style={s.targetCard(target === tg)}
            onClick={() => onChange(tg)}
          >
            <span style={s.targetName}>
              {t(`targets.${tg}`)}
              {tg === "gha" && (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("recommended")}
                </Badge>
              )}
            </span>
            <span style={s.muted}>{t(`targets.${tg}Desc`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
