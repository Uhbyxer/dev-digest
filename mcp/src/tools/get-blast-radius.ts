import type { Container } from '@devdigest/server/platform/container.js';
import type { ToolResult } from './types.js';

export interface GetBlastRadiusArgs {
  repo: string;
  pr_number?: number;
  files?: string[];
}

/**
 * Stable stub ahead of its real L04 implementation — deliberately NOT wired
 * to `container.repoIntel.getBlastRadius` yet, so this lesson's tool set is
 * final (name + schema) and won't require the MCP client to reconnect once
 * L04 fills in the handler.
 */
export async function getBlastRadiusTool(
  _container: Container,
  _workspaceId: string,
  _args: GetBlastRadiusArgs,
): Promise<ToolResult> {
  return {
    text: 'not_implemented: get_blast_radius ships in a later lesson (L04). The tool exists now so your session\'s tool set stays stable.',
  };
}
