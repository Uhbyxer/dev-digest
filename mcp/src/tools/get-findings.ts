import type { Container } from '@devdigest/server/platform/container.js';
import { ReviewService } from '@devdigest/server/modules/reviews/service.js';
import { resolveRepoAndPr } from '../resolvers/repo-pr.js';
import { resolveAgentByName } from '../resolvers/agent.js';
import { formatReviews } from '../format.js';
import { agentLookupError, repoAndPrError } from './errors.js';
import { guard, type ToolResult } from './types.js';

export interface GetFindingsArgs {
  repo: string;
  pr_number?: number;
  agent_name?: string;
}

export async function getFindingsTool(
  container: Container,
  workspaceId: string,
  args: GetFindingsArgs,
): Promise<ToolResult> {
  return guard(async () => {
    const resolved = await resolveRepoAndPr(container, workspaceId, args.repo, args.pr_number);
    if (resolved.kind !== 'ok') return repoAndPrError(resolved);

    let reviews = await new ReviewService(container).reviewsForPull(workspaceId, resolved.pull.id);

    if (args.agent_name) {
      const agent = await resolveAgentByName(container, workspaceId, args.agent_name);
      if (agent.kind !== 'ok') return agentLookupError(agent);
      reviews = reviews.filter((r) => r.agent_id === agent.agent.id);
    }

    return { text: formatReviews(reviews) };
  });
}
