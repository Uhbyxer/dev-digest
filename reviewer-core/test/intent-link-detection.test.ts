/**
 * `detectLinkedSpecUrl` — decision #4 (docs/plans/intent-layer.md): a simple,
 * explicit heuristic — first http(s):// URL in the PR body that is NOT a
 * same-repo GitHub issue/PR self-reference (already covered by
 * `resolveLinkedIssue` upstream). Pure string/regex matching, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { detectLinkedSpecUrl } from '../src/intent/index.js';

const REPO = 'acme/widgets';

describe('detectLinkedSpecUrl', () => {
  it('detects a bare URL in the PR body', () => {
    const body = 'See the plan at https://example.com/spec/plan.md for details.';
    expect(detectLinkedSpecUrl(body, REPO)).toBe('https://example.com/spec/plan.md');
  });

  it('detects a URL embedded in a markdown link', () => {
    const body = 'Follow [the spec](https://docs.example.com/rfc/42) before reviewing.';
    expect(detectLinkedSpecUrl(body, REPO)).toBe('https://docs.example.com/rfc/42');
  });

  it('ignores a same-repo GitHub issue self-reference and returns undefined when nothing else is present', () => {
    const body = 'Closes https://github.com/acme/widgets/issues/471.';
    expect(detectLinkedSpecUrl(body, REPO)).toBeUndefined();
  });

  it('ignores a same-repo GitHub PR self-reference and returns undefined when nothing else is present', () => {
    const body = 'Follow-up to https://github.com/acme/widgets/pull/12.';
    expect(detectLinkedSpecUrl(body, REPO)).toBeUndefined();
  });

  it('skips a same-repo self-reference but still finds a later real spec URL', () => {
    const body =
      'Closes https://github.com/acme/widgets/issues/471. Spec: https://example.com/spec.md';
    expect(detectLinkedSpecUrl(body, REPO)).toBe('https://example.com/spec.md');
  });

  it('does not exclude a different repo\'s GitHub issue link (not a self-reference)', () => {
    const body = 'See https://github.com/other/repo/issues/9 for background.';
    expect(detectLinkedSpecUrl(body, REPO)).toBe('https://github.com/other/repo/issues/9');
  });

  it('returns undefined when no URL is present at all', () => {
    const body = 'Fixes the off-by-one error in the pagination logic. Closes #471.';
    expect(detectLinkedSpecUrl(body, REPO)).toBeUndefined();
  });
});
