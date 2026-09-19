import type { ConventionCandidateDetection } from './schemas.js';
import type { ConventionFileSample } from './prompt.js';

/**
 * Citation grounding for Convention candidates — the same mechanical-gate
 * philosophy as `groundFindings` (../grounding.ts), applied to the two-step
 * detection flow instead of diff findings: a candidate is kept only if its
 * `evidence_snippet` actually appears in the `evidence_path` file the caller
 * sampled, so a hallucinated quote never reaches the user as "evidence".
 */

export interface ConventionGroundingResult {
  kept: ConventionCandidateDetection[];
  dropped: { candidate: ConventionCandidateDetection; reason: string }[];
}

/** Collapse whitespace so line-wrapping/indentation differences don't break the match. */
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function groundConventionCandidates(
  candidates: ConventionCandidateDetection[],
  samples: ConventionFileSample[],
): ConventionGroundingResult {
  const contentByPath = new Map(samples.map((s) => [s.path, normalizeForMatch(s.content)]));
  const kept: ConventionCandidateDetection[] = [];
  const dropped: ConventionGroundingResult['dropped'] = [];

  for (const candidate of candidates) {
    const content = contentByPath.get(candidate.evidence_path);
    if (content === undefined) {
      dropped.push({ candidate, reason: `evidence_path "${candidate.evidence_path}" was not sampled` });
      continue;
    }
    if (!content.includes(normalizeForMatch(candidate.evidence_snippet))) {
      dropped.push({ candidate, reason: 'evidence_snippet does not appear in the sampled file content' });
      continue;
    }
    kept.push(candidate);
  }

  return { kept, dropped };
}
