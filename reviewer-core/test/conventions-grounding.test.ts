/**
 * groundConventionCandidates — the mechanical gate that drops a Convention
 * candidate whose evidence_snippet was hallucinated (never actually appears
 * in the file the model cited).
 */
import { describe, it, expect } from 'vitest';
import { groundConventionCandidates } from '../src/conventions/grounding.js';
import type { ConventionCandidateDetection } from '../src/conventions/schemas.js';
import type { ConventionFileSample } from '../src/conventions/prompt.js';

const SAMPLES: ConventionFileSample[] = [
  { path: 'src/a.ts', content: 'export async function foo() {\n  await bar();\n  return 1;\n}\n' },
];

function candidate(overrides: Partial<ConventionCandidateDetection>): ConventionCandidateDetection {
  return {
    rule: 'Always use async/await',
    evidence_path: 'src/a.ts',
    evidence_snippet: 'await bar();',
    confidence: 0.9,
    ...overrides,
  };
}

describe('groundConventionCandidates', () => {
  it('keeps a candidate whose snippet is a real (whitespace-normalized) substring of the file', () => {
    const { kept, dropped } = groundConventionCandidates([candidate({})], SAMPLES);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it('keeps a snippet that only differs by line-wrapping/indentation from the file', () => {
    const c = candidate({ evidence_snippet: 'export async function foo() {   await bar();' });
    const { kept } = groundConventionCandidates([c], SAMPLES);
    expect(kept).toHaveLength(1);
  });

  it('drops a candidate whose snippet never appears in the cited file (hallucinated quote)', () => {
    const c = candidate({ evidence_snippet: 'const x = 1;' });
    const { kept, dropped } = groundConventionCandidates([c], SAMPLES);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toMatch(/does not appear/);
  });

  it('drops a candidate that cites a file outside the sampled set', () => {
    const c = candidate({ evidence_path: 'src/not-sampled.ts' });
    const { kept, dropped } = groundConventionCandidates([c], SAMPLES);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toMatch(/was not sampled/);
  });

  it('drops a snippet that reorders real fragments into a sequence the file never contains', () => {
    // "await bar();" and "return 1;" both individually exist, but never adjacent — a
    // plausible-looking stitched hallucination the grounding gate must still catch.
    const c = candidate({ evidence_snippet: 'await bar(); export async function foo()' });
    const { kept } = groundConventionCandidates([c], SAMPLES);
    expect(kept).toHaveLength(0);
  });
});
