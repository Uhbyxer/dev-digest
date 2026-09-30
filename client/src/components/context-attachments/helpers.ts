import type { ContextDocument } from "@devdigest/shared";

export interface AttachmentRow {
  path: string;
  /** Doc metadata; undefined when the attached file no longer exists. */
  doc?: ContextDocument;
  attached: boolean;
  missing: boolean;
}

/** Toggle a path: attach (append to the end) or detach. */
export function toggleAttachment(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths.filter((p) => p !== path) : [...paths, path];
}

/** Move an attached path by `delta` positions, clamped. No-op if not attached. */
export function movePath(paths: string[], path: string, delta: number): string[] {
  const i = paths.indexOf(path);
  if (i < 0) return paths;
  const j = Math.max(0, Math.min(paths.length - 1, i + delta));
  if (i === j) return paths;
  const next = paths.slice();
  next.splice(i, 1);
  next.splice(j, 0, path);
  return next;
}

/** Drag reorder: put `dragged` at the position currently held by `target`. */
export function dropOnto(paths: string[], dragged: string, target: string): string[] {
  const from = paths.indexOf(dragged);
  const to = paths.indexOf(target);
  if (from < 0 || to < 0 || from === to) return paths;
  return movePath(paths, dragged, to - from);
}

/** Attached rows first (in order, incl. missing files), then the rest by path. Filter applies to both. */
export function buildRows(docs: ContextDocument[], attached: string[], search: string): AttachmentRow[] {
  const q = search.trim().toLowerCase();
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const keep = (p: string) => !q || p.toLowerCase().includes(q);
  const attachedRows: AttachmentRow[] = attached.filter(keep).map((path) => ({
    path,
    doc: byPath.get(path),
    attached: true,
    missing: !byPath.has(path) || !!byPath.get(path)?.missing,
  }));
  const rest: AttachmentRow[] = docs
    .filter((d) => !attached.includes(d.path) && keep(d.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((doc) => ({ path: doc.path, doc, attached: false, missing: false }));
  return [...attachedRows, ...rest];
}

export const baseName = (path: string) => path.split("/").pop() ?? path;
/** e.g. ".devdigest/specs/a.md" -> "specs/" */
export const folderLabel = (path: string) => {
  const parts = path.split("/");
  return parts.length >= 2 ? `${parts[parts.length - 2]}/` : "";
};
