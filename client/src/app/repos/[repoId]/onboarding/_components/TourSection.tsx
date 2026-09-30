/* TourSection — one collapsible card of the Onboarding Tour. Owns only its
   own open/closed state; the section body is supplied by the view. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, IconBtn } from "@devdigest/ui";
import type { OnboardingSectionStatus } from "@devdigest/shared";
import { SECTION_ICONS, type SectionKey } from "../constants";
import { s } from "../styles";

export function TourSection({
  id,
  status,
  children,
}: {
  id: SectionKey;
  status: OnboardingSectionStatus;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const title = t(`sectionTitles.${id}`);
  const SectionIcon = Icon[SECTION_ICONS[id]];

  return (
    <Card style={{ scrollMarginTop: 24 }}>
      <section id={id} aria-labelledby={`${id}-title`}>
        <div style={s.sectionHeader}>
          <SectionIcon size={16} />
          <h2 id={`${id}-title`} style={s.sectionTitle}>
            {title}
          </h2>
          <span style={s.sectionToggle}>
            <IconBtn
              icon={open ? "ChevronDown" : "ChevronRight"}
              label={`${open ? t("collapse") : t("expand")} ${title}`}
              onClick={() => setOpen((o) => !o)}
            />
          </span>
        </div>
        {open && (
          <div style={s.sectionBody}>
            {status === "not_generated" ? <p style={s.muted}>{t("notGenerated")}</p> : children}
          </div>
        )}
      </section>
    </Card>
  );
}
