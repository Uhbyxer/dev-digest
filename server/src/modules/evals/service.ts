import type { Container } from '../../platform/container.js';
import type {
  AgentEvalCase,
  AgentEvalRun,
  AgentEvalRunDetail,
  EvalExpectation,
  Provider,
  SkillSource,
} from '@devdigest/shared';
import {
  reviewPullRequest,
  scoreEvalRun,
  type EvalCaseOutcome,
  type PromptSkill,
} from '@devdigest/reviewer-core';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { withTimeout } from '../../platform/resilience.js';
import { findingContext } from '../reviews/repository/review.repo.js';
import { AgentsRepository } from '../agents/repository.js';
import * as repo from './repository.js';
import type { EvalCaseRow, EvalRunGroupRow } from './repository.js';

const RUN_LIST_LIMIT = 100;
/** Hard cap per case: a stuck provider call must not hang the whole run. */
const CASE_TIMEOUT_MS = 120_000;
const EXPECTATION_TYPE_BY_DECISION = { accepted: 'must_find', dismissed: 'must_not_flag' } as const;

const toCaseDto = (row: EvalCaseRow): AgentEvalCase => ({
  id: row.id,
  agent_id: row.ownerId,
  name: row.name,
  input_diff: row.inputDiff ?? '',
  expectation: row.expectedOutput as EvalExpectation,
});

const toRunDto = (group: EvalRunGroupRow, agentName: string | null): AgentEvalRun => ({
  id: group.id,
  agent_id: group.agentId,
  agent_name: agentName,
  ran_at: group.ranAt.toISOString(),
  system_prompt: group.systemPrompt,
  model: group.model,
  recall: group.recall,
  precision: group.precision,
  citation_accuracy: group.citationAccuracy,
  cases_total: group.casesTotal,
  cases_passed: group.casesPassed,
  duration_ms: group.durationMs,
  cost_usd: group.costUsd,
});

/** Eval Pipeline: cases from findings, runs of an agent over its cases. */
export class EvalsService {
  private agents: AgentsRepository;

  constructor(private container: Container) {
    this.agents = new AgentsRepository(container.db);
  }

  /**
   * Snapshot a decided finding as an Eval case of the agent that produced it:
   * accepted → must_find, dismissed → must_not_flag. Idempotent per
   * (agent, type, file, lines).
   */
  async createFromFinding(workspaceId: string, findingId: string): Promise<AgentEvalCase> {
    const db = this.container.db;
    const ctx = await findingContext(db, findingId);
    if (!ctx || ctx.review.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding, review } = ctx;
    if (!review.agentId) throw new AppError('validation_error', 'Finding has no agent to attach an eval case to');

    const decision = finding.acceptedAt ? 'accepted' : finding.dismissedAt ? 'dismissed' : null;
    if (!decision) throw new AppError('validation_error', 'Accept or dismiss the finding first');

    const expectation: EvalExpectation = {
      type: EXPECTATION_TYPE_BY_DECISION[decision],
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      title: finding.title,
    };

    const existing = (await repo.listCases(db, workspaceId, review.agentId)).find((c) => {
      const e = c.expectedOutput as EvalExpectation;
      return (
        e.type === expectation.type &&
        e.file === expectation.file &&
        e.start_line === expectation.start_line &&
        e.end_line === expectation.end_line
      );
    });
    if (existing) return toCaseDto(existing);

    const patch = await repo.getPrFilePatch(db, review.prId, finding.file);
    if (!patch) throw new AppError('validation_error', `No diff stored for ${finding.file}`);
    const inputDiff = `diff --git a/${finding.file} b/${finding.file}\n--- a/${finding.file}\n+++ b/${finding.file}\n${patch}`;

    const row = await repo.insertCase(db, {
      workspaceId,
      ownerKind: 'agent',
      ownerId: review.agentId,
      name: `${expectation.type}: ${finding.title}`,
      inputDiff,
      inputMeta: { pr_id: review.prId, finding_id: finding.id },
      expectedOutput: expectation,
    });
    return toCaseDto(row);
  }

  async listCases(workspaceId: string, agentId: string): Promise<AgentEvalCase[]> {
    return (await repo.listCases(this.container.db, workspaceId, agentId)).map(toCaseDto);
  }

