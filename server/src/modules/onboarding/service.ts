import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OnboardingTour, OnboardingTourResponse } from '@devdigest/shared';
import {
  ONBOARDING_MAX_FILE_CHARS,
  ONBOARDING_SCHEMA_NAME,
  OnboardingLlmResult,
  buildOnboardingPrompt,
  claimedPaths,
  verifyOnboarding,
  type OnboardingFileSample,
  type VerifiedOnboarding,
} from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { OnboardingRepository } from './repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { extractRunCommands } from './run-commands.js';

/** Candidate files pulled from the rank facade before re-ranking by dependents. */
const CANDIDATE_FILES = 30;
const CRITICAL_PATHS_SHOWN = 5;
/** Top-ranked files whose bodies are sent to the LLM (plus README + manifest). */
const LLM_SAMPLE_FILES = 12;
/** Repo-root files always worth sending; not index claims, just context. */
const CONTEXT_FILES = ['README.md', 'package.json'];

export class OnboardingService {
  private repo: OnboardingRepository;
  private reposRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
  }

  /** The stored Tour plus whether the index has moved on since. Display only — never regenerates. */
  async get(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    await this.requireRepo(workspaceId, repoId);
    const tour = await this.repo.get(repoId);
    if (!tour) return { tour: null, stale: false };
    const state = await this.container.repoIntel.getIndexState(repoId);
    return { tour, stale: state.lastIndexedSha !== tour.index_commit_sha };
  }

  /** Build (or rebuild) and store the Tour. Deterministic sections only for now. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingTour> {
    const repo = await this.requireRepo(workspaceId, repoId);

    const state = await this.container.repoIntel.getIndexState(repoId);
    if (state.status !== 'full' && state.status !== 'partial') {
      throw new AppError(
        'index_not_ready',
        `The repo index is not ready (status: ${state.status}). Wait for indexing to finish, then try again.`,
        409,
      );
    }

    const candidates = await this.container.repoIntel.getTopFilesByRank(repoId, CANDIDATE_FILES);
    const counts = await this.repo.dependentCounts(repoId, candidates);
    const criticalPaths = candidates
      .filter((p) => (counts.get(p) ?? 0) > 0)
      // Stable sort: ties keep the facade's rank order.
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
      .slice(0, CRITICAL_PATHS_SHOWN)
      .map((path) => ({ path, dependents: counts.get(path) ?? 0 }));

    const clonePath = repo.clonePath;
    const readClone = async (rel: string): Promise<string | null> => {
      if (!clonePath) return null;
      try {
        return await readFile(join(clonePath, rel), 'utf8');
      } catch {
        return null;
      }
    };
    const commands = clonePath ? await extractRunCommands(readClone) : [];

    const llm = await this.generateLlmParts(
      workspaceId,
      repoId,
      repo.fullName,
      criticalPaths.map((c) => c.path),
      [...new Set([...criticalPaths.map((c) => c.path), ...candidates.slice(0, LLM_SAMPLE_FILES)])],
      readClone,
    );

    const tour: OnboardingTour = {
      repo_id: repoId,
      generated_at: new Date().toISOString(),
      index_commit_sha: state.lastIndexedSha,
      files_indexed: state.filesIndexed,
      partial_index: state.status === 'partial',
      llm_input: llm.input,
      sections: {
        overview: llm.verified?.overview
          ? { status: 'ok', text: llm.verified.overview }
          : { status: 'not_generated', text: null },
        critical_paths: {
          status: criticalPaths.length > 0 ? 'ok' : 'not_generated',
          items: criticalPaths.map((c) => ({ ...c, role: llm.verified?.roles[c.path] ?? null })),
        },
        run_locally: {
          status: commands.length > 0 ? 'ok' : 'not_generated',
          steps: commands.map((command) => ({ command })),
        },
        reading_path: {
          status: llm.verified && llm.verified.readingPath.length > 0 ? 'ok' : 'not_generated',
          items: llm.verified?.readingPath ?? [],
        },
        first_tasks: {
          status: llm.verified && llm.verified.firstTasks.length > 0 ? 'ok' : 'not_generated',
          items: llm.verified?.firstTasks ?? [],
        },
      },
    };
    await this.repo.save(repoId, tour);
    return tour;
  }

  /**
   * The LLM-written sections. Best-effort: any failure (no key, bad output)
   * leaves them not_generated while the deterministic sections still ship.
   * Repo text is sent delimiter-wrapped as untrusted, and every path in the
   * answer is checked against the index before it can reach the Tour.
   */
  private async generateLlmParts(
    workspaceId: string,
    repoId: string,
    repoName: string,
    criticalPaths: string[],
    samplePaths: string[],
    readClone: (rel: string) => Promise<string | null>,
  ): Promise<{ verified: VerifiedOnboarding | null; input: OnboardingTour['llm_input'] }> {
    try {
      const wanted = [...samplePaths, ...CONTEXT_FILES];
      const files = (
        await Promise.all(
          wanted.map(async (path) => {
            const content = await readClone(path);
            return content === null ? null : { path, content: content.slice(0, ONBOARDING_MAX_FILE_CHARS) };
          }),
        )
      ).filter((f): f is OnboardingFileSample => f !== null);
      if (files.length === 0) return { verified: null, input: null };

      const messages = buildOnboardingPrompt({ repoName, criticalPaths, files });
      const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: OnboardingLlmResult,
        schemaName: ONBOARDING_SCHEMA_NAME,
        messages,
      });

      const known = await this.repo.existingPaths(repoId, claimedPaths(result.data));
      return {
        verified: verifyOnboarding(result.data, known, criticalPaths),
        input: {
          files: files.length,
          approx_tokens: Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4),
        },
      };
    } catch {
      return { verified: null, input: null };
    }
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }
}
