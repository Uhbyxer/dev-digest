import { z } from 'zod';

/**
 * Schema names for the two-step convention-detection structured-output flow
 * (formalizes the pattern already named in server/src/adapters/mocks.ts'
 * `MockLLMOptions.structuredBySchema`). FIXED CONTRACT — the server
 * orchestration module (server/src/modules/conventions/) codes against these
 * exact string values via `StructuredRequest.schemaName`.
 */
export const CONVENTION_FILE_SELECTION_SCHEMA_NAME = 'ConventionFileSelection';
export const CONVENTION_EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

// ---------- Step 1: group sample files by shared code-style pattern ----------

export const ConventionFileGroup = z.object({
  theme: z.string(),
  files: z.array(z.string()).min(1),
  rationale: z.string(),
});
export type ConventionFileGroup = z.infer<typeof ConventionFileGroup>;

export const ConventionFileSelectionResult = z.object({
  groups: z.array(ConventionFileGroup),
});
export type ConventionFileSelectionResult = z.infer<typeof ConventionFileSelectionResult>;

// ---------- Step 2: per-group evidence-backed convention candidates ----------

export const ConventionCandidateDetection = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ConventionCandidateDetection = z.infer<typeof ConventionCandidateDetection>;

export const ConventionExtractionResult = z.object({
  candidates: z.array(ConventionCandidateDetection),
});
export type ConventionExtractionResult = z.infer<typeof ConventionExtractionResult>;
