import { z } from 'zod';

export const CreateAgentBody = z.object({
  name: z.string().min(1).max(80),
  prompt: z.string().min(1),
  model: z.string().min(1),
});

export const AgentIdParams = z.object({ agentId: z.string().uuid() });

export type CreateAgentInput = z.infer<typeof CreateAgentBody>;
