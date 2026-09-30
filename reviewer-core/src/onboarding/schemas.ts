import { z } from 'zod';

/** `StructuredRequest.schemaName` for the Onboarding Tour generation call. */
export const ONBOARDING_SCHEMA_NAME = 'OnboardingTourGeneration';

/**
 * What the LLM writes for an Onboarding Tour. Only prose and ordering — facts
 * (critical paths, run commands) are computed deterministically by the server.
 * Every `path` here is a CLAIM: the server checks it against the index and
 * drops anything unknown (see verify.ts).
 */
export const OnboardingLlmResult = z.object({
  overview: z.string(),
  critical_path_roles: z.array(z.object({ path: z.string(), role: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(z.object({ title: z.string(), files: z.array(z.string()) })),
});
export type OnboardingLlmResult = z.infer<typeof OnboardingLlmResult>;
