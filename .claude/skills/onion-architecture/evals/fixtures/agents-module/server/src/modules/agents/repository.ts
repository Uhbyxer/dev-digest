import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { agents } from '../../db/schema/agents.js';
import type { AgentRow } from '../../db/rows.js';

export class AgentsRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(agents).where(eq(agents.workspaceId, workspaceId));
  }

  async insert(row: { workspaceId: string; name: string; prompt: string; model: string }): Promise<AgentRow> {
    const [created] = await this.db.insert(agents).values(row).returning();
    return created;
  }

  async findByName(workspaceId: string, name: string): Promise<AgentRow | undefined> {
    const [found] = await this.db
      .select()
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.name, name)));
    return found;
  }
}
