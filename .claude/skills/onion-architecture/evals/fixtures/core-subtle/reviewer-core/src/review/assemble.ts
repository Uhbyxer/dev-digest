import type { Finding } from '@devdigest/shared';
import { fingerprint } from './fingerprint.js';

export function dropRepeated(findings: Finding[], alreadySeen: Set<string>): Finding[] {
  return findings.filter((f) => !alreadySeen.has(fingerprint(f)));
}
