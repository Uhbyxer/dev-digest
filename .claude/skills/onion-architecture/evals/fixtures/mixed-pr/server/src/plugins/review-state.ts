import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    reviewState: { seenFiles: Set<string>; findingCount: number };
  }
}

export default fp(async function reviewState(app: FastifyInstance) {
  app.decorateRequest('reviewState', { seenFiles: new Set<string>(), findingCount: 0 });

  app.addHook('onRequest', async (req) => {
    req.reviewState.findingCount = 0;
  });
});
