import type { Finding } from '@devdigest/shared';

export function formatFinding(f: Finding): string {
  return `[${f.severity.toUpperCase()}] ${f.file}:${f.line} ${f.title}`;
}
