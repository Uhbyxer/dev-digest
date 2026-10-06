import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoMap } from '@devdigest/shared';

export function loadRepoMap(cloneDir: string): RepoMap {
  const raw = readFileSync(join(cloneDir, '.devdigest', 'repo-map.json'), 'utf8');
  const parsed = JSON.parse(raw) as RepoMap;
  return { ...parsed, files: parsed.files.filter((f) => !f.path.startsWith('vendor/')) };
}
