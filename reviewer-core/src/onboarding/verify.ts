import type { OnboardingLlmResult } from './schemas.js';

/** Every file path the LLM output claims exists — to be checked against the index. */
export function claimedPaths(r: OnboardingLlmResult): string[] {
  return [
    ...r.critical_path_roles.map((x) => x.path),
    ...r.reading_path.map((x) => x.path),
    ...r.first_tasks.flatMap((t) => t.files),
  ];
}

export interface VerifiedOnboarding {
  overview: string | null;
  /** path → role, only for real critical paths. */
  roles: Record<string, string>;
  readingPath: { path: string; reason: string }[];
  firstTasks: { title: string; files: string[] }[];
}

const MAX_TASK_FILES = 3;

/**
 * Drop everything the index cannot back up (ADR-0003): unknown paths never
 * reach the Tour, tasks left with no real file are removed, roles are kept
 * only for the deterministic critical paths.
 */
export function verifyOnboarding(
  r: OnboardingLlmResult,
  known: ReadonlySet<string>,
  criticalPaths: readonly string[],
): VerifiedOnboarding {
  const critical = new Set(criticalPaths);
  const roles: Record<string, string> = {};
  for (const { path, role } of r.critical_path_roles) {
    if (critical.has(path) && known.has(path) && role.trim()) roles[path] = role.trim();
  }

  const seen = new Set<string>();
  const readingPath = r.reading_path.filter(({ path }) => {
    if (!known.has(path) || seen.has(path)) return false;
    seen.add(path);
    return true;
  });

  const firstTasks = r.first_tasks
    .map((t) => ({
      title: t.title.trim(),
      files: [...new Set(t.files.filter((f) => known.has(f)))].slice(0, MAX_TASK_FILES),
    }))
    .filter((t) => t.title && t.files.length > 0);

  return { overview: r.overview.trim() || null, roles, readingPath, firstTasks };
}
