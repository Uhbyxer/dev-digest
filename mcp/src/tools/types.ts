/** A tool handler's result — compact text, never a raw pretty-printed JSON dump. */
export interface ToolResult {
  text: string;
  isError?: boolean;
}

export function errorResult(text: string): ToolResult {
  return { text, isError: true };
}

/**
 * Every tool handler must resolve to a `ToolResult`, never throw — an
 * uncaught exception escapes as a raw MCP protocol-level error instead of
 * the clean `{ text, isError }` shape every other failure path in this
 * package deliberately returns. Wraps a tool body so an unexpected thrown
 * error (a malformed input a resolver rejects, a service call that fails)
 * still comes back as friendly error text.
 */
export async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}
