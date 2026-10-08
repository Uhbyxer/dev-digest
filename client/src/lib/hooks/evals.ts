/* hooks/evals.ts — React Query hooks for the Eval Pipeline: an agent's Eval
   cases, running it over them, run history, and the Eval Dashboard. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentEvalCase, AgentEvalRun, AgentEvalRunDetail } from "@devdigest/shared";

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<AgentEvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-runs", { agentId }],
    queryFn: () => api.get<AgentEvalRun[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/** Every run in the workspace, newest first (Eval Dashboard). */
export function useAllEvalRuns() {
  return useQuery({
    queryKey: ["eval-runs", "all"],
    queryFn: () => api.get<AgentEvalRun[]>("/eval-runs"),
  });
}

export function useEvalRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", id],
    queryFn: () => api.get<AgentEvalRunDetail>(`/eval-runs/${id}`),
    enabled: !!id,
  });
}

/** Turn an accepted/dismissed finding into an Eval case of its agent. */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<AgentEvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: (c) => qc.invalidateQueries({ queryKey: ["eval-cases", c.agent_id] }),
  });
}

/** Run the agent over all its cases. Calls the LLM once per case — can take a while. */
export function useRunAgentEvals(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AgentEvalRunDetail>(`/agents/${agentId}/eval-runs`, undefined, { timeoutMs: 600_000 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-runs"] }),
  });
}
