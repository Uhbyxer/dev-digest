import type { FastifyRequest } from 'fastify';
import type { Notifier } from '@devdigest/shared';
import type { AgentRow } from '../../db/rows.js';
import { AgentsRepository } from './repository.js';
import { CreateAgentBody } from './schemas.js';
import { normalizeAgentName } from './helpers.js';

export class AgentsService {
  constructor(
    private readonly repo: AgentsRepository,
    private readonly notifier: Notifier,
  ) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.repo.list(workspaceId);
  }

  async create(req: FastifyRequest, input: unknown): Promise<AgentRow> {
    const body = CreateAgentBody.parse(input);
    const { workspaceId } = req.params as { workspaceId: string };
    const name = normalizeAgentName(body.name);
    const existing = await this.repo.findByName(workspaceId, name);
    if (existing) return existing;
    const created = await this.repo.insert({ workspaceId, name, prompt: body.prompt, model: body.model });
    await this.notifier.send({ title: 'Agent created', body: created.name });
    return created;
  }
}
