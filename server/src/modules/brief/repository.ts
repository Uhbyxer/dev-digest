import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Intent, PrBrief } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import * as pullRepo from '../reviews/repository/pull.repo.js';
import * as reviewRepo from '../reviews/repository/review.repo.js';

/**
 * PR Brief data-access. Owns the `pr_brief` table (one row per PR, the whole
 * snapshot as jsonb — head sha, generated_at and `missing` live inside the
 * JSON, no columns) and reads the PR's facts through the reviews repositories.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<PrBrief | null> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row ? (row.json as PrBrief) : null;
  }

  /** Replace the PR's Brief (one row per PR — regenerate overwrites). */
  async save(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return pullRepo.getPull(this.db, workspaceId, prId);
  }

  getFiles(prId: string) {
    return pullRepo.getPrFiles(this.db, prId);
  }

  getIntent(prId: string): Promise<Intent | undefined> {
    return pullRepo.getIntent(this.db, prId);
  }

  /** Finding start lines per file, across every review run of the PR. */
  async findingLines(prId: string): Promise<Map<string, number[]>> {
    const out = new Map<string, number[]>();
    for (const { findings } of await reviewRepo.reviewsForPull(this.db, prId)) {
      for (const f of findings) {
        const list = out.get(f.file) ?? [];
        if (!list.includes(f.startLine)) list.push(f.startLine);
        out.set(f.file, list);
      }
    }
    for (const lines of out.values()) lines.sort((a, b) => a - b);
    return out;
  }
}
