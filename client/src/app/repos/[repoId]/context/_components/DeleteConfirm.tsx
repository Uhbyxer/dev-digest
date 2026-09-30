"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useDeleteContextDocument } from "@/lib/hooks/context";
import { MODAL_WIDTH } from "../constants";
import { s } from "../styles";

export function DeleteConfirm({
  repoId,
  path,
  onClose,
  onDeleted,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("context");
  const del = useDeleteContextDocument(repoId);
  const [error, setError] = React.useState(false);

  const confirm = async () => {
    setError(false);
    try {
      await del.mutateAsync(path);
      onDeleted();
    } catch {
      setError(true);
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("delete.title")}
      onClose={onClose}
      footer={
        <div style={s.dialogFoot}>
          <Button kind="ghost" onClick={onClose}>{t("delete.cancel")}</Button>
          <Button kind="primary" onClick={confirm} disabled={del.isPending}>
            {del.isPending ? t("delete.deleting") : t("delete.confirm")}
          </Button>
        </div>
      }
    >
      <p>{t("delete.body", { path })}</p>
      {error && <div role="alert" style={{ color: "var(--crit)", fontSize: 13 }}>{t("delete.error")}</div>}
    </Modal>
  );
}
