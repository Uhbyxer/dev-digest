/* ContextView — Project Context page body: document list (left) + viewer (right). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { useContextDocuments } from "@/lib/hooks/context";
import { SKELETON_ROWS } from "../constants";
import { s } from "../styles";
import { DocumentList } from "./DocumentList";
import { DocumentViewer } from "./DocumentViewer";
import { ContextEmptyState } from "./ContextEmptyState";

export function ContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDocuments(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  if (isError) {
    return (
      <div style={s.center}>
        <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div style={s.center}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    );
  }

  const docs = data.documents;
  const current = docs.find((d) => d.path === selected) ?? null;

  return (
    <div style={s.layout}>
      <DocumentList repoId={repoId} docs={docs} selected={selected} onSelect={setSelected} />
      <div style={s.main}>
        {docs.length === 0 ? (
          <ContextEmptyState state={data.state} />
        ) : current ? (
          <DocumentViewer key={current.path} repoId={repoId} doc={current} onDeleted={() => setSelected(null)} />
        ) : (
          <div style={s.center}>{t("emptyState.selectDoc")}</div>
        )}
      </div>
    </div>
  );
}
