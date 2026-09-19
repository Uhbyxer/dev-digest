/* ImportSkillModal — upload (markdown or zip) → preview → confirm. Nothing is
   saved until the user explicitly confirms the (possibly edited) preview
   (CONTEXT.md "Import (skill)" / user story #18). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import {
  useImportSkillPreview,
  useImportSkillConfirm,
  type SkillImportPreview,
} from "../../../../../../lib/hooks/skills";
import { SKILL_TYPE_VALUES } from "../SkillEditorModal/constants";
import { s } from "./styles";

const MODAL_WIDTH = 560;

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const preview = useImportSkillPreview();
  const confirm = useImportSkillConfirm();
  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`types.${v}`) }));

  // Guards against an out-of-order response: if the user picks a second file
  // before the first one's preview resolves, only the LATEST request's result
  // may populate the form — a slow-to-parse first file must never clobber a
  // faster second one that arrived and was already shown.
  const requestSeq = React.useRef(0);

  const onFile = async (f: File) => {
    const seq = ++requestSeq.current;
    setFile(f);
    setParsed(null);
    const result = await preview.mutateAsync(f).catch(() => null);
    if (result && seq === requestSeq.current) setParsed(result);
  };

  const doConfirm = async () => {
    if (!parsed) return;
    await confirm.mutateAsync(parsed);
    onClose();
  };

  const errorMessage =
    preview.isError || confirm.isError
      ? t("import.previewError", {
          message:
            (preview.error as Error | undefined)?.message ??
            (confirm.error as Error | undefined)?.message ??
            t("import.genericError"),
        })
      : null;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            onClick={doConfirm}
            disabled={!parsed || confirm.isPending}
          >
            {confirm.isPending ? t("import.confirming") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.dropZone}>
          <input
            type="file"
            accept=".md,.zip,text/markdown,application/zip"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {t("import.dropLabel")}
        </label>
        {file && <div style={s.fileName}>{t("import.chosenFile", { name: file.name })}</div>}

        {errorMessage && <div style={s.error}>{errorMessage}</div>}

        {parsed && (
          <>
            <div style={s.previewTitle}>{t("import.previewTitle")}</div>
            <div style={s.hint}>{t("import.previewHint")}</div>
            <FormField label={t("editor.fields.name")} required>
              <TextInput
                value={parsed.name}
                onChange={(v) => setParsed({ ...parsed, name: v })}
              />
            </FormField>
            <FormField label={t("editor.fields.description")} required>
              <TextInput
                value={parsed.description}
                onChange={(v) => setParsed({ ...parsed, description: v })}
              />
            </FormField>
            <FormField label={t("editor.fields.type")}>
              <SelectInput
                value={parsed.type}
                onChange={(v) => setParsed({ ...parsed, type: v as SkillType })}
                options={typeOptions}
              />
            </FormField>
            <FormField label={t("editor.fields.body")} required>
              <Textarea
                value={parsed.body}
                onChange={(v) => setParsed({ ...parsed, body: v })}
                rows={10}
                mono
              />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
