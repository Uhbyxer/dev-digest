import type { Container } from '@devdigest/server/platform/container.js';
import { RepoRepository, type RepoRow } from '@devdigest/server/modules/repos/repository.js';
import { PullsRepository } from '@devdigest/server/modules/pulls/repository.js';
import type { PullRow } from '@devdigest/server/db/rows.js';

/**
 * Shared repo+PR addressing for run_review / get_findings / get_conventions.
 * MCP callers address a PR the way GitHub does (owner/name + number), never
 * by dev-digest's internal id, so a repo/PR that doesn't exist yet must
 * surface WHICH step is missing rather than a generic 404 (user story 6).
 */
export type RepoAndPrResult =
  | { kind: 'repo_not_found'; fullName: string }
  | { kind: 'pr_not_imported'; fullName: string; number: number }
  | { kind: 'pr_number_required'; repoInput: string }
  | { kind: 'ok'; repo: RepoRow; pull: PullRow };

// Anchored end-to-end (optional scheme, optional trailing path/query/hash) so
// this only matches when `repoInput` IS a GitHub PR URL, never when a PR URL
// merely appears somewhere inside a longer string.
const PR_URL_RE = /^(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i;

/** Parse `owner/name` (+ optional number), or a full GitHub PR URL. */
export function parseRepoInput(
  repoInput: string,
  prNumber?: number,
): { owner: string; name: string; number?: number } {
  const urlMatch = repoInput.match(PR_URL_RE);
  if (urlMatch) {
    return {
      owner: urlMatch[1]!,
      name: urlMatch[2]!.replace(/\.git$/, ''),
      number: Number(urlMatch[3]),
    };
  }
  const parts = repoInput.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Expected "owner/name" or a GitHub PR URL, got "${repoInput}"`);
  }
  return { owner: parts[0], name: parts[1], number: prNumber };
}

export async function resolveRepoAndPr(
  container: Container,
  workspaceId: string,
  repoInput: string,
  prNumber?: number,
): Promise<RepoAndPrResult> {
  const parsed = parseRepoInput(repoInput, prNumber);
  const fullName = `${parsed.owner}/${parsed.name}`;
  const repo = await new RepoRepository(container.db).findByFullName(workspaceId, fullName);
  if (!repo) return { kind: 'repo_not_found', fullName };

  if (parsed.number === undefined) {
    return { kind: 'pr_number_required', repoInput };
  }

  const pull = await new PullsRepository(container.db).findByRepoAndNumber(
    workspaceId,
    repo.id,
    parsed.number,
  );
  if (!pull) return { kind: 'pr_not_imported', fullName, number: parsed.number };

  return { kind: 'ok', repo, pull };
}

/** Repo-only resolution (conventions are repo-scoped, not PR-scoped). */
export async function resolveRepo(
  container: Container,
  workspaceId: string,
  repoInput: string,
): Promise<{ kind: 'repo_not_found'; fullName: string } | { kind: 'ok'; repo: RepoRow }> {
  const parsed = parseRepoInput(repoInput);
  const fullName = `${parsed.owner}/${parsed.name}`;
  const repo = await new RepoRepository(container.db).findByFullName(workspaceId, fullName);
  if (!repo) return { kind: 'repo_not_found', fullName };
  return { kind: 'ok', repo };
}
