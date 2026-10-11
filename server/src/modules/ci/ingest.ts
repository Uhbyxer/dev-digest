import { CiResultArtifact, type CiRefreshResult } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { parseRepo } from './service.js';
import { CiRepository, type InsertCiRun } from './repository.js';
import { blockersFromCounts, scoreFromCounts } from './verdict.js';

const WORKFLOW_FILE = 'devdigest-review.yml';
const ARTIFACT_NAME = 'devdigest-result';
const RUNS_PER_INSTALLATION = 20;

function httpStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/**
 * Pull-based CI ingest (AC-27..32). There is NO inbound route: results are
 * fetched from the GitHub Actions API on refresh.
 *
 * Two phases keep a degraded refresh clean (AC-32): (1) gather everything from
 * GitHub into memory per installation — a failing installation contributes no
 * rows and marks the refresh `degraded`, others are kept; (2) insert in one transaction (idempotent via the natural
 * unique index + ON CONFLICT DO NOTHING, AC-30).
 */
const inFlight = new Map<string, Promise<CiRefreshResult>>();

/** Concurrent refreshes for the same scope share one sweep (strict-mode/double mounts). */
export function refreshCiRuns(
  container: Container,
  workspaceId: string,
  opts: { agentId?: string } = {},
): Promise<CiRefreshResult> {
  const key = `${workspaceId}|${opts.agentId ?? 'all'}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = refreshCiRunsUncoalesced(container, workspaceId, opts).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function refreshCiRunsUncoalesced(
  container: Container,
  workspaceId: string,
  opts: { agentId?: string },
): Promise<CiRefreshResult> {
  const repo = new CiRepository(container.db);
  const installations = await repo.listTrackedGha(workspaceId, opts.agentId);
  if (installations.length === 0) return { degraded: false, ingested: 0, skipped: 0 };

  const pending: InsertCiRun[] = [];
  let skipped = 0;
  let degraded = false;
  let github: Awaited<ReturnType<Container['github']>>;
  try {
    github = await container.github();
  } catch {
    // No token / GitHub unavailable: nothing was written (AC-32).
    return { degraded: true, ingested: 0, skipped: 0 };
  }
  for (const inst of installations) {
    // Rows are buffered per installation and only kept if it fully succeeds (AC-32).
    const instRows: InsertCiRun[] = [];
    let instSkipped = 0;
    try {
      const ref = parseRepo(inst.repo);
      const known = await repo.ingestedGithubRunIds(inst.id);
      const knownRunIds = new Set([...known].map((k) => k.split(':')[0]));
      let runs: Awaited<ReturnType<typeof github.listWorkflowRuns>>;
      try {
        runs = await github.listWorkflowRuns(ref, WORKFLOW_FILE, RUNS_PER_INSTALLATION);
      } catch (err) {
        // 404 = workflow file not on the default branch yet / no runs: not an error.
        if (httpStatus(err) === 404) continue;
        throw err;
      }
      for (const run of runs) {
        if (run.status !== 'completed' || run.conclusion === 'cancelled' || run.conclusion === 'skipped') {
          continue;
        }
        // Already ingested: don't re-download the artifact.
        if (knownRunIds.has(String(run.id))) continue;
        const raw = await github.downloadRunArtifact(ref, run.id, ARTIFACT_NAME);
        const parsed = CiResultArtifact.safeParse(raw);
        // Missing / expired / invalid artifacts are skipped, never fatal (AC-31).
        if (!parsed.success) {
          instSkipped++;
          continue;
        }
        const art = parsed.data;
        const prNumber = art.pr_number ?? run.pr_numbers[0];
        if (prNumber == null) {
          instSkipped++;
          continue;
        }
        if (known.has(`${run.id}:${prNumber}`)) continue;
        instRows.push({
          workspaceId,
          agentId: inst.agentId,
          provider: inst.provider,
          model: inst.model,
          ranAt: new Date(run.created_at),
          durationMs: art.duration_ms ?? null,
          costUsd: art.cost_usd,
          findingsCount: art.findings_count,
          // Same computation as local runs, against the agent's CURRENT gate (AC-29).
          blockers: blockersFromCounts(art, inst.ciFailOn),
          score: scoreFromCounts(art),
          ciInstallationId: inst.id,
          ciPrNumber: prNumber,
          ciRepo: inst.repo,
          ciJobUrl: run.html_url,
          ciGithubRunId: run.id,
        });
      }
    } catch {
      // This installation failed (403, deleted repo, rate limit...): no partial rows
      // for it, but other installations' results are kept (AC-32).
      degraded = true;
      continue;
    }
    pending.push(...instRows);
    skipped += instSkipped;
  }

  const ingested = await repo.insertCiRuns(pending);
  return { degraded, ingested, skipped };
}
