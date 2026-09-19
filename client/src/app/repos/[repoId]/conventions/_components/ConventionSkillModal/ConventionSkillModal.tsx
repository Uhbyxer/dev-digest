/* ConventionSkillModal — merges the repo's currently-accepted Conventions
   into a new Skill (user stories #11-14). Opens pre-filled via
   buildConventionsSkillDraft; name/description/body stay editable before
   saving. Always creates a NEW skill — there's no update path here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useCreateSkillFromConventions } from "../../../../../../lib/hooks/conventions";
import { buildConventionsSkillDraft } from "../helpers";
import { validateSkillDraft } from "./helpers";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ConventionSkillModal({
  repoId,
  repoFullName,
  accepted,
  onClose,
}: {
  repoId: string;
  repoFullName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const create = useCreateSkillFromConventions(repoId);
  const draft = React.useMemo(() => buildConventionsSkillDraft(repoFullName, accepted), [repoFullName, accepted]);

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [body, setBody] = React.useState(draft.body);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    const invalid = validateSkillDraft({ name, description, body });
    if (invalid) {
      setError(t(`skillModal.${invalid}`));
      return;
    }
    setError(null);
    await create.mutateAsync({ name, description, body });
    onClose();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("skillModal.title")}
      subtitle={t("skillModal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("skillModal.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("skillModal.creating") : t("skillModal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("skillModal.fields.name")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("skillModal.fields.description")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("skillModal.fields.body")} hint={t("skillModal.fields.bodyHint")} required>
          <Textarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
        {error && <div style={s.error}>{error}</div>}
      </div>
    </Modal>
  );
}