  /** Run the agent, as configured now, over every Eval case and store the scored run. */
  async run(workspaceId: string, agentId: string): Promise<AgentEvalRunDetail> {
    const db = this.container.db;
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cases = await repo.listCases(db, workspaceId, agentId);
    if (cases.length === 0) throw new AppError('validation_error', 'This agent has no eval cases yet');

    const llm = await this.container.llm(agent.provider as Provider);
    const skills: PromptSkill[] = (await this.agents.linkedSkills(agent.id))
      .filter((l) => l.skill.enabled)
      .map((l) => ({ body: l.skill.body, source: l.skill.source as SkillSource }));

    const started = Date.now();
    // Cases run in parallel; a case that errors (provider failure/timeout) is recorded as
    // failed and left out of the scores, so one flaky call doesn't void the whole run.
    const settled = await Promise.all(
      cases.map(async (evalCase) => {
        const caseStarted = Date.now();
        try {
          const outcome = await withTimeout(
            reviewPullRequest({
              systemPrompt: agent.systemPrompt,
              model: agent.model,
              diff: parseUnifiedDiff(evalCase.inputDiff ?? ''),
              llm,
              strategy: 'single-pass',
              ...(skills.length > 0 ? { skills } : {}),
              task: 'Review this change.',
            }),
            CASE_TIMEOUT_MS,
          );
          const scored: EvalCaseOutcome = {
            expectation: evalCase.expectedOutput as EvalExpectation,
            findings: outcome.review.findings.map((f) => ({
              file: f.file,
              start_line: f.start_line,
              end_line: f.end_line,
            })),
            dropped: outcome.dropped.length,
          };
          return { evalCase, scored, error: null, durationMs: Date.now() - caseStarted, costUsd: outcome.costUsd };
        } catch (err) {
          return { evalCase, scored: null, error: (err as Error).message, durationMs: Date.now() - caseStarted, costUsd: null };
        }
      }),
    );

    const done = settled.filter((c) => c.scored !== null);
    if (done.length === 0) {
      throw new AppError('llm_failed', `Every eval case failed: ${settled[0]!.error}`, 502);
    }
    const score = scoreEvalRun(done.map((c) => c.scored!));
    const scoredPass = new Map(done.map((c, i) => [c.evalCase.id, score.per_case[i]!.pass]));
    const costUsd = done.reduce<number | null>(
      (sum, c) => (sum === null || c.costUsd === null ? null : sum + c.costUsd),
      0,
    );
    const group = await repo.insertRunGroup(
      db,
      {
        workspaceId,
        agentId,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        casesTotal: cases.length,
        casesPassed: score.cases_passed,
        durationMs: Date.now() - started,
        costUsd,
      },
      settled.map((c) => ({
        caseId: c.evalCase.id,
        actualOutput: c.scored
          ? { findings: c.scored.findings, dropped: c.scored.dropped }
          : { findings: [], dropped: 0, error: c.error },
        pass: scoredPass.get(c.evalCase.id) ?? false,
        durationMs: c.durationMs,
        costUsd: c.costUsd,
      })),
    );
    return this.getRun(workspaceId, group.id);
  }

  async listRuns(workspaceId: string, agentId?: string): Promise<AgentEvalRun[]> {
    const rows = await repo.listRunGroups(this.container.db, workspaceId, {
      ...(agentId ? { agentId } : {}),
      limit: RUN_LIST_LIMIT,
    });
    return rows.map((r) => toRunDto(r.group, r.agentName));
  }

  async getRun(workspaceId: string, groupId: string): Promise<AgentEvalRunDetail> {
    const found = await repo.getRunGroup(this.container.db, workspaceId, groupId);
    if (!found) throw new NotFoundError('Eval run not found');
    const rows = await repo.runsOfGroup(this.container.db, groupId);
    const results = rows.map(({ run, evalCase }) => {
      const actual = (run.actualOutput ?? { findings: [], dropped: 0 }) as {
        findings: unknown[];
        dropped: number;
        error?: string;
      };
      return {
        case_id: evalCase.id,
        case_name: evalCase.name,
        expectation: evalCase.expectedOutput as EvalExpectation,
        pass: run.pass ?? false,
        findings: actual.findings.length,
        dropped: actual.dropped,
        error: actual.error ?? null,
      };
    });
    return { ...toRunDto(found.group, found.agentName), results };
  }
}
