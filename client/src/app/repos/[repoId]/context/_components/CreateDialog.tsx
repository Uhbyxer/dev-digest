"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { ContextDocType } from "@devdigest/shared";
import { useCreateContextDocument } from "@/lib/hooks/context";
import { DOC_TYPES, MODAL_WIDTH } from "../constants";
import { validateName } from "../helpers";
import { s } from "../styles";

export function CreateDialog({
  repoId,
  onClose,
  onCreated,
}: {
  repoId: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const t = useTranslations("context");
  const create = useCreateContextDocument(repoId);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ContextDocType>("specs");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!validateName(name)) {
      setError(t("create.nameRequired"));
      return;
    }
    setError(null);
    try {
      const doc = await create.mutateAsync({ type, name: name.trim() });
      onCreated(doc.path);
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("create.error"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      onClose={onClose}
      footer={
        <div style={s.dialogFoot}>
          <Button kind="ghost" onClick={onClose}>{t("create.cancel")}</Button>
          <Button kind="primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.dialogBody}>
        <FormField label={t("create.nameLabel")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.namePlaceholder")} aria-label={t("create.nameLabel")} />
        </FormField>
        <label>
          <div>{t("create.typeLabel")}</div>
          <select value={type} onChange={(e) => setType(e.target.value as ContextDocType)} style={s.select}>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>{t(`types.${d}`)}</option>
            ))}
          </select>
        </label>
        {error && <div role="alert" style={{ color: "var(--crit)", fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}
