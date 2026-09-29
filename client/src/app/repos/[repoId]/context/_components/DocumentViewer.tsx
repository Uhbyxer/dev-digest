/* DocumentViewer — Preview/Edit for one Context Document. Preview renders via
   the safe Markdown component (no raw HTML). Unsaved edits survive save errors
   and conflicts; after a save a "local edit, not on base branch" caveat shows. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { formatBytes } from "@/lib/format";
import { useContextDocument, useSaveContextDocument } from "@/lib/hooks/context";
import { baseName } from "../helpers";
import { s } from "../styles";
import { DeleteConfirm } from "./DeleteConfirm";

type Mode = "preview" | "edit";

export function DocumentViewer({
  repoId,
  doc,
  onDeleted,
}: {
  repoId: string;
  doc: ContextDocument;
  onDeleted: () => void;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDocument(repoId, doc.path);
  const save = useSaveContextDocument(repoId);
  const [mode, setMode] = React.useState<Mode>("preview");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const text = draft ?? data?.content ?? "";
  const dirty = draft !== null && draft !== data?.content;

  const onSave = async () => {
    if (!data) return;
    setSaveFailed(false);
    setConflict(false);
    try {
      const res = await save.mutateAsync({
        path: doc.path,
        content: text,
        expected_mtime: data.mtime,
        expected_hash: data.hash,
      });
      if (res.conflict) {
        setConflict(true);
        return;
      }
      setDraft(null);
      setSaved(true);
    } catch {
      setSaveFailed(true); // draft is kept (AC-11)
    }
  };

  const onReload = async () => {
    setDraft(null);
    setConflict(false);
    await refetch();
  };

  return (
    <>
      <div style={s.mainHead}>
        <span className="mono" style={{ fontWeight: 600 }}>{baseName(doc.path)}</span>
        <div style={s.segmented} role="group">
          <button type="button" style={s.seg(mode === "preview")} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>
            {t("viewer.preview")}
          </button>
          <button type="button" style={s.seg(mode === "edit")} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
            {t("viewer.edit")}
          </button>
        </div>
        <div style={s.headRight}>
          {dirty && <span>{t("viewer.unsaved")}</span>}
          <span>{formatBytes(data?.size ?? doc.size)}</span>
          <span>{t("viewer.tokens", { count: data?.tokens ?? doc.tokens })}</span>
          <span>{t("viewer.usedBy", { count: doc.used_by ?? 0 })}</span>
          <button
            type="button"
            aria-label={t("viewer.delete")}
            title={t("viewer.delete")}
            onClick={() => setConfirmDelete(true)}
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <Icon.Trash size={14} />
          </button>
        </div>
      </div>
      <div style={s.body}>
        {isError ? (
          <ErrorState body={t("viewer.loadError")} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Skeleton height={200} />
        ) : mode === "preview" ? (
          text.trim() ? <Markdown untrusted>{text}</Markdown> : <span style={{ color: "var(--text-muted)" }}>{t("viewer.empty")}</span>
        ) : (
          <>
            <textarea
              className="mono"
              aria-label={t("viewer.editorLabel")}
              value={text}
              style={s.textarea}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
            />
            <div style={s.editFoot}>
              <Button kind="primary" onClick={onSave} disabled={!dirty || save.isPending}>
                {save.isPending ? t("viewer.saving") : t("viewer.save")}
              </Button>
              {dirty && (
                <Button kind="ghost" onClick={() => setDraft(null)}>{t("viewer.discard")}</Button>
              )}
            </div>
          </>
        )}
        {saveFailed && <div role="alert" style={s.error}>{t("viewer.saveError")}</div>}
        {conflict && (
          <div role="alert" style={s.warn}>
            {t("viewer.conflict")}{" "}
            <Button kind="ghost" size="sm" onClick={onReload}>{t("viewer.conflictReload")}</Button>
          </div>
        )}
        {saved && !dirty && (
          <div role="status" style={s.caveat}>
            {t("viewer.saved")} {t("viewer.localEditCaveat")}
          </div>
        )}
      </div>
      {confirmDelete && (
        <DeleteConfirm
          repoId={repoId}
          path={doc.path}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            onDeleted();
          }}
        />
      )}
    </>
  );
}
