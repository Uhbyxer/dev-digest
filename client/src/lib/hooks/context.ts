/* hooks/context.ts — React Query hooks for Project Context: per-repo Context
   Documents (list/read/save/create/upload/delete/refresh) and per-owner
   (agent | skill) ordered attachments + effective-set preview.
   All URLs/paths live in CONTEXT_PATHS so they are easy to adjust. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch } from "../api";
import type {
  ContextAttachmentsResponse,
  ContextDocumentContent,
  ContextDocumentCreateRequest,
  ContextDocumentSaveRequest,
  ContextDocumentSaveResponse,
  ContextDocumentsResponse,
  ContextDocType,
  ContextOwnerType,
  EffectiveContextPreview,
  SetContextAttachmentsRequest,
} from "@devdigest/shared";

/** Single place that knows the server's URL layout. */
export const CONTEXT_PATHS = {
  documents: (repoId: string) => `/repos/${repoId}/context/documents`,
  document: (repoId: string) => `/repos/${repoId}/context/document`,
  upload: (repoId: string) => `/repos/${repoId}/context/upload`,
  refresh: (repoId: string) => `/repos/${repoId}/context/refresh`,
  owner: (type: ContextOwnerType, id: string) => `/${type === "agent" ? "agents" : "skills"}/${id}/context`,
  /** Agent: effective set; skill: what the skill alone serializes as. */
  ownerEffective: (type: ContextOwnerType, id: string) =>
    type === "agent" ? `/agents/${id}/context/effective` : `/skills/${id}/context/preview`,
};

const docsKey = (repoId: string | null | undefined) => ["context-documents", repoId] as const;
const ownerKey = (type: ContextOwnerType, id: string | null | undefined, repoId: string | null | undefined) =>
  ["context-attachments", type, id, repoId] as const;

export function useContextDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: docsKey(repoId),
    queryFn: () => api.get<ContextDocumentsResponse>(CONTEXT_PATHS.documents(repoId!)),
    enabled: !!repoId,
  });
}

export function useContextDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-document", repoId, path],
    queryFn: () =>
      api.get<ContextDocumentContent>(`${CONTEXT_PATHS.document(repoId!)}?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

export function useSaveContextDocument(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ContextDocumentSaveRequest) =>
      api.put<ContextDocumentSaveResponse>(CONTEXT_PATHS.document(repoId!), req),
    onSuccess: (res, req) => {
      if (res.conflict) return;
      qc.setQueryData(["context-document", repoId, req.path], res.document);
      void qc.invalidateQueries({ queryKey: docsKey(repoId) });
    },
  });
}

export function useCreateContextDocument(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ContextDocumentCreateRequest) =>
      api.post<ContextDocumentContent>(CONTEXT_PATHS.document(repoId!), req),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey(repoId) }),
  });
}

export function useUploadContextDocument(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, file }: { type: ContextDocType; file: File }) => {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      return api.postForm<ContextDocumentContent>(`${CONTEXT_PATHS.upload(repoId!)}?type=${type}`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey(repoId) }),
  });
}

export function useDeleteContextDocument(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      apiFetch<{ deleted: boolean }>(`${CONTEXT_PATHS.document(repoId!)}?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: docsKey(repoId) });
      void qc.invalidateQueries({ queryKey: ["context-attachments"] });
    },
  });
}

export function useRefreshContext(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ContextDocumentsResponse>(CONTEXT_PATHS.refresh(repoId!)),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey(repoId) }),
  });
}

export function useOwnerContext(
  type: ContextOwnerType,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: ownerKey(type, ownerId, repoId),
    queryFn: () =>
      api.get<ContextAttachmentsResponse>(`${CONTEXT_PATHS.owner(type, ownerId!)}?repo_id=${repoId}`),
    enabled: !!ownerId && !!repoId,
  });
}

export function useSetOwnerContext(
  type: ContextOwnerType,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => {
      const body: SetContextAttachmentsRequest = { repo_id: repoId!, paths };
      return api.put<ContextAttachmentsResponse>(CONTEXT_PATHS.owner(type, ownerId!), body);
    },
    onSuccess: (data) => {
      qc.setQueryData(ownerKey(type, ownerId, repoId), data);
      void qc.invalidateQueries({ queryKey: ["context-effective"] });
      void qc.invalidateQueries({ queryKey: docsKey(repoId) });
    },
  });
}

/** Serialized effective-set preview ("Serializes as"). Best-effort; no retry. */
export function useOwnerEffectiveContext(
  type: ContextOwnerType,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["context-effective", type, ownerId, repoId],
    queryFn: () =>
      api.get<EffectiveContextPreview>(`${CONTEXT_PATHS.ownerEffective(type, ownerId!)}?repo_id=${repoId}`),
    enabled: enabled && !!ownerId && !!repoId,
    retry: false,
  });
}
