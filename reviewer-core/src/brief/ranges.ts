/** Inclusive `[start, end]` new-side line range. */
export type LineRange = readonly [number, number];

/**
 * New-side line ranges covered by the hunks of a single file's unified patch
 * (`pr_files.patch`, i.e. `@@ -a,b +c,d @@` headers). Pure. Returns `[]` for a
 * missing/hunk-less patch, and skips zero-length (pure deletion) hunks.
 */
export function changedRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!m) continue;
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) ranges.push([start, start + len - 1]);
  }
  return ranges;
}

export function lineInRanges(line: number, ranges: readonly LineRange[]): boolean {
  return ranges.some(([a, b]) => line >= a && line <= b);
}
