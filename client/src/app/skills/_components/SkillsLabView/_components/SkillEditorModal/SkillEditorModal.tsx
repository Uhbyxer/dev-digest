/* SkillEditorModal — create OR edit a skill (name/description/type/body).
   The description field is explicitly framed as the skill's own interface
   (CONTEXT.md "Skill" / user story #4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { MODAL_WIDTH, SKILL_TYPE_VALUES } from "./constants";
import { validateSkillForm } from "./helpers";
import { s } from "./styles";

export function SkillEditorModal({ skill, onClose }: { skill?: Skill; onClose: () => void }) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const isEdit = !!skill;

  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`types.${v}`) }));
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const invalid = validateSkillForm({ name, description, body });
    if (invalid) {
      setError(t(`editor.${invalid}`));
      return;
    }
    setError(null);
    if (isEdit) {
      await update.mutateAsync({ id: skill.id, patch: { name, description, type, body } });
    } else {
      await create.mutateAsync({ name, description, type, body });
    }
    onClose();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={isEdit ? t("editor.editTitle") : t("editor.createTitle")}
      subtitle={t("editor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("editor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={pending}>
            {pending
              ? isEdit
                ? t("editor.saving")
                : t("editor.creating")
              : isEdit
                ? t("editor.save")
                : t("editor.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("editor.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("editor.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("editor.fields.description")} required>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("editor.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("editor.fields.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("editor.fields.body")} required>
          <Textarea
            value={body}
            onChange={setBody}
            rows={10}
            mono
            placeholder={t("editor.fields.bodyPlaceholder")}
          />
        </FormField>
        {error && <div style={s.error}>{error}</div>}
      </div>
    </Modal>
  );
}
