import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { OnboardingTour } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { OnboardingRepository } from './repository.js';
import { extractRunCommands } from './run-commands.js';

/** Candidate files pulled from the rank facade before re-ranking by dependents. */
const CANDIDATE_FILES = 30;
const CRITICAL_PATHS_SHOWN = 5;

export class OnboardingService {
  private repo: OnboardingRepository;
  private reposRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
  }

  async get(workspaceId: string, repoId: string): Promise<OnboardingTour | null> {
    await this.requireRepo(workspaceId, repoId);
    return this.repo.get(repoId);
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
      .map((path) => ({ path, dependents: counts.get(path) ?? 0, role: null }));

    const clonePath = repo.clonePath;
    const commands = clonePath
      ? await extractRunCommands(async (rel) => {
          try {
            return await readFile(join(clonePath, rel), 'utf8');
          } catch {
            return null;
          }
        })
      : [];

    const tour: OnboardingTour = {
      repo_id: repoId,
      generated_at: new Date().toISOString(),
      index_commit_sha: state.lastIndexedSha,
      files_indexed: state.filesIndexed,
      partial_index: state.status === 'partial',
      sections: {
        overview: { status: 'not_generated', text: null },
        critical_paths: {
          status: criticalPaths.length > 0 ? 'ok' : 'not_generated',
          items: criticalPaths,
        },
        run_locally: {
          status: commands.length > 0 ? 'ok' : 'not_generated',
          steps: commands.map((command) => ({ command })),
        },
        reading_path: { status: 'not_generated', items: [] },
        first_tasks: { status: 'not_generated', items: [] },
      },
    };
    await this.repo.save(repoId, tour);
    return tour;
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }
}
