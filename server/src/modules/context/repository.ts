import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ContextOwnerType } from '@devdigest/shared';

/**
 * Context module data-access. Owns `context_attachments`; reads `agents`,
 * `agent_skills`, `skills` only to resolve the effective set / used-by counts.
 */
export type AttachmentRow = typeof t.contextAttachments.$inferSelect;

export interface LinkedSkillRef {
  id: string;
  name: string;
  enabled: boolean;
}

export interface EffectiveInputs {
  agentPaths: string[];
  /** Linked, globally-enabled skills in agent_skills.order, each with its ordered paths. */
  skills: { id: string; name: string; paths: string[] }[];
}

export class ContextRepository {
  constructor(private db: Db) {}

  async listForRepo(repoId: string): Promise<AttachmentRow[]> {
    return this.db
      .select()
      .from(t.contextAttachments)
      .where(eq(t.contextAttachments.repoId, repoId))
      .orderBy(asc(t.contextAttachments.order));
  }

  async listForOwner(
    repoId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
  ): Promise<AttachmentRow[]> {
    return this.db
      .select()
      .from(t.contextAttachments)
      .where(
        and(
          eq(t.contextAttachments.repoId, repoId),
          eq(t.contextAttachments.ownerType, ownerType),
          eq(t.contextAttachments.ownerId, ownerId),
        ),
      )
      .orderBy(asc(t.contextAttachments.order));
  }

  /**
   * Replace an owner's ordered set (order = index) atomically: delete-then-insert
   * keeps the unique (owner, order) index satisfiable and never leaves a half set.
   */
  async setForOwner(
    repoId: string,
    ownerType: ContextOwnerType,
    ownerId: string,
    paths: string[],
  ): Promise<AttachmentRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.contextAttachments)
        .where(
          and(
            eq(t.contextAttachments.repoId, repoId),
            eq(t.contextAttachments.ownerType, ownerType),
            eq(t.contextAttachments.ownerId, ownerId),
          ),
        );
      if (paths.length === 0) return [];
      return tx
        .insert(t.contextAttachments)
        .values(paths.map((path, order) => ({ repoId, ownerType, ownerId, path, order })))
        .returning();
    });
  }

  /** Remove every attachment of a path in a repo (document deleted). Returns rows removed. */
  async deleteByPath(repoId: string, path: string): Promise<number> {
    const rows = await this.db
      .delete(t.contextAttachments)
      .where(and(eq(t.contextAttachments.repoId, repoId), eq(t.contextAttachments.path, path)))
      .returning({ id: t.contextAttachments.id });
    return rows.length;
  }

  /** Attachments for a set of skill owners (any repo scope given). */
  private async skillAttachments(repoId: string, skillIds: string[]): Promise<AttachmentRow[]> {
    if (skillIds.length === 0) return [];
    return this.db
      .select()
      .from(t.contextAttachments)
      .where(
        and(
          eq(t.contextAttachments.repoId, repoId),
          eq(t.contextAttachments.ownerType, 'skill'),
          inArray(t.contextAttachments.ownerId, skillIds),
        ),
      )
      .orderBy(asc(t.contextAttachments.order));
  }

  /** An agent's linked skills in link order (enabled flag included). */
  private async linkedSkills(agentId: string): Promise<LinkedSkillRef[]> {
    const rows = await this.db
      .select({ id: t.skills.id, name: t.skills.name, enabled: t.skills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }

  /** Raw inputs of the effective set for one agent (agent own paths + enabled linked skills'). */
  async effectiveInputs(repoId: string, agentId: string): Promise<EffectiveInputs> {
    const [own, linked] = await Promise.all([
      this.listForOwner(repoId, 'agent', agentId),
      this.linkedSkills(agentId),
    ]);
    const enabled = linked.filter((s) => s.enabled);
    const att = await this.skillAttachments(
      repoId,
      enabled.map((s) => s.id),
    );
    return {
      agentPaths: own.map((r) => r.path),
      skills: enabled.map((s) => ({
        id: s.id,
        name: s.name,
        paths: att.filter((a) => a.ownerId === s.id).map((a) => a.path),
      })),
    };
  }

  /**
   * "Used by N": path -> distinct ENABLED agents (workspace) that use it directly
   * or via an enabled linked skill.
   */
  async usedByCounts(workspaceId: string, repoId: string): Promise<Map<string, number>> {
    const atts = await this.listForRepo(repoId);
    const result = new Map<string, number>();
    if (atts.length === 0) return result;

    const agents = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    const enabledAgents = new Set(agents.map((a) => a.id));

    const skillIds = [...new Set(atts.filter((a) => a.ownerType === 'skill').map((a) => a.ownerId))];
    const skillAgents = new Map<string, string[]>();
    if (skillIds.length > 0) {
      const links = await this.db
        .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId })
        .from(t.agentSkills)
        .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
        .where(and(inArray(t.agentSkills.skillId, skillIds), eq(t.skills.enabled, true)));
      for (const l of links) {
        skillAgents.set(l.skillId, [...(skillAgents.get(l.skillId) ?? []), l.agentId]);
      }
    }

    const users = new Map<string, Set<string>>();
    for (const a of atts) {
      const set = users.get(a.path) ?? new Set<string>();
      if (a.ownerType === 'agent') set.add(a.ownerId);
      else for (const ag of skillAgents.get(a.ownerId) ?? []) set.add(ag);
      users.set(a.path, set);
    }
    for (const [path, set] of users) {
      result.set(path, [...set].filter((id) => enabledAgents.has(id)).length);
    }
    return result;
  }
}
