import { z } from 'zod';

/** `StructuredRequest.schemaName` for the PR Brief generation call. */
export const BRIEF_SCHEMA_NAME = 'PrBriefGeneration';

/**
 * What the LLM writes for a PR Brief (ADR-0004): only judgement. Facts (intent,
 * blast radius, head sha, missing data) are attached by the server. Every
 * `file` / `line` here is a CLAIM — the model never sees diff hunks — and is
 * checked in verify.ts before it can reach the Brief. Deliberately permissive
 * (no max / min): the server truncates and drops rather than re-asking.
 */
export const BriefLlmResult = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().nullish(),
      reason: z.string(),
    }),
  ),
});
export type BriefLlmResult = z.infer<typeof BriefLlmResult>;
