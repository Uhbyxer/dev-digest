/* hooks/conventions.ts — React Query hooks for the per-repo Conventions
   feature (scan, list, accept/reject/edit, merge into a new Skill). Mirrors
   hooks/skills.ts. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionStatus, Skill } from "@devdigest/shared";

export interface ConventionsResponse {
  conventions: ConventionCandidate[];
  last_scanned_at: string | null;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useScanConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ inserted: number; conventions: ConventionCandidate[]; last_scanned_at: string | null }>(
        `/repos/${repoId}/conventions/scan`,
      ),
    onSuccess: (data) => {
      // Avoid a refetch round-trip — the scan response is already the full list shape.
      qc.setQueryData(["conventions", repoId], {
        conventions: data.conventions,
        last_scanned_at: data.last_scanned_at,
      });
    },
  });
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { rule?: string; status?: ConventionStatus } }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export function useCreateSkillFromConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description: string; body: string }) =>
      api.post<Skill>(`/repos/${repoId}/conventions/create-skill`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
