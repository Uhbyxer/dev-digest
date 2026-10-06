import { createHash } from 'node:crypto';
import type { Finding } from '@devdigest/shared';

export function fingerprint(f: Finding): string {
  return createHash('sha1').update(`${f.file}:${f.line}:${f.title}`).digest('hex');
}
