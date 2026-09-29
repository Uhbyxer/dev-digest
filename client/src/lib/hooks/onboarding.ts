/* hooks/onboarding.ts — React Query hooks for the per-repo Onboarding Tour.
     GET  /repos/:id/onboarding → { tour: OnboardingTour | null }
     POST /repos/:id/onboarding → generate / regenerate (replaces the stored Tour). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { api } from "../api";

export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding-tour", repoId],
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
  });
}

export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    onSuccess: (data) => qc.setQueryData(["onboarding-tour", repoId], data),
  });
}
