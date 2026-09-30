import { z } from 'zod';

/**
 * Onboarding Tour (SPEC-02) — one stored guide per repo with exactly five
 * sections. Each section carries its own `status` so a section that could not
 * be generated never hides the others.
 */
export const OnboardingSectionStatus = z.enum(['ok', 'not_generated']);
export type OnboardingSectionStatus = z.infer<typeof OnboardingSectionStatus>;

export const OnboardingCriticalPath = z.object({
  path: z.string(),
  /** How many files import this one. */
  dependents: z.number().int().nonnegative(),
  /** One-line role; null until an LLM pass supplies it. */
  role: z.string().nullable(),
});
export type OnboardingCriticalPath = z.infer<typeof OnboardingCriticalPath>;

export const OnboardingTour = z.object({
  repo_id: z.string(),
  generated_at: z.string(),
  /** Index commit the Tour was built from (staleness compares against this). */
  index_commit_sha: z.string(),
  files_indexed: z.number().int().nonnegative(),
  /** True when built from a partial index. */
  partial_index: z.boolean(),
  /** What was sent to the LLM (null when no LLM call was made). */
  llm_input: z.object({ files: z.number().int().nonnegative(), approx_tokens: z.number().int().nonnegative() }).nullable(),
  sections: z.object({
    overview: z.object({ status: OnboardingSectionStatus, text: z.string().nullable() }),
    critical_paths: z.object({
      status: OnboardingSectionStatus,
      items: z.array(OnboardingCriticalPath),
    }),
    run_locally: z.object({
      status: OnboardingSectionStatus,
      steps: z.array(z.object({ command: z.string() })),
    }),
    reading_path: z.object({
      status: OnboardingSectionStatus,
      items: z.array(z.object({ path: z.string(), reason: z.string() })),
    }),
    first_tasks: z.object({
      status: OnboardingSectionStatus,
      items: z.array(z.object({ title: z.string(), files: z.array(z.string()) })),
    }),
  }),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingTourResponse = z.object({
  tour: OnboardingTour.nullable(),
  /** True when the current index is newer than the one the Tour was built from. Display only. */
  stale: z.boolean(),
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;
