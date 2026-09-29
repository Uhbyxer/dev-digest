import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OnboardingTour } from '@devdigest/shared';

/**
 * Onboarding Tour data-access. Owns the `onboarding` table (one row per repo,
 * the whole Tour as jsonb) and reads `file_edges` for dependents counts.
 */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<OnboardingTour | null> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row ? (row.json as OnboardingTour) : null;
  }

  /** Replace the repo's Tour (one row per repo — regenerate overwrites). */
  async save(repoId: string, tour: OnboardingTour): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt: new Date(tour.generated_at) })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: tour, generatedAt: new Date(tour.generated_at) },
      });
  }

  /** How many files import each of `paths` (files with no importers are absent). */
  async dependentCounts(repoId: string, paths: string[]): Promise<Map<string, number>> {
    if (paths.length === 0) return new Map();
    const rows = await this.db
      .select({ path: t.fileEdges.toFile, n: sql<number>`count(*)::int` })
      .from(t.fileEdges)
      .where(sql`${t.fileEdges.repoId} = ${repoId} AND ${inArray(t.fileEdges.toFile, paths)}`)
      .groupBy(t.fileEdges.toFile);
    return new Map(rows.map((r) => [r.path, r.n]));
  }

  /** Which of `paths` the index knows (as a ranked file or as either end of an import edge). */
  async existingPaths(repoId: string, paths: string[]): Promise<Set<string>> {
    const unique = [...new Set(paths)];
    if (unique.length === 0) return new Set();
    const [ranked, from, to] = await Promise.all([
      this.db
        .select({ p: t.fileRank.filePath })
        .from(t.fileRank)
        .where(and(eq(t.fileRank.repoId, repoId), inArray(t.fileRank.filePath, unique))),
      this.db
        .select({ p: t.fileEdges.fromFile })
        .from(t.fileEdges)
        .where(and(eq(t.fileEdges.repoId, repoId), inArray(t.fileEdges.fromFile, unique))),
      this.db
        .select({ p: t.fileEdges.toFile })
        .from(t.fileEdges)
        .where(and(eq(t.fileEdges.repoId, repoId), inArray(t.fileEdges.toFile, unique))),
    ]);
    return new Set([...ranked, ...from, ...to].map((r) => r.p));
  }
}
