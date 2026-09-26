import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { getPrForBlast } from './repository.js';
import { mapBlastResultToContract } from './mapper.js';

/**
 * The blast module's single export: resolve the PR's changed files, ask the
 * repo-intel facade for its raw `BlastResult`, and map it into the shared
 * `BlastRadius` contract. No re-parsing, no LLM call — `getBlastRadius` is
 * repo-intel's already-computed index.
 */
export async function getBlastRadiusForPr(
  container: Container,
  workspaceId: string,
  prId: string,
): Promise<BlastRadius> {
  const pr = await getPrForBlast(container.db, workspaceId, prId);
  if (!pr) throw new NotFoundError('Pull request not found');

  const result = await container.repoIntel.getBlastRadius(pr.repoId, pr.changedFiles);
  return mapBlastResultToContract(result);
}
