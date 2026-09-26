import type { ReviewDto } from '@devdigest/server/modules/reviews/helpers.js';
import type { BlastRadius } from '@devdigest/shared';

/** Compact text rendering for get_blast_radius — never raw JSON. */
export function formatBlastRadius(blast: BlastRadius): string {
  const lines = [blast.summary];
  if (blast.degraded) {
    lines.push(`(degraded${blast.reason ? `: ${blast.reason}` : ''} — this map may be based on partial data)`);
  }
  if (blast.downstream.length === 0) return lines.join('\n');

  for (const d of blast.downstream) {
    lines.push('');
    lines.push(`## ${d.symbol}`);
    if (d.callers.length === 0) {
      lines.push('No callers found.');
    } else {
      for (const c of d.callers) lines.push(`- ${c.name} — ${c.file}:${c.line}`);
    }
    if (d.endpoints_affected.length > 0) lines.push(`Endpoints: ${d.endpoints_affected.join(', ')}`);
    if (d.crons_affected.length > 0) lines.push(`Crons: ${d.crons_affected.join(', ')}`);
  }
  return lines.join('\n');
}

/** Compact text rendering for run_review / get_findings — never raw JSON. */
export function formatReviews(reviews: ReviewDto[]): string {
  if (reviews.length === 0) return 'No findings recorded for this PR yet.';
  return reviews.map(formatReview).join('\n\n');
}

function formatReview(r: ReviewDto): string {
  const header = `## ${r.agent_name ?? 'unknown agent'} — ${r.verdict ?? 'no verdict'} (score ${r.score ?? 'n/a'})`;
  if (r.findings.length === 0) return `${header}\nNo findings.`;
  const findings = r.findings
    .map((f) => `- [${f.severity}] ${f.title} — ${f.file}:${f.start_line}-${f.end_line}\n  ${f.rationale}`)
    .join('\n');
  return `${header}\n${findings}`;
}
