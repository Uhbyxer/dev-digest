"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { CONTEXT_DOC_MAX_BYTES, type ContextDocType } from "@devdigest/shared";
import { useUploadContextDocument } from "@/lib/hooks/context";
import { DOC_TYPES, MODAL_WIDTH } from "../constants";
import { isMarkdownFile } from "../helpers";
import { s } from "../styles";

export function UploadDialog({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  const t = useTranslations("context");
  const upload = useUploadContextDocument(repoId);
  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState<ContextDocType>("specs");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!file) return setError(t("upload.noFile"));
    if (!isMarkdownFile(file.name)) return setError(t("upload.notMarkdown"));
    if (file.size > CONTEXT_DOC_MAX_BYTES) {
      return setError(t("upload.tooLarge", { kb: Math.round(CONTEXT_DOC_MAX_BYTES / 1024) }));
    }
    setError(null);
    try {
      await upload.mutateAsync({ type, file });
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("upload.error"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("upload.title")}
      onClose={onClose}
      footer={
        <div style={s.dialogFoot}>
          <Button kind="ghost" onClick={onClose}>{t("upload.cancel")}</Button>
          <Button kind="primary" onClick={submit} disabled={upload.isPending}>
            {upload.isPending ? t("upload.uploading") : t("upload.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.dialogBody}>
        <label>
          <div>{t("upload.fileLabel")}</div>
          <input type="file" accept=".md,text/markdown" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          <div>{t("upload.typeLabel")}</div>
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
