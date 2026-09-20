/**
 * T11 — assemblePrompt skill trust-tier split (ADR-0001 / T4).
 *
 * A `manual` skill body is trusted and unwrapped; `imported_url` / `extracted`
 * / `community` skill bodies are delimiter-wrapped via `wrapUntrusted` and
 * covered by the injection guard, same treatment as diff/PR description/repo
 * map. Order in the assembled block matches the order skills were passed in
 * (mirroring `AgentSkillLink.order`). No DB, no network — pure function test.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

describe('assemblePrompt — skill trust tiers', () => {
  it('a manual skill body appears unwrapped', () => {
    const { messages } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      skills: [{ body: 'MANUAL-SKILL-BODY', source: 'manual' }],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('MANUAL-SKILL-BODY');
    expect(user).not.toMatch(/<untrusted[^>]*>\s*MANUAL-SKILL-BODY/);
  });

  it.each(['imported_url', 'extracted', 'community'] as const)(
    'a %s skill body is wrapped via wrapUntrusted and covered by the injection guard',
    (source) => {
      const { messages } = assemblePrompt({
        system: 'sys',
        diff: 'DIFF',
        skills: [{ body: 'UNTRUSTED-SKILL-BODY', source }],
      });
      const user = messages[1]!.content;
      expect(user).toContain(`<untrusted source="skill:${source}">`);
      expect(user).toContain('UNTRUSTED-SKILL-BODY');
      expect(user).toMatch(/<untrusted source="skill:\w+">\nUNTRUSTED-SKILL-BODY\n<\/untrusted>/);
    },
  );

  it('preserves the order skills were passed in (mirroring AgentSkillLink.order)', () => {
    const { messages } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      skills: [
        { body: 'FIRST-SKILL', source: 'manual' },
        { body: 'SECOND-SKILL', source: 'imported_url' },
        { body: 'THIRD-SKILL', source: 'manual' },
      ],
    });
    const user = messages[1]!.content;
    const iFirst = user.indexOf('FIRST-SKILL');
    const iSecond = user.indexOf('SECOND-SKILL');
    const iThird = user.indexOf('THIRD-SKILL');
    expect(iFirst).toBeGreaterThan(-1);
    expect(iSecond).toBeGreaterThan(iFirst);
    expect(iThird).toBeGreaterThan(iSecond);
  });

  it('a mix of manual and imported skills wraps only the imported ones', () => {
    const { messages } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      skills: [
        { body: 'TRUSTED-ONE', source: 'manual' },
        { body: 'UNTRUSTED-ONE', source: 'extracted' },
      ],
    });
    const user = messages[1]!.content;
    expect(user).toMatch(/TRUSTED-ONE(?!\s*<\/untrusted>)/);
    expect(user).toContain('<untrusted source="skill:extracted">\nUNTRUSTED-ONE\n</untrusted>');
  });
});
