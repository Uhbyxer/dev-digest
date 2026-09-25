import type { Container } from '@devdigest/server/platform/container.js';
import { AgentsRepository } from '@devdigest/server/modules/agents/repository.js';
import type { AgentRow } from '@devdigest/server/db/rows.js';

/**
 * Shared agent-name addressing for run_review / get_findings. `agents.name`
 * has no DB uniqueness constraint, so a lookup can find 0, 1, or several
 * matches — `ambiguous` surfaces the conflicting ids/names so the caller can
 * disambiguate (falling back to an exact case-sensitive match when exactly
 * one of the case-insensitive matches is exact).
 */
export type AgentLookupResult =
  | { kind: 'not_found'; name: string }
  | { kind: 'ambiguous'; name: string; matches: { id: string; name: string }[] }
  | { kind: 'ok'; agent: AgentRow };

export async function resolveAgentByName(
  container: Container,
  workspaceId: string,
  name: string,
): Promise<AgentLookupResult> {
  const matches = await new AgentsRepository(container.db).findByName(workspaceId, name);
  if (matches.length === 0) return { kind: 'not_found', name };
  if (matches.length === 1) return { kind: 'ok', agent: matches[0]! };

  const exact = matches.filter((m) => m.name === name);
  if (exact.length === 1) return { kind: 'ok', agent: exact[0]! };

  return {
    kind: 'ambiguous',
    name,
    matches: matches.map((m) => ({ id: m.id, name: m.name })),
  };
}
