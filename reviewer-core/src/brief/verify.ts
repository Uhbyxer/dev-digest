import { MAX_BRIEF_RISKS, MAX_REVIEW_FOCUS } from '@devdigest/shared';
import { lineInRanges, type LineRange } from './ranges.js';
import type { BriefLlmResult } from './schemas.js';

export const BRIEF_MAX_RISKS = MAX_BRIEF_RISKS;
export const BRIEF_MAX_FOCUS = MAX_REVIEW_FOCUS;

export interface VerifiedBrief {
  summary: string;
  risks: BriefLlmResult['risks'];
  review_focus: { file: string; line?: number; reason: string }[];
}

export interface BriefVerifyContext {
  /** The PR's files → their changed line ranges. */
  prFiles: ReadonlyMap<string, readonly LineRange[]>;
  /** Files of the Blast radius callers: valid to name, but have no verifiable lines. */
  blastFiles: ReadonlySet<string>;
}

/**
 * Drop everything the PR cannot back up (ADR-0004), never re-asking the model:
 * a file outside the PR files / Blast callers is removed; a risk left with no
 * file is dropped; a `line` outside the changed ranges of its file is cleared
 * and the item keeps only its file. Results are capped.
 */
export function verifyBrief(r: BriefLlmResult, ctx: BriefVerifyContext): VerifiedBrief {
  const known = (f: string) => ctx.prFiles.has(f) || ctx.blastFiles.has(f);

  const risks = r.risks
    .map((risk) => ({
      ...risk,
      title: risk.title.trim(),
      explanation: risk.explanation.trim(),
      file_refs: [...new Set(risk.file_refs.filter(known))],
    }))
    .filter((risk) => risk.title && risk.file_refs.length > 0)
    .slice(0, BRIEF_MAX_RISKS);

  const seen = new Set<string>();
  const review_focus: VerifiedBrief['review_focus'] = [];
  for (const item of r.review_focus) {
    if (!known(item.file) || !item.reason.trim()) continue;
    const ranges = ctx.prFiles.get(item.file);
    const line = item.line != null && ranges && lineInRanges(item.line, ranges) ? item.line : undefined;
    const key = `${item.file}:${line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    review_focus.push({ file: item.file, ...(line !== undefined ? { line } : {}), reason: item.reason.trim() });
    if (review_focus.length >= BRIEF_MAX_FOCUS) break;
  }

  return { summary: r.summary.trim(), risks, review_focus };
}
