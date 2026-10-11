"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton, Textarea } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { formatBytes } from "../../../../../../../../lib/format";
import { isPlaceholderFile } from "../helpers";
import { s } from "../styles";

/** Step 2 — every shipped file; only the workflow is editable (AC-3). */
export function PreviewStep({
  files,
  loading,
  error,
  onRetry,
  workflowText,
  onWorkflowChange,
}: {
  files: CiFile[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Current (possibly user-edited) workflow text. */
  workflowText: string;
  onWorkflowChange: (text: string) => void;
}) {
  const t = useTranslations("ci.exportWizard.preview");
  const [selected, setSelected] = React.useState<string | null>(null);

  if (error) return <ErrorState body={t("error")} onRetry={onRetry} />;
  if (loading || !files) return <Skeleton height={260} />;

  const current = files.find((f) => f.path === selected) ?? files[0]!;

  return (
    <div style={s.previewWrap}>
      <div>
        <h3 style={s.h3}>{t("files")}</h3>
        <div style={s.fileList} role="listbox" aria-label={t("files")}>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              role="option"
              aria-selected={f.path === current.path}
              style={s.fileRow(f.path === current.path)}
              onClick={() => setSelected(f.path)}
            >
              <span className="mono">{f.path}</span>
              <span>
                {f.editable ? (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("editable")}
                  </Badge>
                ) : (
                  <Badge>{t("readOnly")}</Badge>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        {current.editable ? (
          <>
            <div style={{ ...s.muted, marginBottom: 6 }}>{t("editHint")}</div>
            <div aria-label={t("editLabel", { path: current.path })}>
              <Textarea value={workflowText} onChange={onWorkflowChange} rows={18} mono />
            </div>
          </>
        ) : isPlaceholderFile(current) ? (
          <div style={s.placeholder}>{t("runnerPlaceholder", { size: formatBytes(current.size_bytes ?? 0) })}</div>
        ) : (
          <pre className="mono" style={s.viewer}>
            {current.contents || " "}
          </pre>
        )}
      </div>
    </div>
  );
}
