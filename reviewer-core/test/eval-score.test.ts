import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { locationsHit, scoreCase, scoreEvalRun, type EvalCaseOutcome } from '../src/eval/score.js';

const loc = (file: string, s: number, e = s) => ({ file, start_line: s, end_line: e });
const mustFind = (file: string, s: number, e = s) => ({ type: 'must_find' as const, ...loc(file, s, e) });
const mustNot = (file: string, s: number, e = s) => ({ type: 'must_not_flag' as const, ...loc(file, s, e) });

describe('locationsHit', () => {
  it('needs the same file', () => expect(locationsHit(loc('a.ts', 5), loc('b.ts', 5))).toBe(false));
  it('hits on overlap, including the boundary line', () => {
    expect(locationsHit(loc('a.ts', 10, 12), loc('a.ts', 12, 20))).toBe(true);
    expect(locationsHit(loc('a.ts', 10, 12), loc('a.ts', 13, 20))).toBe(false);
  });
  it('tolerates a reversed range', () => expect(locationsHit(loc('a.ts', 12, 10), loc('a.ts', 11))).toBe(true));
});

describe('scoreCase', () => {
  it('must_find passes when a finding hits', () => {
    const s = scoreCase({ expectation: mustFind('a.ts', 5), findings: [loc('a.ts', 4, 6)], dropped: 0 });
    expect(s).toMatchObject({ hit: true, pass: true, noise: 0 });
  });
  it('must_not_flag fails when a finding hits, and counts it as noise', () => {
    const s = scoreCase({ expectation: mustNot('a.ts', 5), findings: [loc('a.ts', 5), loc('a.ts', 5)], dropped: 0 });
    expect(s).toMatchObject({ hit: true, pass: false, noise: 2 });
  });
  it('must_not_flag passes with no findings', () => {
    expect(scoreCase({ expectation: mustNot('a.ts', 5), findings: [], dropped: 0 }).pass).toBe(true);
  });
});

describe('scoreEvalRun', () => {
  const outcomes: EvalCaseOutcome[] = [
    { expectation: mustFind('a.ts', 5), findings: [loc('a.ts', 5)], dropped: 1 }, // hit
    { expectation: mustFind('b.ts', 9), findings: [loc('b.ts', 1)], dropped: 0 }, // miss (finding elsewhere)
    { expectation: mustNot('c.ts', 3), findings: [loc('c.ts', 3), loc('c.ts', 40)], dropped: 0 }, // 1 noise
  ];
  it('computes recall, precision and citation accuracy', () => {
    const r = scoreEvalRun(outcomes);
    expect(r.recall).toBeCloseTo(1 / 2);
    expect(r.precision).toBeCloseTo(3 / 4); // 4 findings, 1 hits a must_not_flag
    expect(r.citation_accuracy).toBeCloseTo(4 / 5); // 4 kept, 1 dropped
    expect(r.cases_total).toBe(3);
    expect(r.cases_passed).toBe(1);
  });
  it('treats empty denominators as perfect', () => {
    const r = scoreEvalRun([{ expectation: mustNot('a.ts', 1), findings: [], dropped: 0 }]);
    expect(r).toMatchObject({ recall: 1, precision: 1, citation_accuracy: 1, cases_passed: 1 });
    expect(scoreEvalRun([])).toMatchObject({ recall: 1, precision: 1, cases_total: 0 });
  });
  it('makes no LLM call: the module imports nothing', () => {
    const src = readFileSync(new URL('../src/eval/score.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
