import { posix } from 'node:path';

export function languageOf(repoPath: string): string {
  const ext = posix.extname(repoPath).slice(1);
  return ext === 'ts' || ext === 'tsx' ? 'typescript' : ext || 'text';
}

export function groupByDirectory(paths: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const dir = posix.dirname(p);
    groups.set(dir, [...(groups.get(dir) ?? []), posix.basename(p)]);
  }
  return groups;
}
