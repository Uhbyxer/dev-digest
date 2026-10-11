import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
  /** UTF-8 byte size of the real contents (the bundled runner ships `contents: ''` + its size). */
  size_bytes: z.number().int().nullish(),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** `pull_request` activity types the workflow may trigger on (comment events are never allowed). */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** How the runner posts results (GitHub review | PR comment | exit code only). */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** Request body for `POST /agents/:id/ci/export`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns them (+ a zip). */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
  base: z.string().min(1).default('main'),
  /** The user-edited workflow file (the only editable file); regenerated when omitted. */
  workflow_contents: z.string().max(65536).optional(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** Request body for `POST /agents/:id/ci/preview` (the Preview step; no repo needed yet). */
export const CiPreviewInput = z.object({
  target: CiTarget.default('gha'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;
export type CiPreviewInputBody = z.input<typeof CiPreviewInput>;

/** Response of `POST /agents/:id/ci/preview`: every file that will ship. */
export const CiPreview = z.object({
  files: z.array(CiFile),
});
export type CiPreview = z.infer<typeof CiPreview>;

/** Response of `GET /ci/readiness` — studio-local readiness only (never queries GitHub Secrets). */
export const CiReadiness = z.object({
  openrouter_key_ready: z.boolean(),
});
export type CiReadiness = z.infer<typeof CiReadiness>;

/** `pending` = PR opened/updated, not yet seen running; `active` = a CI run has been ingested. */
export const CiInstallationStatus = z.enum(['pending', 'active']);
export type CiInstallationStatus = z.infer<typeof CiInstallationStatus>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  status: CiInstallationStatus,
  workflow_version: z.string(),
  /** Last ingested run for this installation (CI tab row); null before any run. */
  last_run_status: z.string().nullish(),
  last_run_at: z.string().nullish(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/**
 * Response of `POST /agents/:id/ci/export`. For `action: 'files'` there is no
 * installation and no PR (`installation: null`, `pr_url: null`) and `zip_base64`
 * carries the archive of exactly the shipped files (runner included).
 */
export const CiExport = z.object({
  installation: CiInstallation.nullable(),
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
  zip_base64: z.string().nullish(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  // Untrusted input: bounded so counts can't be used to exhaust memory/CPU downstream.
  findings_count: z.number().int().nonnegative().max(10_000),
  critical: z.number().int().nonnegative().max(10_000).nullish(),
  warning: z.number().int().nonnegative().max(10_000).nullish(),
  suggestion: z.number().int().nonnegative().max(10_000).nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

/** Review verdict of a CI run — same rule as local runs (findings + `ci_fail_on` gate). */
export const CiRunVerdict = z.enum(['APPROVE', 'COMMENT', 'REQUEST_CHANGES']);
export type CiRunVerdict = z.infer<typeof CiRunVerdict>;

/** One CI-sourced `agent_runs` row (`source='ci'`) for the CI Runs page / CI tab history. */
export const CiRunRow = z.object({
  id: z.string(),
  ran_at: z.string(),
  installation_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  /** Run lifecycle status (`done` for an ingested run). */
  status: z.string().nullable(),
  verdict: CiRunVerdict.nullable(),
  findings_count: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  /** Link to the GitHub Actions job/run. */
  job_url: z.string().nullable(),
});
export type CiRunRow = z.infer<typeof CiRunRow>;

/** Response of `POST /ci/refresh`. `degraded` = GitHub unavailable/rate-limited; nothing was written. */
export const CiRefreshResult = z.object({
  degraded: z.boolean(),
  ingested: z.number().int(),
  skipped: z.number().int(),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;

// ===========================================================================
// Eval Pipeline — agent eval cases + eval runs (see docs/specs/eval-pipeline.md)
// ===========================================================================

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** What an agent Eval case expects at one location (stored in `expected_output`). */
export const EvalExpectation = z.object({
  type: EvalExpectationType,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** An agent Eval case as returned by the API. */
export const AgentEvalCase = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  expectation: EvalExpectation,
});
export type AgentEvalCase = z.infer<typeof AgentEvalCase>;

/** One Eval run (an agent over all its cases) with the prompt/model it used. */
export const AgentEvalRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  ran_at: z.string(),
  system_prompt: z.string(),
  model: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  cases_total: z.number().int(),
  cases_passed: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type AgentEvalRun = z.infer<typeof AgentEvalRun>;

export const AgentEvalCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string(),
  expectation: EvalExpectation,
  pass: z.boolean(),
  findings: z.number().int(),
  dropped: z.number().int(),
  /** Set when the case's model call failed; such cases are left out of the scores. */
  error: z.string().nullish(),
});
export type AgentEvalCaseResult = z.infer<typeof AgentEvalCaseResult>;

/** One Eval run plus its per-case results. */
export const AgentEvalRunDetail = AgentEvalRun.extend({
  results: z.array(AgentEvalCaseResult),
});
export type AgentEvalRunDetail = z.infer<typeof AgentEvalRunDetail>;
