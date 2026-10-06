import type { FastifyBaseLogger } from 'fastify';
import type { Finding } from '@devdigest/shared';

export function traceFindings(log: FastifyBaseLogger, runId: string, findings: Finding[]): void {
  log.info({ runId, count: findings.length }, 'review produced findings');
  for (const f of findings) {
    log.debug({ runId, file: f.file, line: f.line, severity: f.severity }, f.title);
  }
}
