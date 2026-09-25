import type { RepoAndPrResult } from '../resolvers/repo-pr.js';
import type { AgentLookupResult } from '../resolvers/agent.js';
import { errorResult, type ToolResult } from './types.js';

/** Turn a non-`ok` repo/PR resolution into the specific missing-step error text. */
export function repoAndPrError(
  result: Extract<RepoAndPrResult, { kind: 'repo_not_found' | 'pr_not_imported' }>,
): ToolResult {
  if (result.kind === 'repo_not_found') {
    return errorResult(
      `Repo "${result.fullName}" is not added to this dev-digest workspace. Add it in the studio first.`,
    );
  }
  return errorResult(
    `PR #${result.number} has not been imported for "${result.fullName}" yet. Open the repo's Pull Requests tab in the studio to import it.`,
  );
}

/** Turn a non-`ok` agent lookup into the specific error text. */
export function agentLookupError(
  result: Extract<AgentLookupResult, { kind: 'not_found' | 'ambiguous' }>,
): ToolResult {
  if (result.kind === 'not_found') {
    return errorResult(`No agent named "${result.name}" in this workspace. Use list_agents to see available agents.`);
  }
  return errorResult(
    `"${result.name}" matches more than one agent: ${result.matches
      .map((m) => `${m.name} (${m.id})`)
      .join(', ')}. Use the exact, case-sensitive name.`,
  );
}
