import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { McpContext } from './platform/context.js';
import { listAgentsTool } from './tools/list-agents.js';
import { runReviewTool } from './tools/run-review.js';
import { getFindingsTool } from './tools/get-findings.js';
import { getConventionsTool } from './tools/get-conventions.js';
import { getBlastRadiusTool } from './tools/get-blast-radius.js';
import type { ToolResult } from './tools/types.js';

function toCallResult(result: ToolResult): CallToolResult {
  return {
    content: [{ type: 'text', text: result.text }],
    ...(result.isError ? { isError: true } : {}),
  };
}

const REPO_DESCRIPTION = 'GitHub repo as "owner/name" (or a full GitHub PR URL, which also supplies pr_number)';

/**
 * Registers all five MCP tools on `server`, each delegating to a plain
 * `(container, workspaceId, args) => ToolResult` handler under `./tools/` —
 * that function is the seam tests call directly, never this registration
 * layer or the stdio transport.
 */
export function registerTools(server: McpServer, ctx: McpContext): void {
  const { container, workspaceId } = ctx;

  server.registerTool(
    'list_agents',
    { description: 'List the reviewers (Agents) configured in this workspace.' },
    async () => toCallResult(await listAgentsTool(container, workspaceId)),
  );

  server.registerTool(
    'run_review',
    {
      description: 'Run a review on a pull request and return its findings directly.',
      inputSchema: {
        repo: z.string().describe(REPO_DESCRIPTION),
        pr_number: z.number().int().optional().describe('PR number (required unless repo is a full PR URL)'),
        agent_name: z
          .string()
          .optional()
          .describe('Run only this named agent; omit to run every enabled agent'),
      },
    },
    async (args) => toCallResult(await runReviewTool(container, workspaceId, args)),
  );

  server.registerTool(
    'get_findings',
    {
      description: "Read a pull request's already-persisted findings, without running a new review.",
      inputSchema: {
        repo: z.string().describe(REPO_DESCRIPTION),
        pr_number: z.number().int().optional().describe('PR number (required unless repo is a full PR URL)'),
        agent_name: z.string().optional().describe('Narrow to one named agent\'s review'),
      },
    },
    async (args) => toCallResult(await getFindingsTool(container, workspaceId, args)),
  );

  server.registerTool(
    'get_conventions',
    {
      description:
        "Fetch a repo's accepted Conventions (house rules); scans once automatically if the repo has never been scanned.",
      inputSchema: {
        repo: z.string().describe('GitHub repo as "owner/name"'),
        status: z
          .enum(['pending', 'accepted', 'rejected'])
          .optional()
          .describe('Defaults to accepted; pass to inspect pending/rejected candidates'),
      },
    },
    async (args) => toCallResult(await getConventionsTool(container, workspaceId, args)),
  );

  server.registerTool(
    'get_blast_radius',
    {
      description: "Get a change's blast radius (callers/impacted endpoints). Not implemented yet — returns a stub.",
      inputSchema: {
        repo: z.string().describe(REPO_DESCRIPTION),
        pr_number: z.number().int().optional(),
        files: z.array(z.string()).optional(),
      },
    },
    async (args) => toCallResult(await getBlastRadiusTool(container, workspaceId, args)),
  );
}
