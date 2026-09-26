/**
 * Pure grouping/dedup: per-file `RecentPrForFile[]` results → `PrHistoryItem[]`,
 * deduplicated by `pr_number` across files (a PR that touched several changed
 * files should show up once, with every matched file listed in `files_overlap`).
 * No DB/network — the secondary seam per the spec's Testing Decisions.
 */
import type { PrHistoryItem, RecentPrForFile } from '@devdigest/shared';

export interface FileHistoryResult {
  file: string;
  items: RecentPrForFile[];
}

export function dedupePriorPrs(perFile: FileHistoryResult[]): PrHistoryItem[] {
  const byPr = new Map<number, PrHistoryItem>();

  for (const { file, items } of perFile) {
    for (const item of items) {
      const existing = byPr.get(item.pr_number);
      if (existing) {
        if (!existing.files_overlap.includes(file)) existing.files_overlap.push(file);
        continue;
      }
      byPr.set(item.pr_number, {
        pr_number: item.pr_number,
        title: item.title,
        merged_at: item.merged_at ?? '',
        author: item.author,
        files_overlap: [file],
        notes: '',
      });
    }
  }

  return [...byPr.values()].sort((a, b) => b.pr_number - a.pr_number);
}
