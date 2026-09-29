/** A file (and optionally a new-side line) the diff should open on — from `?file=&line=`. */
export interface DiffTarget {
  file: string;
  line?: number;
}

/** Parse `?file=&line=` values; a missing file or non-positive/NaN line is dropped. */
export function parseDiffTarget(file: string | null, line: string | null): DiffTarget | undefined {
  if (!file) return undefined;
  const n = line ? Number(line) : NaN;
  return Number.isInteger(n) && n > 0 ? { file, line: n } : { file };
}
