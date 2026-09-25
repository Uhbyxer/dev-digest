import { describe, it, expect } from 'vitest';
import { parseRepoInput } from '../src/resolvers/repo-pr.js';

describe('parseRepoInput', () => {
  it('parses "owner/name" with a separately-given pr_number', () => {
    expect(parseRepoInput('acme/widgets', 7)).toEqual({ owner: 'acme', name: 'widgets', number: 7 });
  });

  it('parses a full GitHub PR URL, extracting the number', () => {
    expect(parseRepoInput('https://github.com/acme/widgets/pull/42')).toEqual({
      owner: 'acme',
      name: 'widgets',
      number: 42,
    });
  });

  it('does NOT match a PR URL merely embedded inside a longer string', () => {
    const input = 'see github.com/acme/widgets/pull/42 for context, but review acme/other';
    // Falls through to the "owner/name" branch, which rejects a string that
    // isn't exactly two slash-separated segments.
    expect(() => parseRepoInput(input)).toThrow();
  });

  it('rejects a malformed repo input', () => {
    expect(() => parseRepoInput('not-a-valid-repo-string')).toThrow();
  });
});
