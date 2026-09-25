import type { ReviewDto } from '@devdigest/server/modules/reviews/helpers.js';

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
