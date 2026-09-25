import type { Container } from '@devdigest/server/platform/container.js';
import { ReviewService } from '@devdigest/server/modules/reviews/service.js';
import type { AgentRow } from '@devdigest/server/db/rows.js';
import { resolveRepoAndPr } from '../resolvers/repo-pr.js';
import { resolveAgentByName } from '../resolvers/agent.js';
import { formatReviews } from '../format.js';
import { agentLookupError, repoAndPrError } from './errors.js';
import { errorResult, type ToolResult } from './types.js';

export interface RunReviewArgs {
  repo: string;
  pr_number?: number;
  agent_name?: string;
}

export async function runReviewTool(
  container: Container,
  workspaceId: string,
  args: RunReviewArgs,
): Promise<ToolResult> {
  const resolved = await resolveRepoAndPr(container, workspaceId, args.repo, args.pr_number);
  if (resolved.kind !== 'ok') return repoAndPrError(resolved);

  const reviewService = new ReviewService(container);

  let targets: AgentRow[];
  if (args.agent_name) {
    const agent = await resolveAgentByName(container, workspaceId, args.agent_name);
    if (agent.kind !== 'ok') return agentLookupError(agent);
    targets = [agent.agent];
  } else {
    targets = await reviewService.resolveTargets(workspaceId, { all: true });
    if (targets.length === 0) {
      return errorResult('No enabled agents configured in this workspace. Enable one in the studio first.');
    }
  }

  const reviews = await reviewService.runReviewBlocking(workspaceId, resolved.pull.id, targets);
  return { text: formatReviews(reviews) };
}
