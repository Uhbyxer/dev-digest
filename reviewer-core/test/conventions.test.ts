/**
 * Conventions detection — two-step prompt-building + schema shape. Pure/
 * hermetic: no database, no network, no LLM call (this package only builds
 * the messages arrays and validates the shape of what comes back).
 */
import { describe, it, expect } from 'vitest';
import {
  buildFileSelectionPrompt,
  buildExtractionPrompt,
  ConventionFileSelectionResult,
  ConventionExtractionResult,
  type ConventionFileSample,
  type ConventionFileGroup,
} from '../src/conventions/index.js';

const samples: ConventionFileSample[] = [
  { path: 'src/a.ts', content: 'export async function a() { await b(); }' },
  { path: 'src/b.ts', content: 'export async function b() { return 1; }' },
  { path: 'src/c.ts', content: 'export function c() { return c.then(); }' },
];

describe('buildFileSelectionPrompt', () => {
  it('returns a 2-message [system, user] array', () => {
    const messages = buildFileSelectionPrompt(samples);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  it('scopes the system message to code-style, not security/perf/correctness', () => {
    const [system] = buildFileSelectionPrompt(samples);
    expect(system!.content).toMatch(/code-style/i);
    expect(system!.content).toMatch(/security|performance|correctness/i);
    expect(system!.content).toMatch(/not|never/i);
  });

  it('renders every sample path and content, wrapped as untrusted', () => {
    const [, user] = buildFileSelectionPrompt(samples);
    for (const s of samples) {
      expect(user!.content).toContain(`### ${s.path}`);
      expect(user!.content).toContain(s.content);
      expect(user!.content).toContain(`<untrusted source="file:${s.path}">`);
    }
  });

  it('truncates an oversized sample', () => {
    const huge = { path: 'src/huge.ts', content: 'x'.repeat(10_000) };
    const [, user] = buildFileSelectionPrompt([huge]);
    // truncated content is present but the raw untruncated content is not
    expect(user!.content).not.toContain('x'.repeat(10_000));
    expect(user!.content).toContain('x'.repeat(4000));
    expect(user!.content).not.toContain('x'.repeat(4001));
  });
});

describe('buildExtractionPrompt', () => {
  const group: ConventionFileGroup = {
    theme: 'async/await style',
    files: ['src/a.ts', 'src/b.ts'],
    rationale: 'Both consistently use async/await, never .then() chains.',
  };

  it('returns a 2-message [system, user] array', () => {
    const messages = buildExtractionPrompt(group, samples);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
  });

  it('includes the group theme and rationale', () => {
    const [, user] = buildExtractionPrompt(group, samples);
    expect(user!.content).toContain(group.theme);
    expect(user!.content).toContain(group.rationale);
  });

  it('renders only the group files, not files outside the group', () => {
    const [, user] = buildExtractionPrompt(group, samples);
    expect(user!.content).toContain('src/a.ts');
    expect(user!.content).toContain('src/b.ts');
    expect(user!.content).not.toContain('### src/c.ts');
    expect(user!.content).not.toContain('c.then()');
  });

  it('system message requires evidence to come from the group only', () => {
    const [system] = buildExtractionPrompt(group, samples);
    expect(system!.content).toMatch(/evidence_path/);
    expect(system!.content).toMatch(/evidence_snippet/);
    expect(system!.content).toMatch(/confidence/);
  });
});

describe('ConventionFileSelectionResult schema', () => {
  it('parses a valid fixture', () => {
    const result = ConventionFileSelectionResult.safeParse({
      groups: [
        { theme: 'async style', files: ['src/a.ts'], rationale: 'uses async/await' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a group with no files', () => {
    const result = ConventionFileSelectionResult.safeParse({
      groups: [{ theme: 'async style', files: [], rationale: 'uses async/await' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('ConventionExtractionResult schema', () => {
  it('parses a valid fixture', () => {
    const result = ConventionExtractionResult.safeParse({
      candidates: [
        {
          rule: 'Always use async/await',
          evidence_path: 'src/a.ts',
          evidence_snippet: 'export async function a()',
          confidence: 0.9,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence out of range', () => {
    const result = ConventionExtractionResult.safeParse({
      candidates: [
        {
          rule: 'Always use async/await',
          evidence_path: 'src/a.ts',
          evidence_snippet: 'export async function a()',
          confidence: 1.5,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a candidate missing evidence_path', () => {
    const result = ConventionExtractionResult.safeParse({
      candidates: [
        {
          rule: 'Always use async/await',
          evidence_snippet: 'export async function a()',
          confidence: 0.9,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
