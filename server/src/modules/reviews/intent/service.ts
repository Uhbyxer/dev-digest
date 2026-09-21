import type { Intent, UnifiedDiff } from '@devdigest/shared';
import {
  buildIntentPrompt,
  buildQuarantineExtractionPrompt,
  detectLinkedSpecUrl,
  deriveIntentConfidence,
  IntentGenerationResult,
  QuarantineExtractionResult,
  INTENT_GENERATION_SCHEMA_NAME,
  QUARANTINE_EXTRACTION_SCHEMA_NAME,
} from '@devdigest/reviewer-core';
import type { Container } from '../../../platform/container.js';
import type * as t from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { upsertIntent, getCommitMessages } from '../repository/pull.repo.js';

/** Same heuristic `OctokitGitHubClient.resolveLinkedIssue` uses at PR-import
 * time — re-applied here since the resolved issue body is never persisted
 * (see server/INSIGHTS.md). Best-effort only: any failure to resolve leaves
 * `linkedTicketBody` undefined, matching the pre-existing "else omit". */
function extractLinkedIssueNumber(body: string): number | undefined {
  const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
  return m?.[1] ? Number(m[1]) : undefined;
}

/**
 * Intent-generation orchestrator (decision #5/#6 in
 * docs/plans/intent-layer.md). Modeled directly on
 * ConventionsService.detectAndInsert: resolve the feature model, call the
 * LLM, keep ALL I/O here — prompt construction stays in reviewer-core.
 *
 * Best-effort by design: this function does NOT swallow errors itself (any
 * LLM/fetch failure propagates) — the caller (run-executor.ts) is the one
 * that treats intent derivation as best-effort and logs+continues.
 */
export async function generateIntent(
  container: Container,
  workspaceId: string,
  pull: PullRow,
  repo: typeof t.repos.$inferSelect,
  diff: UnifiedDiff,
): Promise<Intent> {
  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');
  const llm = await container.llm(provider);

  // ---- Linked-spec fetch + quarantine extraction (decision #3/#4) ----------
  // The raw fetched text is discarded after this call — only the structured,
  // schema-constrained extraction result is ever passed into the main intent
  // prompt (dual-LLM quarantine pattern).
  let quarantinedSpec: QuarantineExtractionResult | undefined;
  let hasLinkedSpec = false;
  const repoFullName = `${repo.owner}/${repo.name}`;
  const candidateUrl = pull.body ? detectLinkedSpecUrl(pull.body, repoFullName) : undefined;
  if (candidateUrl) {
    const fetched = await container.linkedDocFetcher().fetchLinkedDoc(candidateUrl);
    if (fetched) {
      const extraction = await llm.completeStructured({
        model,
        schema: QuarantineExtractionResult,
        schemaName: QUARANTINE_EXTRACTION_SCHEMA_NAME,
        messages: buildQuarantineExtractionPrompt(fetched.text),
      });
      quarantinedSpec = extraction.data;
      hasLinkedSpec = true;
    }
  }

  // ---- Commit messages ------------------------------------------------------
  // Not carried on PullRow itself — pulled from the pr_commits table via the
  // repository layer (never raw Drizzle from a service — onion-architecture).
  // Best-effort: an empty result just means 'commit_messages' is omitted from
  // `sources` below.
  const commitMessages = await getCommitMessages(container.db, pull.id);

  // Linked-ticket body: GitHub's `linked_issue` is resolved only at
  // PR-import time and never persisted (see server/INSIGHTS.md), so it isn't
  // available on PullRow here — re-resolve it via the existing GitHub
  // adapter/client instead. Best-effort: any failure (no token configured,
  // API error, no #-reference in the body) leaves it undefined, matching the
  // "else omit" fallback — this must never fail intent generation.
  let linkedTicketBody: string | undefined;
  const linkedIssueNumber = pull.body ? extractLinkedIssueNumber(pull.body) : undefined;
  if (linkedIssueNumber !== undefined) {
    try {
      const github = await container.github();
      const issue = await github.getIssue({ owner: repo.owner, name: repo.name }, linkedIssueNumber);
      linkedTicketBody = issue.body ?? undefined;
    } catch {
      linkedTicketBody = undefined;
    }
  }

  const fileStats = diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));

  const messages = buildIntentPrompt({
    title: pull.title,
    description: pull.body ?? undefined,
    linkedTicketBody,
    quarantinedSpec,
    fileStats,
    commitMessages,
  });

  const generated = await llm.completeStructured({
    model,
    schema: IntentGenerationResult,
    schemaName: INTENT_GENERATION_SCHEMA_NAME,
    messages,
  });

  // Confidence/sources are computed DETERMINISTICALLY here from which signals
  // were actually available — never from the LLM's own output (decision #1).
  const { confidence, sources } = deriveIntentConfidence({
    description: pull.body ?? undefined,
    hasLinkedTicket: linkedTicketBody !== undefined,
    hasLinkedSpec,
    hasDiffStats: fileStats.length > 0,
    hasCommitMessages: commitMessages.length > 0,
  });

  const intent: Intent = {
    intent: generated.data.intent,
    in_scope: generated.data.in_scope,
    out_of_scope: generated.data.out_of_scope,
    confidence,
    sources,
  };

  await upsertIntent(container.db, pull.id, intent);
  return intent;
}
