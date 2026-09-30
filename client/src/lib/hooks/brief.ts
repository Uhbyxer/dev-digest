/* hooks/brief.ts — React Query hooks for the PR Brief (Overview tab).
     GET  /pulls/:id/brief → { brief: PrBrief | null, stale: boolean }
     POST /pulls/:id/brief → generate / regenerate (replaces the stored Brief; stale is false). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";
import { api } from "../api";

export function useBrief(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: prId != null,
  });
}

export function useGenerateBrief(prId: string | number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (data) => qc.setQueryData(["pr-brief", prId], data),
  });
}
