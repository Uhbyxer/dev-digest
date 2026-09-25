import type { Container } from '@devdigest/server/platform/container.js';
import { AgentsService } from '@devdigest/server/modules/agents/service.js';
import { type ToolResult } from './types.js';

export async function listAgentsTool(container: Container, workspaceId: string): Promise<ToolResult> {
  const agents = await new AgentsService(container).list(workspaceId);
  if (agents.length === 0) return { text: 'No agents configured in this workspace.' };
  const lines = agents.map(
    (a) => `- ${a.name} (${a.provider}/${a.model})${a.enabled ? '' : ' [disabled]'} — id ${a.id}`,
  );
  return { text: lines.join('\n') };
}
