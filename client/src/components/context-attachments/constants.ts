import type { ContextDocType } from "@devdigest/shared";

export const CONTEXT_TYPE_COLOR: Record<ContextDocType, string> = {
  specs: "var(--accent-text)",
  docs: "var(--ok)",
  insights: "var(--warn, #d9a300)",
};
