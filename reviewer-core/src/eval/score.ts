/**
 * Eval scoring — pure code, no LLM, no I/O.
 *
 * An Eval case expects ONE thing at a location: `must_find` (the agent should
 * report a finding there) or `must_not_flag` (it should not). A finding "hits"
 * a location when it is in the same file and the line ranges overlap — category
 * and severity are ignored.
 */

export type EvalExpectationType = 'must_find' | 'must_not_flag';

export interface EvalExpectation {
  type: EvalExpectationType;
  file: string;
  start_line: number;
  end_line: number;
}

/** Where a finding sits — the only part of a finding scoring looks at. */
export interface FindingLocation {
  file: string;
  start_line: number;
  end_line: number;
}

/** What the agent produced for one case. */
export interface EvalCaseOutcome {
  expectation: EvalExpectation;
  /** Findings that survived the grounding gate. */
  findings: FindingLocation[];
  /** How many findings the grounding gate dropped. */
  dropped: number;
}

export interface EvalCaseScore {
  /** Some finding hit the case's location. */
  hit: boolean;
  /** must_find → hit; must_not_flag → not hit. */
  pass: boolean;
  /** Findings that hit a must_not_flag location (noise); 0 for must_find cases. */
  noise: number;
  findings: number;
  dropped: number;
}

export interface EvalRunScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  cases_total: number;
  cases_passed: number;
  per_case: EvalCaseScore[];
}

/** Same file + overlapping inclusive line ranges (either order of start/end). */
export function locationsHit(a: FindingLocation, b: FindingLocation): boolean {
  if (a.file !== b.file) return false;
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const bLo = Math.min(b.start_line, b.end_line);
  const bHi = Math.max(b.start_line, b.end_line);
  return aLo <= bHi && bLo <= aHi;
}

export function scoreCase(outcome: EvalCaseOutcome): EvalCaseScore {
  const hits = outcome.findings.filter((f) => locationsHit(f, outcome.expectation)).length;
  const hit = hits > 0;
  const mustFind = outcome.expectation.type === 'must_find';
  return {
    hit,
    pass: mustFind ? hit : !hit,
    noise: mustFind ? 0 : hits,
    findings: outcome.findings.length,
    dropped: outcome.dropped,
  };
}

/** A ratio with nothing to measure counts as perfect (nothing was missed). */
const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

/**
 * recall            = hit must_find cases / must_find cases
 * precision         = findings that hit no must_not_flag location / all findings
 * citation_accuracy = findings that survived grounding / all raw findings
 */
export function scoreEvalRun(outcomes: EvalCaseOutcome[]): EvalRunScore {
  const per_case = outcomes.map(scoreCase);
  const mustFind = outcomes.map((o, i) => ({ o, s: per_case[i]! })).filter((x) => x.o.expectation.type === 'must_find');
  const kept = per_case.reduce((n, s) => n + s.findings, 0);
  const dropped = per_case.reduce((n, s) => n + s.dropped, 0);
  const noise = per_case.reduce((n, s) => n + s.noise, 0);
  return {
    recall: ratio(mustFind.filter((x) => x.s.hit).length, mustFind.length),
    precision: ratio(kept - noise, kept),
    citation_accuracy: ratio(kept, kept + dropped),
    cases_total: per_case.length,
    cases_passed: per_case.filter((s) => s.pass).length,
    per_case,
  };
}
