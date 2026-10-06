import type { Finding } from '@devdigest/shared';

export async function publishSummary(opts: {
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  findings: Finding[];
}): Promise<void> {
  const body = opts.findings.length
    ? opts.findings.map((f) => `- **${f.severity}** ${f.file}:${f.line} — ${f.title}`).join('\n')
    : 'No findings.';
  const res = await fetch(
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/issues/${opts.prNumber}/comments`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
}
