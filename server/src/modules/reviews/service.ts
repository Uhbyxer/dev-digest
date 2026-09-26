import type { Container } from '../../platform/container.js';
import type { FindingActionKind, RunEventKind, RunTrace, SmartDiff } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow, PullRow } from '../../db/rows.js';
import * as schema from '../../db/schema.js';
import { ReviewRepository } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { buildSmartDiff } from './smart-diff/service.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.container.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.container.runBus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const { pull, repo, jobs } = await this.createRunJobs(workspaceId, prId, targets);
    const runs = jobs.map(({ agent, runId }) => ({
      run_id: runId,
      agent_id: agent.id,
      agent_name: agent.name,
    }));

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  /**
   * MCP's blocking counterpart to `runReview`. Creates the same agent_run rows
   * via the SAME `createRunJobs` helper and calls the SAME executor, but
   * AWAITS it instead of firing-and-forgetting — so MCP-triggered and
   * UI-triggered reviews run identical code and can never drift. Returns the
   * freshly-created reviews directly (filtered to this call's run ids, so a
   * PR with older review history isn't included).
   *
   * `executeRuns` isolates per-agent failures (and a total pre-work failure,
   * e.g. diff load) internally — it never rejects, it just leaves the failed
   * run(s) with no review row. Silently returning fewer reviews than targets
   * requested would read as "clean PR" to a caller, so any run that didn't
   * produce a review is surfaced as a thrown error instead, quoting each
   * failed agent's recorded error.
   */
  async runReviewBlocking(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<ReviewDto[]> {
    const { pull, repo, jobs } = await this.createRunJobs(workspaceId, prId, targets);
    await this.executor.executeRuns(workspaceId, pull, repo, jobs, logger);

    const runIds = jobs.map((j) => j.runId);
    const dtos = await this.dtosForRunIds(workspaceId, prId, runIds);

    if (dtos.length < jobs.length) {
      const produced = new Set(dtos.map((d) => d.run_id));
      const missing = jobs.filter((j) => !produced.has(j.runId));
      const runsById = new Map(
        (await this.repo.listRunsForPull(workspaceId, prId)).map((r) => [r.run_id, r]),
      );
      const detail = missing
        .map((j) => `${j.agent.name}: ${runsById.get(j.runId)?.error ?? 'no result recorded'}`)
        .join('; ');
      throw new AppError('review_run_failed', `One or more agent runs failed: ${detail}`, 502);
    }

    return dtos;
  }

  /**
   * Shared setup for `runReview` / `runReviewBlocking`: resolve the pull +
   * repo and create one `agent_runs` row (status='running') per target agent
   * up front, so a runId exists before the (slow) executor starts.
   */
  private async createRunJobs(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
  ): Promise<{
    pull: PullRow;
    repo: typeof schema.repos.$inferSelect;
    jobs: { agent: AgentRow; runId: string }[];
  }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      jobs.push({ agent, runId });
    }
    return { pull, repo, jobs };
  }

  /** DTOs for reviews whose `run_id` is one of `runIds` (this call's own runs). */
  private async dtosForRunIds(
    workspaceId: string,
    prId: string,
    runIds: string[],
  ): Promise<ReviewDto[]> {
    const dtos = await this.reviewsForPull(workspaceId, prId);
    return dtos.filter((d) => d.run_id != null && runIds.includes(d.run_id));
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.container.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  /**
   * Smart Diff: the PR's files grouped by role, with each file's
   * `finding_lines` drawn from the UNION of findings across every persisted
   * review for this PR (not just the newest) — matching how the Findings tab
   * already aggregates, and the only option given multi-agent runs have no
   * shared batch id to key a "latest" off of. A finding counts regardless of
   * accept/dismiss state.
   */
  async smartDiffForPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([
      this.repo.getPrFiles(prId),
      this.repo.reviewsForPull(prId),
    ]);

    const findingLinesByPath = new Map<string, number[]>();
    for (const { findings } of reviews) {
      for (const f of findings) {
        const list = findingLinesByPath.get(f.file) ?? [];
        if (!list.includes(f.startLine)) list.push(f.startLine);
        findingLinesByPath.set(f.file, list);
      }
    }
    for (const lines of findingLinesByPath.values()) lines.sort((a, b) => a - b);

    return buildSmartDiff(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
      findingLinesByPath,
    );
  }
}
