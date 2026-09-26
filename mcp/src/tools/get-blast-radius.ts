import type { Container } from '@devdigest/server/platform/container.js';
import { getBlastRadiusForPr } from '@devdigest/server/modules/blast/service.js';
import { resolveRepoAndPr } from '../resolvers/repo-pr.js';
import { repoAndPrError } from './errors.js';
import { formatBlastRadius } from '../format.js';
import { guard, type ToolResult } from './types.js';

export interface GetBlastRadiusArgs {
  repo: string;
  pr_number?: number;
}

/**
 * Real L04 implementation: same mapping logic the studio's Overview tab uses
 * (`getBlastRadiusForPr`), called IN-PROCESS — no HTTP round-trip back to this
 * server's own API (matches every other tool in this package, e.g.
 * get_findings → ReviewService directly). `files` was dropped from the stub's
 * schema: the resolved PR's diff already determines the changed files, and an
 * override argument risks drifting from what the diff actually contains.
 */
export async function getBlastRadiusTool(
  container: Container,
  workspaceId: string,
  args: GetBlastRadiusArgs,
): Promise<ToolResult> {
  return guard(async () => {
    const resolved = await resolveRepoAndPr(container, workspaceId, args.repo, args.pr_number);
    if (resolved.kind !== 'ok') return repoAndPrError(resolved);

    const blast = await getBlastRadiusForPr(container, workspaceId, resolved.pull.id);
    return { text: formatBlastRadius(blast) };
  });
}
