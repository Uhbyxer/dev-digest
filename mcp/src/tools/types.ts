/** A tool handler's result — compact text, never a raw pretty-printed JSON dump. */
export interface ToolResult {
  text: string;
  isError?: boolean;
}

export function errorResult(text: string): ToolResult {
  return { text, isError: true };
}
