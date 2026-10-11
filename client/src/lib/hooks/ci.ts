/* hooks/ci.ts — React Query hooks for Export to CI: wizard preview/export,
   CI installations, the pull-based refresh, and CI-sourced runs. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPostAs,
  CiPreview,
  CiReadiness,
  CiRefreshResult,
  CiRunRow,
  CiTarget,
  CiTrigger,
} from "@devdigest/shared";

/** Studio-local readiness of the OpenRouter key (never queries GitHub Secrets). */
export function useCiReadiness() {
  return useQuery({
    queryKey: ["ci-readiness"],
    queryFn: () => api.get<CiReadiness>("/ci/readiness"),
    staleTime: 30_000,
  });
}

export interface CiPreviewParams {
  target: CiTarget;
  post_as: CiPostAs;
  triggers: CiTrigger[];
}

/** Every file that would ship for these wizard options (POST, but read-only). */
export function useCiPreview(agentId: string, params: CiPreviewParams, enabled = true) {
  return useQuery({
    queryKey: ["ci-preview", agentId, params.target, params.post_as, [...params.triggers].sort().join(",")],
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, params),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCiExport(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportInputBody) => api.post<CiExport>(`/agents/${agentId}/ci/export`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-installations", agentId] }),
  });
}

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** Pull new results from GitHub Actions (synchronous ingest); optionally scoped to one agent. */
export function useCiRefresh(agentId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<CiRefreshResult>(`/ci/refresh${agentId ? `?agent_id=${encodeURIComponent(agentId)}` : ""}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
      qc.invalidateQueries({ queryKey: ["ci-installations"] });
    },
  });
}

/** Every CI-sourced run in the workspace (CI Runs page). */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs", "all"],
    queryFn: () => api.get<CiRunRow[]>("/ci/runs"),
  });
}

/** CI run history of one installation (CI tab row). */
export function useAgentCiRuns(agentId: string, installationId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-runs", "agent", agentId, installationId],
    queryFn: () =>
      api.get<CiRunRow[]>(`/agents/${agentId}/ci/runs?installation_id=${encodeURIComponent(installationId!)}`),
    enabled: !!installationId,
  });
}

/** Fail CI on persists through the normal agent update path (`useUpdateAgent`). */
