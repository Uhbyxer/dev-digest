"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, FormField, SelectInput } from "@devdigest/ui";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";
import { GITHUB_SECRET, OPENROUTER_SECRET, POST_AS_OPTIONS, TRIGGER_OPTIONS } from "../constants";
import { s } from "../styles";

/** Step 3 — triggers, post-as, expected secrets (AC-7, AC-8). */
export function ConfigureStep({
  triggers,
  onTriggers,
  postAs,
  onPostAs,
  openrouterReady,
}: {
  triggers: CiTrigger[];
  onTriggers: (t: CiTrigger[]) => void;
  postAs: CiPostAs;
  onPostAs: (p: CiPostAs) => void;
  /** undefined while loading / unknown. */
  openrouterReady: boolean | undefined;
}) {
  const t = useTranslations("ci.exportWizard.configure");

  const toggle = (tr: CiTrigger, on: boolean) => {
    const next = on ? [...triggers, tr] : triggers.filter((x) => x !== tr);
    // At least one trigger must stay on (server requires min 1).
    if (next.length > 0) onTriggers(TRIGGER_OPTIONS.filter((o) => next.includes(o)));
  };

  return (
    <div>
      <FormField label={t("triggers")}>
        <div style={s.checks}>
          {TRIGGER_OPTIONS.map((tr) => (
            <Checkbox
              key={tr}
              checked={triggers.includes(tr)}
              onChange={(on) => toggle(tr, on)}
              label={t(`triggerOptions.${tr}`)}
            />
          ))}
        </div>
      </FormField>
      <FormField label={t("postAs")}>
        <SelectInput
          mono={false}
          value={postAs}
          onChange={(v) => onPostAs(v as CiPostAs)}
          options={POST_AS_OPTIONS.map((p) => ({ value: p, label: t(`postAsOptions.${p}`) }))}
        />
      </FormField>
      <FormField label={t("secrets")}>
        <div style={s.secretRow}>
          <span className="mono">{OPENROUTER_SECRET}</span>
          <span style={s.spacer} />
          {openrouterReady === undefined ? null : openrouterReady ? (
            <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
              {t("ready")}
            </Badge>
          ) : (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("notReady")}
            </Badge>
          )}
        </div>
        <div style={s.secretRow}>
          <span className="mono">{GITHUB_SECRET}</span>
          <span style={s.spacer} />
          <Badge>{t("auto")}</Badge>
        </div>
        <div style={s.muted}>{t("secretsHint")}</div>
      </FormField>
      <div style={s.callout}>{t("blockMerge")}</div>
    </div>
  );
}
