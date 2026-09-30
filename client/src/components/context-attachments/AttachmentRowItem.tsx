/* One row of the attachments checklist: checkbox, drag handle, move buttons,
   type/missing badges, inline read-only preview. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, Markdown } from "@devdigest/ui";
import { formatBytes } from "../../lib/format";
import { useContextDocument } from "../../lib/hooks/context";
import { CONTEXT_TYPE_COLOR } from "./constants";
import { baseName, folderLabel, type AttachmentRow } from "./helpers";
import { s } from "./styles";

interface Props {
  row: AttachmentRow;
  repoId: string;
  index: number;
  attachedCount: number;
  onToggle: (path: string) => void;
  onMove: (path: string, delta: number) => void;
  onDragStart: (path: string) => void;
  onDrop: (path: string) => void;
}

export function AttachmentRowItem({ row, repoId, index, attachedCount, onToggle, onMove, onDragStart, onDrop }: Props) {
  const t = useTranslations("context");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useContextDocument(open && !row.missing ? repoId : null, row.path);
  const type = row.doc?.type;

  return (
    <li
      data-testid={`ctx-row-${row.path}`}
      style={s.row}
      draggable={row.attached}
      onDragStart={() => row.attached && onDragStart(row.path)}
      onDragOver={(e) => row.attached && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (row.attached) onDrop(row.path);
      }}
    >
      <div style={s.rowMain}>
        {row.attached && (
          <span aria-hidden="true" title={t("attachments.dragHandle", { path: row.path })} style={{ cursor: "grab", display: "inline-flex" }}>
            <Icon.GripVertical size={14} />
          </span>
        )}
        <Checkbox checked={row.attached} onChange={() => onToggle(row.path)} label={<span className="mono">{baseName(row.path)}</span>} />
        <span style={s.folder}>{folderLabel(row.path)}</span>
        {row.doc && (
          <span style={s.folder}>
            {formatBytes(row.doc.size)} · {t("attachments.tokens", { count: row.doc.tokens })}
          </span>
        )}
        {row.missing && (
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="AlertTriangle">
            <span title={t("attachments.missingHint")}>{t("attachments.missing")}</span>
          </Badge>
        )}
        <span style={s.rowRight}>
          {row.attached && (
            <>
              <button
                type="button"
                style={s.miniBtn}
                aria-label={t("attachments.moveUp", { path: row.path })}
                disabled={index === 0}
                onClick={() => onMove(row.path, -1)}
              >
                <Icon.ArrowUp size={12} />
              </button>
              <button
                type="button"
                style={s.miniBtn}
                aria-label={t("attachments.moveDown", { path: row.path })}
                disabled={index === attachedCount - 1}
                onClick={() => onMove(row.path, 1)}
              >
                <Icon.ArrowDown size={12} />
              </button>
            </>
          )}
          {type && (
            <Badge color={CONTEXT_TYPE_COLOR[type]}>{t(`types.${type}`)}</Badge>
          )}
          {!row.missing && (
            <button
              type="button"
              style={s.miniBtn}
              aria-expanded={open}
              aria-label={open ? t("attachments.hidePreview") : t("attachments.previewFor", { path: row.path })}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon.Eye size={12} /> {t("attachments.preview")}
            </button>
          )}
        </span>
      </div>
      {open && (
        <div style={s.previewBox}>
          {isLoading || !data ? "…" : <Markdown untrusted>{data.content}</Markdown>}
        </div>
      )}
    </li>
  );
}
