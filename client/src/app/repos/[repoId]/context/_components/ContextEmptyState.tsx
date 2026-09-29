"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { ContextDocumentsResponse } from "@devdigest/shared";

export function ContextEmptyState({ state }: { state: ContextDocumentsResponse["state"] }) {
  const t = useTranslations("context");
  const key = state === "no_clone" ? "noClone" : state === "no_folders" ? "noFolders" : "noDocs";
  return <EmptyState icon="Folder" title={t(`emptyState.${key}.title`)} body={t(`emptyState.${key}.body`)} />;
}
