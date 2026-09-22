/**
 * Intent-generation Zod schemas — `IntentGenerationResult` (the main
 * intent-derivation LLM output) and `QuarantineExtractionResult` (the linked-
 * spec quarantine-extraction LLM output). Neither carries confidence/sources
 * — those are computed deterministically (see confidence.ts), never
 * self-reported by the model.
 */
import { describe, it, expect } from 'vitest';
import { IntentGenerationResult, QuarantineExtractionResult } from '../src/intent/index.js';

describe('IntentGenerationResult', () => {
  it('parses a valid shape', () => {
    const result = IntentGenerationResult.safeParse({
      intent: 'Adds rate limiting to public API endpoints.',
      in_scope: ['Add limiter middleware', 'Apply it to public routes'],
      out_of_scope: ['Per-user rate limit tiers'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = IntentGenerationResult.safeParse({
      in_scope: ['Add limiter middleware'],
      out_of_scope: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong types for the array fields', () => {
    const result = IntentGenerationResult.safeParse({
      intent: 'Adds rate limiting.',
      in_scope: 'not an array',
      out_of_scope: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('QuarantineExtractionResult', () => {
  it('parses a valid shape', () => {
    const result = QuarantineExtractionResult.safeParse({
      summary: 'A plan document describing the rate-limiting rollout.',
      key_requirements: ['Must apply to all public routes', 'Must be configurable per route'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing required field', () => {
    const result = QuarantineExtractionResult.safeParse({
      key_requirements: ['Must apply to all public routes'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-array key_requirements field', () => {
    const result = QuarantineExtractionResult.safeParse({
      summary: 'A plan document.',
      key_requirements: 'not an array',
    });
    expect(result.success).toBe(false);
  });
});
