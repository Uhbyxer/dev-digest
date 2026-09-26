import type {
  GitHubClient,
  PrHistory,
  PrHistoryItem,
  RecentPrForFile,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { getPrForBlast } from '../blast/repository.js';
import { getPrForHistory, getCachedFileHistory, setCachedFileHistory } from './repository.js';
import { dedupePriorPrs, type FileHistoryResult } from './dedupe.js';

/** Commits inspected per file (spec cap — controls GitHub API cost). */
const COMMITS_PER_FILE = 3;
/** Cache freshness window: commit history for a file only changes when a new
 *  PR merges touching it — an event independent of repo-intel's reindex cycle. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Shared by `resolvePriorPrsForFiles` and `getPriorPrsForPr` so the two paths
 *  can't drift on how a single file's history is fetched. */
async function fetchFileHistory(
  github: GitHubClient,
  repo: RepoRef,
  file: string,
): Promise<RecentPrForFile[]> {
  return github.listRecentPrsForFile(repo, file, COMMITS_PER_FILE);
}

/**
 * Resolve deduplicated Prior-PRs history for `files`, against a `GitHubClient`
 * — no DB. This is the seam tested against a mocked `GitHubClient`.
 */
export async function resolvePriorPrsForFiles(
  github: GitHubClient,
  repo: RepoRef,
  files: string[],
): Promise<PrHistoryItem[]> {
  const perFile: FileHistoryResult[] = [];
  for (const file of files) {
    perFile.push({ file, items: await fetchFileHistory(github, repo, file) });
  }
  return dedupePriorPrs(perFile);
}

/**
 * `GET /pulls/:id/pr-history`'s single export: scoped to the files that
 * appear in the PR's changed *symbols* (not its full changed-file list, per
 * spec — cheaper and more relevant), cached per (repo, file) with a ~24h TTL
 * in `pr_history_cache` so revisiting the Overview tab doesn't burst-call
 * GitHub. Degrades to `{ history: [] }` (never throws) when no GitHub token
 * is configured — the panel's job is context, not a hard dependency.
 */
export async function getPriorPrsForPr(
  container: Container,
  workspaceId: string,
  prId: string,
): Promise<PrHistory> {
  const pr = await getPrForHistory(container.db, workspaceId, prId);
  if (!pr) throw new NotFoundError('Pull request not found');

  const blastInput = await getPrForBlast(container.db, workspaceId, prId);
  const blast = blastInput
    ? await container.repoIntel.getBlastRadius(blastInput.repoId, blastInput.changedFiles)
    : null;
  const files = [...new Set((blast?.changedSymbols ?? []).map((s) => s.file))];
  if (files.length === 0) return { history: [] };

  const repoRef: RepoRef = { owner: pr.owner, name: pr.name };
  const now = Date.now();
  const perFile: FileHistoryResult[] = [];
  let github: GitHubClient | null = null;

  for (const file of files) {
    const cached = await getCachedFileHistory(container.db, pr.repoId, file);
    if (cached && now - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      perFile.push({ file, items: cached.items });
      continue;
    }

    if (github === null) {
      try {
        github = await container.github();
      } catch {
        github = null;
      }
    }
    if (!github) {
      // Stale cache is still better than nothing when offline.
      perFile.push({ file, items: cached?.items ?? [] });
      continue;
    }

    try {
      const items = await fetchFileHistory(github, repoRef, file);
      // Only cache on a genuine fetch — never stamp a fresh `fetchedAt` on a
      // stale/empty fallback, or a single transient GitHub error would freeze
      // "no history" in for the full TTL.
      await setCachedFileHistory(container.db, pr.repoId, file, items);
      perFile.push({ file, items });
    } catch {
      perFile.push({ file, items: cached?.items ?? [] });
    }
  }

  return { history: dedupePriorPrs(perFile) };
}
