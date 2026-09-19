/* SkillsTab — Agent Editor "Skills" tab (T10). Checkbox list of every
   workspace skill (checked = linked; order = assembled-prompt order),
   drag-to-reorder, per-skill type badge, filter-by-name, "N of M enabled"
   summary. Persists via the now-transactional AgentsService.setSkills (T3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useSkills,
  useAgentSkillLinks,
  useSetAgentSkills,
} from "../../../../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "../../../../../../../lib/skill-type-color";
import { reorderSkillLink, sortSkillsForTab, toggleSkillLink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { data: allSkills, isLoading: skillsLoading, isError, refetch } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills(agent.id);
  // Both queries must resolve before rendering real content — otherwise the
  // tab briefly renders with `linkedIds = []` (every checkbox unchecked, "0 of
  // N enabled") whenever the skills list resolves before the agent's own
  // linked-skill list does.
  const isLoading = skillsLoading || linksLoading;

  const [search, setSearch] = React.useState("");
  const [linkedIds, setLinkedIds] = React.useState<string[]>([]);
  // A ref, not state: dragstart → dragover → drop fires in one synchronous
  // burst and doesn't need to trigger a re-render mid-sequence.
  const dragIdRef = React.useRef<string | null>(null);

  // Depend on a stable serialization, not the `links` array reference itself
  // — a query result that isn't referentially memoized (e.g. re-created each
  // render) would otherwise re-run this effect, re-derive a new array, and
  // loop forever.
  const linksKey = links ? JSON.stringify(links.map((l) => [l.skill_id, l.order])) : "";
  React.useEffect(() => {
    if (links) setLinkedIds(links.slice().sort((a, b) => a.order - b.order).map((l) => l.skill_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksKey, agent.id]);

  const persist = (next: string[]) => {
    setLinkedIds(next);
    setSkills.mutate(next);
  };

  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ marginTop: 12 }}>
          <Skeleton height={140} />
        </div>
      </div>
    );
  }

  const skills = allSkills ?? [];
  if (skills.length === 0) {
    return (
      <div style={s.wrap}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <div style={s.empty}>{t("skills.noSkillsYet")}</div>
      </div>
    );
  }

  const rows = sortSkillsForTab(skills, linkedIds, search);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: linkedIds.length, total: skills.length })}
        </span>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filterInput}
      />
      {rows.length === 0 && <div style={s.empty}>{t("skills.empty")}</div>}
      <div style={s.list}>
        {rows.map((sk) => {
          const checked = linkedIds.includes(sk.id);
          return (
            <div
              key={sk.id}
              data-testid={`skill-row-${sk.id}`}
              draggable={checked}
              onDragStart={() => {
                dragIdRef.current = sk.id;
              }}
              onDragOver={(e) => {
                if (checked) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = dragIdRef.current;
                if (checked && draggedId) persist(reorderSkillLink(linkedIds, draggedId, sk.id));
                dragIdRef.current = null;
              }}
              style={s.row(checked)}
            >
              {checked ? (
                <Icon.GripVertical size={14} style={s.grip} />
              ) : (
                <span style={{ width: 14, flexShrink: 0 }} />
              )}
              <Checkbox
                checked={checked}
                onChange={() => persist(toggleSkillLink(linkedIds, sk.id))}
                label={<span style={s.name}>{sk.name}</span>}
              />
              <span style={s.spacer} />
              <Badge color={SKILL_TYPE_COLOR[sk.type]} bg={SKILL_TYPE_COLOR[sk.type] + "1f"}>
                {tSkills(`types.${sk.type}`)}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
