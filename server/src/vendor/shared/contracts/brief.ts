import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
/**
 * `stated` vs `inferred` is computed DETERMINISTICALLY in reviewer-core from
 * which signals were actually available (e.g. did the PR have a substantive
 * description) — never self-reported by the LLM. See
 * reviewer-core/src/intent/confidence.ts.
 */
export const IntentConfidence = z.enum(['stated', 'inferred']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSource = z.enum([
  'title',
  'description',
  'linked_ticket',
  'linked_spec',
  'diff_stats',
  'commit_messages',
]);
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** Passed through unchanged from repo-intel's `BlastResult` (T1 ripgrep
   *  fallback / no persistent index yet vs T3 persistent-index path). */
  degraded: z.boolean().optional(),
  reason: z.string().optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  /** Verified against the PR's files / Blast callers — at least one (ADR-0004). */
  file_refs: z.array(z.string()).min(1),
});
export type Risk = z.infer<typeof Risk>;

export const MAX_BRIEF_RISKS = 5;
export const MAX_REVIEW_FOCUS = 5;

export const Risks = z.object({
  risks: z.array(Risk).max(MAX_BRIEF_RISKS),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Review focus ----
/** "Read these first". `line` is present only when it lies in a changed range of `file`. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().positive().optional(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

// ---- Composed PR Brief (pr_brief.json) ----
/** Facts the Brief was built without; told to the model as "not available". */
export const BriefMissing = z.enum(['intent', 'blast']);
export type BriefMissing = z.infer<typeof BriefMissing>;

export const PrBrief = z.object({
  summary: z.string(),
  /** Null when Intent was unavailable at generation time (see `missing`). */
  intent: Intent.nullable(),
  /** Null when Blast radius was unavailable at generation time (see `missing`). */
  blast: BlastRadius.nullable(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem).max(MAX_REVIEW_FOCUS),
  /** Not part of the Brief card (out of scope, ADR-0004). */
  history: PrHistory.optional(),
  /** PR head commit the Brief was generated for; differs from the PR's ⇒ stale. */
  head_sha: z.string(),
  generated_at: z.string(),
  missing: z.array(BriefMissing),
});
export type PrBrief = z.infer<typeof PrBrief>;

export const PrBriefResponse = z.object({
  brief: PrBrief.nullable(),
  /** True when the PR head commit changed since generation. Display only. */
  stale: z.boolean(),
});
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
