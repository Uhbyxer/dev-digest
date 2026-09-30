import type { BlastCaller, PrBrief, PrBriefResponse } from '@devdigest/shared';
import {
  BRIEF_MAX_SPEC_CHARS,
  BRIEF_SCHEMA_NAME,
  BriefLlmResult,
  buildBriefPrompt,
  changedRanges,
  verifyBrief,
  type BriefFileFact,
  type BriefSpecDoc,
} from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { assertContextPath } from '../../adapters/context-docs/index.js';
import { AgentsRepository } from '../agents/repository.js';
import { getBlastRadiusForPr } from '../blast/service.js';
import { BASE_REF_REMOTE } from '../context/constants.js';
import { ContextRepository } from '../context/repository.js';
import { buildEffectiveRefs } from '../context/service.js';
import { RepoRepository } from '../repos/repository.js';
import { classifyFile } from '../reviews/smart-diff/classify.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { BriefRepository } from './repository.js';

/** Read a bit more than the prompt keeps so truncation, not a partial read, decides. */
const SPEC_READ_MAX_BYTES = BRIEF_MAX_SPEC_CHARS * 4;

interface Logger {
  warn(obj: object, msg: string): void;
}

export class BriefService {
  private repo: BriefRepository;
  private reposRepo: RepoRepository;
  private agentsRepo: AgentsRepository;
  private contextRepo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
    this.agentsRepo = new AgentsRepository(container.db);
    this.contextRepo = new ContextRepository(container.db);
  }

  /** The stored Brief plus whether the PR moved on since. Display only — never regenerates. */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const brief = await this.repo.get(prId);
    return { brief, stale: brief !== null && brief.head_sha !== pull.headSha };
  }

  /**
   * Build (or rebuild) and store the Brief: facts are computed, the model is
   * called exactly once, and everything it names is verified against the PR.
   * A failed call leaves any previously stored Brief in place.
   */
  async generate(workspaceId: string, prId: string, logger?: Logger): Promise<PrBrief> {
    const pull = await this.requirePull(workspaceId, prId);

    const [files, findingLines, intent, blast, specs] = await Promise.all([
      this.repo.getFiles(prId),
      this.repo.findingLines(prId),
      this.repo.getIntent(prId),
      getBlastRadiusForPr(this.container, workspaceId, prId).catch((err: Error) => {
        logger?.warn({ prId, err: err.message }, 'brief: blast radius unavailable');
        return null;
      }),
      this.loadSpecs(workspaceId, pull.repoId, logger),
    ]);

    const facts: BriefFileFact[] = files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      role: classifyFile(f.path),
      ranges: changedRanges(f.patch),
      findingLines: findingLines.get(f.path) ?? [],
    }));
    const callers: BlastCaller[] = blast ? blast.downstream.flatMap((d) => d.callers) : [];

    const { messages } = buildBriefPrompt({
      title: pull.title,
      description: pull.body,
      intent: intent ?? null,
      blast: blast ? { summary: blast.summary, callers } : null,
      files: facts,
      specs,
    });

    let result;
    try {
      const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'risk_brief');
      const llm = await this.container.llm(provider);
      result = await llm.completeStructured({
        model,
        schema: BriefLlmResult,
        schemaName: BRIEF_SCHEMA_NAME,
        messages,
      });
    } catch (err) {
      logger?.warn({ prId, err: (err as Error).message }, 'brief: generation failed');
      throw new AppError('brief_generation_failed', 'Could not generate the brief. Try again.', 502);
    }

    const verified = verifyBrief(result.data, {
      prFiles: new Map(facts.map((f) => [f.path, f.ranges])),
      blastFiles: new Set(callers.map((c) => c.file)),
    });

    const brief: PrBrief = {
      summary: verified.summary,
      intent: intent ?? null,
      blast: blast ?? null,
      risks: { risks: verified.risks },
      review_focus: verified.review_focus,
      head_sha: pull.headSha,
      generated_at: new Date().toISOString(),
      missing: [...(intent ? [] : (['intent'] as const)), ...(blast ? [] : (['blast'] as const))],
    };
    await this.repo.save(prId, brief);
    return brief;
  }

  /**
   * Specs attached to the workspace's enabled agents and their linked skills,
   * deduplicated by path and read from the base branch. Best-effort: a missing
   * or unreadable document is skipped, never fails generation.
   */
  private async loadSpecs(workspaceId: string, repoId: string, logger?: Logger): Promise<BriefSpecDoc[]> {
    try {
      const repo = await this.reposRepo.getById(workspaceId, repoId);
      if (!repo) return [];
      const paths = new Set<string>();
      for (const agent of await this.agentsRepo.listEnabled(workspaceId)) {
        for (const ref of buildEffectiveRefs(await this.contextRepo.effectiveInputs(repoId, agent.id))) {
          paths.add(ref.path);
        }
      }
      const ref = `${BASE_REF_REMOTE}/${repo.defaultBranch}`;
      const gitRepo = { owner: repo.owner, name: repo.name };
      const docs: BriefSpecDoc[] = [];
      for (const path of paths) {
        try {
          assertContextPath(path);
          const content = await this.container.git.readFileAtRef(gitRepo, ref, path, SPEC_READ_MAX_BYTES);
          if (content) docs.push({ path, content });
        } catch {
          // unreadable → skipped
        }
      }
      return docs;
    } catch (err) {
      logger?.warn({ repoId, err: (err as Error).message }, 'brief: specs not loaded');
      return [];
    }
  }

  private async requirePull(workspaceId: string, prId: string) {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }
}
