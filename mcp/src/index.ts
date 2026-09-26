import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpContext } from './platform/context.js';
import { registerTools } from './register.js';

/** stdio entrypoint. `pnpm dev` runs `tsx src/index.ts`. */
async function main() {
  const ctx = await buildMcpContext();
  const server = new McpServer({ name: 'devdigest-mcp', version: '0.0.0' });
  registerTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
