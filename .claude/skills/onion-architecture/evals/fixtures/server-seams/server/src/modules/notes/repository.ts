import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notes } from '../../db/schema/notes.js';
import type { NoteRow } from '../../db/rows.js';

export class NotesRepository {
  constructor(private readonly db: Db) {}

  async listForPull(workspaceId: string, pullId: string): Promise<NoteRow[]> {
    return this.db
      .select()
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceId), eq(notes.pullId, pullId)))
      .orderBy(desc(notes.createdAt));
  }

  async insert(row: { workspaceId: string; pullId: string; body: string }): Promise<NoteRow> {
    const [created] = await this.db.insert(notes).values(row).returning();
    return created;
  }
}
