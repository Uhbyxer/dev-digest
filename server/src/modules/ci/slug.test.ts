import { describe, it, expect } from 'vitest';
import { slugify, assignSlugs } from './slug.js';

const d = (n: number) => new Date(2026, 0, n);

describe('slugify (AC-6)', () => {
  it('produces filesystem-safe slugs matching ^[a-z0-9][a-z0-9-]*$', () => {
    for (const name of ['Security Reviewer', '  Ünïcode / Agent!! ', '../../etc/passwd', 'a__b']) {
      expect(slugify(name)).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
    expect(slugify('Security Reviewer')).toBe('security-reviewer');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
  });

  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!', 'agent')).toBe('agent');
  });
});

describe('assignSlugs', () => {
  it('disambiguates collisions deterministically by createdAt (-2, -3)', () => {
    const items = [
      { id: 'c', name: 'Reviewer', createdAt: d(3) },
      { id: 'a', name: 'reviewer', createdAt: d(1) },
      { id: 'b', name: 'Reviewer!', createdAt: d(2) },
    ];
    const slugs = assignSlugs(items);
    expect(slugs.get('a')).toBe('reviewer');
    expect(slugs.get('b')).toBe('reviewer-2');
    expect(slugs.get('c')).toBe('reviewer-3');
  });

  it('is stable regardless of input order (stable across re-exports)', () => {
    const items = [
      { id: 'a', name: 'X', createdAt: d(1) },
      { id: 'b', name: 'X', createdAt: d(2) },
    ];
    expect(assignSlugs(items)).toEqual(assignSlugs([...items].reverse()));
  });

  it('does not hand out a suffixed slug that another base already owns', () => {
    const slugs = assignSlugs([
      { id: 'a', name: 'x', createdAt: d(1) },
      { id: 'b', name: 'x', createdAt: d(2) },
      { id: 'c', name: 'x-2', createdAt: d(3) },
    ]);
    expect(new Set(slugs.values()).size).toBe(3);
  });
});
