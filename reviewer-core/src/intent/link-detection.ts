/**
 * Linked-spec URL detection (decision #4): a simple, explicit heuristic for
 * v1 — the first http(s):// URL in the PR body that is NOT a same-repo GitHub
 * issue/PR self-reference (already covered by `resolveLinkedIssue` upstream,
 * so we don't double-fetch what `linked_issue` already resolves). Pure
 * string/regex matching only — no fetch, no I/O.
 */

const URL_RE = /https?:\/\/[^\s)<>\]"']+/gi;

function isSameRepoSelfReference(url: string, repoFullName: string): boolean {
  const escaped = repoFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`github\\.com/${escaped}/(issues|pull)/\\d+`, 'i');
  return re.test(url);
}

export function detectLinkedSpecUrl(prBody: string, repoFullName: string): string | undefined {
  const matches = prBody.match(URL_RE);
  if (!matches) return undefined;
  for (const raw of matches) {
    // Strip common trailing punctuation picked up from prose/markdown (e.g. "see http://x.)").
    const url = raw.replace(/[).,;!?]+$/, '');
    if (!isSameRepoSelfReference(url, repoFullName)) return url;
  }
  return undefined;
}
