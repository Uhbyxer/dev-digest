/* /skills — Skills Lab (list + preview). "Add" offers Create vs Import
   (user story #13); clicking a card opens the full-body preview drawer
   (user story #2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dropdown,
  Drawer,
  EmptyState,
  ErrorState,
  Skeleton,
  Icon,
  Badge,
  Markdown,
} from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill, useDeleteSkill } from "../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "../../../../lib/skill-type-color";
import { SkillCard } from "../SkillCard";
import { SkillEditorModal } from "./_components/SkillEditorModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsLabView() {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const preview = (skills ?? []).find((sk) => sk.id === previewId) ?? null;
  const editing = (skills ?? []).find((sk) => sk.id === editingId) ?? null;

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <SkillEditorModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}
      {editing && <SkillEditorModal skill={editing} onClose={() => setEditingId(null)} />}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("list.title")}</h1>
            <p style={s.subtitle}>{t("list.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={200}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("list.add")}
              </Button>
            }
            items={[
              { label: t("list.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("list.import"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === previewId}
                onClick={() => setPreviewId(sk.id)}
                onToggleEnabled={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>

      {preview && (
        <Drawer title={preview.name} subtitle={t("preview.title")} onClose={() => setPreviewId(null)}>
          <div style={s.previewMeta}>
            <Badge color={SKILL_TYPE_COLOR[preview.type]} bg={SKILL_TYPE_COLOR[preview.type] + "1f"}>
              {t(`types.${preview.type}`)}
            </Badge>
            <Badge color="var(--text-secondary)">{t(`sources.${preview.source}`)}</Badge>
          </div>
          <div style={s.previewDescription}>{preview.description}</div>
          <div style={s.previewActions}>
            <Button kind="secondary" size="sm" icon="Edit" onClick={() => setEditingId(preview.id)}>
              {t("preview.edit")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="Trash"
              onClick={() => {
                if (window.confirm(t("preview.deleteConfirm", { name: preview.name }))) {
                  del.mutate(preview.id);
                  setPreviewId(null);
                }
              }}
            >
              {t("preview.delete")}
            </Button>
          </div>
          <Markdown>{preview.body}</Markdown>
        </Drawer>
      )}
    </AppShell>
  );
}
