import type { ContextDocument } from "@devdigest/shared";

export const baseName = (path: string) => path.split("/").pop() ?? path;

/** Group-stable ordering: by type folder, then name. */
export function sortDocuments(docs: ContextDocument[]): ContextDocument[] {
  return docs.slice().sort((a, b) => a.type.localeCompare(b.type) || a.path.localeCompare(b.path));
}

/** Trim + require a non-empty name without path separators. */
export function validateName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && !/[\\/]/.test(n);
}

export const isMarkdownFile = (name: string) => name.toLowerCase().endsWith(".md");
