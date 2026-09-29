/* ContextAttachments — shared checklist for the Agent and Skill "Context"
   tabs: toggle attach, reorder (drag OR keyboard-operable move buttons with an
   aria-live announcement), filter, inline preview, "N of M attached", missing
   badge, token total with >8k warning, 100 KB refusal. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import {
  CONTEXT_DOC_MAX_BYTES,
  CONTEXT_TOKEN_WARN_THRESHOLD,
  type ContextOwnerType,
} from "@devdigest/shared";
import {
  useContextDocuments,
  useOwnerContext,
  useOwnerEffectiveContext,
  useSetOwnerContext,
} from "../../lib/hooks/context";
import { AttachmentRowItem } from "./AttachmentRowItem";
import { buildRows, dropOnto, movePath, toggleAttachment } from "./helpers";
import { s } from "./styles";

interface Props {
  ownerType: ContextOwnerType;
  ownerId: string;
  repoId: string | null | undefined;
}

export function ContextAttachments({ ownerType, ownerId, repoId }: Props) {
  const t = useTranslations("context");
  const docsQ = useContextDocuments(repoId);
  const ownerQ = useOwnerContext(ownerType, ownerId, repoId);
  const setAtt = useSetOwnerContext(ownerType, ownerId, repoId);
  const isSkill = ownerType === "skill";
  const effQ = useOwnerEffectiveContext(ownerType, ownerId, repoId, isSkill);

  const [search, setSearch] = React.useState("");
  const [paths, setPaths] = React.useState<string[]>([]);
  const [announce, setAnnounce] = React.useState("");
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const dragRef = React.useRef<string | null>(null);

  const serverKey = ownerQ.data
    ? JSON.stringify(ownerQ.data.attachments.map((a) => [a.path, a.order]))
    : "";
  React.useEffect(() => {
    if (ownerQ.data) {
      setPaths(ownerQ.data.attachments.slice().sort((a, b) => a.order - b.order).map((a) => a.path));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, ownerId]);

  if (!repoId) return <div style={s.wrap}><span style={s.note}>{t("attachments.noRepo")}</span></div>;
  if (docsQ.isError || ownerQ.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState
          body={t("attachments.loadError")}
          onRetry={() => {
            void docsQ.refetch();
            void ownerQ.refetch();
          }}
        />
      </div>
    );
  }
  if (docsQ.isLoading || ownerQ.isLoading || !docsQ.data) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <Skeleton height={140} />
      </div>
    );
  }

  const docs = docsQ.data.documents;
  if (docs.length === 0 && paths.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState
          icon="Folder"
          title={t("attachments.empty")}
          body={
            <Link href={`/repos/${repoId}/context`} style={{ color: "var(--accent-text)" }}>
              {t("attachments.emptyLink")}
            </Link>
          }
        />
      </div>
    );
  }

  const persist = (next: string[]) => {
    const previous = paths;
    setPaths(next);
    // Roll the optimistic order back if the server refuses (422 too large / missing).
    setAtt.mutate(next, { onError: () => setPaths(previous) });
  };

  const onToggle = (path: string) => {
    const doc = docs.find((d) => d.path === path);
    if (!paths.includes(path) && doc && doc.size > CONTEXT_DOC_MAX_BYTES) {
      setRefusal(t("attachments.tooLarge", { path, kb: Math.round(CONTEXT_DOC_MAX_BYTES / 1024) }));
      return;
    }
    setRefusal(null);
    persist(toggleAttachment(paths, path));
  };

  const onMove = (path: string, delta: number) => {
    const next = movePath(paths, path, delta);
    if (next === paths) return;
    persist(next);
    setAnnounce(t("attachments.moved", { path, position: next.indexOf(path) + 1, total: next.length }));
  };

  const onDrop = (target: string) => {
    const dragged = dragRef.current;
    dragRef.current = null;
    if (!dragged) return;
    const next = dropOnto(paths, dragged, target);
    if (next === paths) return;
    persist(next);
    setAnnounce(t("attachments.moved", { path: dragged, position: next.indexOf(dragged) + 1, total: next.length }));
  };

  const rows = buildRows(docs, paths, search);
  const total = docs.length + paths.filter((p) => !docs.some((d) => d.path === p)).length;
  const tokens = ownerQ.data?.tokens_total ?? 0;
  const over = ownerQ.data?.over_threshold ?? false;
  const serialized = effQ.data?.text;
  const saveError = setAtt.error instanceof Error ? setAtt.error.message : null;

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span style={s.title}>{isSkill ? t("attachments.skillTitle") : t("attachments.title")}</span>
        <Badge color="var(--accent-text)">{t("attachments.attached", { attached: paths.length, total })}</Badge>
        <div style={s.filter}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("attachments.filter")}
            aria-label={t("attachments.filterLabel")}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "inherit" }}
          />
        </div>
      </div>
      <p style={s.note}>{isSkill ? t("attachments.skillNote") : t("attachments.order")}</p>
      <p style={s.note}>{t("attachments.reorderHelp")}</p>

      {refusal && <div role="alert" style={s.error}>{refusal}</div>}
      {saveError && <div role="alert" style={s.error}>{t("attachments.saveError")} {saveError}</div>}

      {rows.length === 0 ? (
        <span style={s.note}>{t("attachments.noMatches")}</span>
      ) : (
        <ul style={s.list} aria-label={t("attachments.attachedList")}>
          {rows.map((row) => (
            <AttachmentRowItem
              key={row.path}
              row={row}
              repoId={repoId}
              index={paths.indexOf(row.path)}
              attachedCount={paths.length}
              onToggle={onToggle}
              onMove={onMove}
              onDragStart={(p) => (dragRef.current = p)}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}

      <div style={s.footer}>
        <span>{t("attachments.tokens", { count: tokens })}</span>
        <span style={{ marginLeft: "auto" }}>{t("attachments.injectedNote")}</span>
      </div>
      {over && (
        <div role="status" style={s.warn}>
          <Icon.AlertTriangle size={13} /> {t("attachments.overThreshold", { threshold: CONTEXT_TOKEN_WARN_THRESHOLD })}
        </div>
      )}
      {isSkill && (
        <>
          <div style={s.serializesLabel}>{t("attachments.serializesAs")}</div>
          <pre className="mono" style={s.pre}>{serialized ?? t("attachments.serializesEmpty")}</pre>
        </>
      )}
      <div aria-live="polite" role="status" style={s.srOnly}>{announce}</div>
    </div>
  );
}
