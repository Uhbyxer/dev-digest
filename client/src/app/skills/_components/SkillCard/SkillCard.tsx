/* SkillCard — name, type badge, description, enabled toggle. Clicking opens
   the side preview panel (owned by the parent list view). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "../../../../lib/skill-type-color";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggleEnabled,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span style={s.name}>{skill.name}</span>
        {onToggleEnabled && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggleEnabled} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("list.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={SKILL_TYPE_COLOR[skill.type]} bg={SKILL_TYPE_COLOR[skill.type] + "1f"}>
          {t(`types.${skill.type}`)}
        </Badge>
      </div>
    </div>
  );
}
