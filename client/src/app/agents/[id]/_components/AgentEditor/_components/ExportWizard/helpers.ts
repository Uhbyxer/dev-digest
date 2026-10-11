import type { CiFile } from "@devdigest/shared";
import { REPO_PATTERN } from "./constants";

/** The bundled runner — identified by path, not by empty contents (memory.jsonl is also empty). */
export const RUNNER_PATH = ".devdigest/runner/index.js";

export function isValidRepo(repo: string): boolean {
  return REPO_PATTERN.test(repo.trim());
}

/** The workflow is the only editable file (AC-3). */
export function findWorkflow(files: CiFile[] | undefined): CiFile | undefined {
  return files?.find((f) => f.editable);
}

/** Bundled runner ships `contents: ''` — render a placeholder with its size instead. */
export function isPlaceholderFile(f: CiFile): boolean {
  return f.path === RUNNER_PATH;
}

/** Trigger a browser download of a base64-encoded zip. */
export function downloadZipBase64(zipBase64: string, filename: string): void {
  const bin = atob(zipBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function zipFilename(repo: string): string {
  return `devdigest-ci-${repo.trim().replace("/", "-")}.zip`;
}
