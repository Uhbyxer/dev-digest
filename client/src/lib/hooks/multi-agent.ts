/* hooks/multi-agent.ts — React Query hooks for Multi-Agent Review: start a
   parallel fan-out over a chosen agent set and read the comparison resource
   (columns + conflicts + totals). Accept/Dismiss reuse `useFindingAction`
   (reviews.ts), which also invalidates the ["multi-agent", prId] key. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { MultiAgentRun, MultiAgentRunStarted } from "../types";

/** Poll interval while any agent column is still running (live-status fallback to SSE). */
export const MULTI_RUN_POLL_MS = 4000;

/** POST /pulls/:id/multi-agent-run — one multi_agent_run grouping N agent runs. */
export function useStartMultiAgentRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentIds: string[]) =>
      api.post<MultiAgentRunStarted>(`/pulls/${prId}/multi-agent-run`, { agentIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}

/** GET /pulls/:id/multi-agent?run= — polls ~4s while any column is running and
    stops once settled. Switching Columns/Tabs reads this same cached resource. */
export function useMultiAgentRun(
  prId: string | null | undefined,
  multiRunId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["multi-agent", prId, multiRunId],
    queryFn: () =>
      api.get<MultiAgentRun>(
        `/pulls/${prId}/multi-agent${multiRunId ? `?run=${encodeURIComponent(multiRunId)}` : ""}`,
      ),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running")
        ? MULTI_RUN_POLL_MS
        : false,
  });
}
