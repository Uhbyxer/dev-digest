import { z } from 'zod';

/**
 * Schema names + shapes for the intent-generation flow (mirrors the
 * conventions module's schemas.ts naming: `CONVENTION_*_SCHEMA_NAME`).
 * FIXED CONTRACTS — server/src/modules/reviews/intent/service.ts codes
 * against these exact string values via `StructuredRequest.schemaName`.
 *
 * Neither schema carries `confidence`/`sources` — those are computed
 * DETERMINISTICALLY from which signals were available (see confidence.ts),
 * never self-reported by the LLM.
 */
export const INTENT_GENERATION_SCHEMA_NAME = 'IntentGeneration';
export const QUARANTINE_EXTRACTION_SCHEMA_NAME = 'QuarantineExtraction';

/** Raw LLM output for the main intent-derivation call. */
export const IntentGenerationResult = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type IntentGenerationResult = z.infer<typeof IntentGenerationResult>;

/**
 * Raw LLM output for the quarantine-extraction call over a fetched linked-spec
 * document. This structured result — never the raw fetched text — is what
 * reaches the main intent prompt (decision #3: dual-LLM quarantine pattern).
 */
export const QuarantineExtractionResult = z.object({
  summary: z.string(),
  key_requirements: z.array(z.string()),
});
export type QuarantineExtractionResult = z.infer<typeof QuarantineExtractionResult>;
