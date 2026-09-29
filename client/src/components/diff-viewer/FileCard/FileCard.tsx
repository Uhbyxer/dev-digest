/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { type DiffFindingApi } from "../findings";
import { type DiffTarget } from "../target";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findingApi,
  target,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Findings threaded into this file's lines (Smart Diff / Original order). */
  findingApi?: DiffFindingApi;
  /** When this is the target file: force it open and scroll to the target line. */
  target?: DiffTarget;
}) {
  const t = useTranslations("shell");
  const isTarget = target?.file === file.path;
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES || isTarget
  );
  const cardRef = React.useRef<HTMLDivElement>(null);
  const targetLine = isTarget ? target?.line : undefined;
  React.useEffect(() => {
    if (isTarget) setOpen(true);
  }, [isTarget, target?.file, targetLine]);
  // Scroll once the file is open: to the line when it is rendered, else to the file.
  React.useEffect(() => {
    if (!isTarget || !open) return;
    const row =
      targetLine !== undefined
        ? cardRef.current?.querySelector(`[data-new-line="${targetLine}"]`)
        : null;
    (row ?? cardRef.current)?.scrollIntoView?.({ block: "center" });
  }, [isTarget, open, targetLine]);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const fileFindings = React.useMemo(
    () => findingApi?.byPath.get(file.path) ?? [],
    [findingApi, file.path]
  );
  const hasFindings = fileFindings.length > 0;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div ref={cardRef} style={s.fileCard} data-file={file.path}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {hasFindings && (
          <span
            data-testid="finding-dot"
            title={t("diffViewer.hasFindings")}
            aria-label={t("diffViewer.hasFindings")}
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: "var(--crit)",
              flexShrink: 0,
            }}
          />
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                highlight={targetLine !== undefined && ln.newNo === targetLine && ln.kind !== "del"}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={fileFindings}
                findingApi={findingApi}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
