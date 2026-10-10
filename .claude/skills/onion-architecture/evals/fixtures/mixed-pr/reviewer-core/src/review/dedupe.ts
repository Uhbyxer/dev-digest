import type { Finding } from '@devdigest/shared';

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.title.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || severityRank(f.severity) > severityRank(existing.severity)) seen.set(key, f);
  }
  return [...seen.values()];
}

function severityRank(s: Finding['severity']): number {
  return { info: 0, warning: 1, critical: 2 }[s];
}
