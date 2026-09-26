/* hooks/blast.ts — React Query hooks for the Blast Radius + Prior PRs panels
   on PR Overview (issue #32). Both read from server-computed contracts —
   GET /pulls/:id/blast and GET /pulls/:id/pr-history — no client-side
   re-derivation of the map. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/** GET /pulls/:id/blast — the PR's blast radius (callers/endpoints/crons). */
export function useBlastRadius(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** GET /pulls/:id/pr-history — prior PRs that touched the same changed symbols. */
export function usePrHistory(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/pr-history`),
    enabled: !!prId,
  });
}
