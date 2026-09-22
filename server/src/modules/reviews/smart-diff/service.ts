import type { SmartDiff, SmartDiffFile, SmartDiffGroup } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { DISPLAY_ROLE_ORDER } from './constants.js';

export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Build the SmartDiff response from a PR's persisted files plus the union of
 * finding lines across every review run against it. Pure — no DB/network;
 * all I/O (fetching files/findings) stays in the caller (service.ts).
 * Groups with zero files are omitted; files keep their original relative
 * order within a group (no alphabetical reordering).
 */
export function buildSmartDiff(
  files: SmartDiffSourceFile[],
  findingLinesByPath: ReadonlyMap<string, number[]>,
): SmartDiff {
  const byRole = new Map<string, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const entry: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLinesByPath.get(file.path) ?? [],
    };
    const list = byRole.get(role) ?? [];
    list.push(entry);
    byRole.set(role, list);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of DISPLAY_ROLE_ORDER) {
    const roleFiles = byRole.get(role);
    if (roleFiles && roleFiles.length > 0) groups.push({ role, files: roleFiles });
  }

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
