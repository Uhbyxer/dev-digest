/* hooks/skills.ts — React Query hooks for the Skills Lab, Skill Editor, Import
   modal, and the Agent Editor's Skills tab (linking). Mirrors hooks/agents.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentSkillLink, Skill, SkillType } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.patch<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

// ---- Import (T6): preview (no persistence) → confirm (persists) ----------

export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: "imported_url" | "extracted";
}

export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("file", file, file.name);
      return api.postForm<SkillImportPreview>("/skills/import/preview", form);
    },
  });
}

export function useImportSkillConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preview: SkillImportPreview) => api.post<Skill>("/skills/import/confirm", preview),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

// ---- Agent ↔ Skill linking (Agent Editor Skills tab) ----------------------

export function useAgentSkillLinks(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the whole ordered set of an agent's linked skills (attach/detach/reorder). */
export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-skills", agentId] }),
  });
}
