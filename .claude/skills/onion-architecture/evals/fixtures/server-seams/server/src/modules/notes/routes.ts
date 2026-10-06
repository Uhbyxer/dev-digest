import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import OpenAI from 'openai';
import { NotesService } from './service.js';
import { NotesRepository } from './repository.js';

const SummarizeBody = z.object({ pullId: z.string().uuid(), maxWords: z.number().int().min(10).max(300) });

export async function notesRoutes(app: FastifyInstance) {
  const { container } = app;
  const repo = new NotesRepository(container.db);
  const service = new NotesService(repo, container.db);

  app.get('/workspaces/:workspaceId/pulls/:pullId/notes', async (req) => {
    const { workspaceId, pullId } = req.params as { workspaceId: string; pullId: string };
    return service.list(workspaceId, pullId);
  });

  app.post('/workspaces/:workspaceId/pulls/:pullId/notes', async (req, reply) => {
    const { workspaceId, pullId } = req.params as { workspaceId: string; pullId: string };
    const { body } = req.body as { body: string };
    const created = await service.add(workspaceId, pullId, body);
    return reply.code(201).send(created);
  });

  app.post('/workspaces/:workspaceId/notes/summarize', async (req) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const input = SummarizeBody.parse(req.body);
    const notes = await service.list(workspaceId, input.pullId);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Summarize in at most ${input.maxWords} words.` },
        { role: 'user', content: notes.map((n) => n.body).join('\n') },
      ],
    });
    return { summary: completion.choices[0]?.message.content ?? '' };
  });
}
