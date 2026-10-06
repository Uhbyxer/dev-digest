import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notes } from '../../db/schema/notes.js';
import type { NoteRow } from '../../db/rows.js';
import type { NotesRepository } from './repository.js';

export class NotesService {
  constructor(
    private readonly repo: NotesRepository,
    private readonly db: Db,
  ) {}

  async list(workspaceId: string, pullId: string): Promise<NoteRow[]> {
    return this.repo.listForPull(workspaceId, pullId);
  }

  async add(workspaceId: string, pullId: string, body: string): Promise<NoteRow> {
    return this.repo.insert({ workspaceId, pullId, body: body.trim() });
  }

  async archiveStale(workspaceId: string, olderThan: Date): Promise<number> {
    const stale = await this.db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceId), lt(notes.createdAt, olderThan)));
    for (const row of stale) {
      await this.db.update(notes).set({ archived: true }).where(eq(notes.id, row.id));
    }
    return stale.length;
  }
}
