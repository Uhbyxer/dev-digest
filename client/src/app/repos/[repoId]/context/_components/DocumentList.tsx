/* DocumentList — left rail: add / upload / refresh actions, doc list, index status. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { formatBytes } from "@/lib/format";
import { useRefreshContext } from "@/lib/hooks/context";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { baseName, sortDocuments } from "../helpers";
import { s } from "../styles";
import { CreateDialog } from "./CreateDialog";
import { UploadDialog } from "./UploadDialog";

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 12,
  cursor: "pointer",
};

export function DocumentList({
  repoId,
  docs,
  selected,
  onSelect,
}: {
  repoId: string;
  docs: ContextDocument[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  const refresh = useRefreshContext(repoId);
  const { data: index } = useRepoIntelStatus(repoId);
  const [dialog, setDialog] = React.useState<"create" | "upload" | null>(null);

  return (
    <aside style={s.side}>
      <div style={s.sideHead}>
        <div style={s.eyebrow}>{t("list.title")}</div>
        <div className="mono" style={s.folders}>{t("page.folders")}</div>
        <div style={s.actions}>
          <button type="button" style={iconBtn} onClick={() => setDialog("create")}>
            <Icon.Plus size={13} /> {t("list.newDoc")}
          </button>
          <button type="button" style={iconBtn} onClick={() => setDialog("upload")}>
            <Icon.Upload size={13} /> {t("list.upload")}
          </button>
          <button
            type="button"
            style={iconBtn}
            aria-label={t("list.refresh")}
            title={t("list.refresh")}
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <Icon.RefreshCw size={13} />
          </button>
        </div>
      </div>
      <ul style={s.list} aria-label={t("list.filesLabel")}>
        {sortDocuments(docs).map((d) => (
          <li key={d.path}>
            <button
              type="button"
              style={s.item(d.path === selected)}
              aria-current={d.path === selected ? "true" : undefined}
              onClick={() => onSelect(d.path)}
            >
              <Icon.FileText size={13} />
              <span className="mono">{baseName(d.path)}</span>
              <span style={s.itemMeta}>
                {d.type}/ · {formatBytes(d.size)} · {t("list.tokens", { count: d.tokens })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div style={s.sideFoot}>
        {t("list.count", { count: docs.length })}
        {index ? ` · ${t("indexStatus", { status: index.status })}` : null}
      </div>
      {dialog === "create" && <CreateDialog repoId={repoId} onClose={() => setDialog(null)} onCreated={onSelect} />}
      {dialog === "upload" && <UploadDialog repoId={repoId} onClose={() => setDialog(null)} />}
    </aside>
  );
}
