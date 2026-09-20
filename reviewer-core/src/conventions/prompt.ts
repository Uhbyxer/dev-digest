import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '../prompt.js';
import type { ConventionFileGroup } from './schemas.js';

/**
 * Prompt-building for the two-step convention-detection flow. Pure, no I/O —
 * mirrors reviewer-core/src/prompt.ts's trust model: repo file content is
 * UNTRUSTED DATA (the caller supplies it, not us), so it is delimiter-wrapped
 * the same way `repoMap`/`callers` are in `assemblePrompt`. This module does
 * not append the shared INJECTION_GUARD itself — the server orchestration
 * layer decides whether/how that combines with these system messages; here we
 * only wrap the untrusted content so nothing downstream forgets to.
 */

export interface ConventionFileSample {
  path: string;
  content: string;
}

/** Cap each sampled file's content so a huge file can't blow the token budget. */
const MAX_FILE_CHARS = 4000;

function truncate(content: string): string {
  return content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) : content;
}

/**
 * Render samples one `### <path>` section per file, each independently
 * wrapped as untrusted (`file:<path>`) rather than one wrap around the whole
 * listing. Per-file wrapping keeps the `<untrusted source="...">` label
 * aligned 1:1 with `evidence_path` in the extraction step's output, so a
 * later grounding check (mirroring `groundFindings`) can look up exactly the
 * block a candidate's evidence came from.
 */
function renderSamples(samples: ConventionFileSample[]): string {
  return samples
    .map((s) => `### ${s.path}\n${wrapUntrusted(`file:${s.path}`, truncate(s.content))}`)
    .join('\n\n');
}

const FILE_SELECTION_SYSTEM =
  'You are analyzing a sample of files from a code repository to find recurring ' +
  'CODE-STYLE / house-convention patterns — things like naming conventions, error-handling ' +
  'idioms, async style (e.g. always async/await vs `.then()` chains), module structure, ' +
  'import ordering, or other stylistic choices a team consistently follows.\n' +
  'Scope: code-style/house-convention patterns ONLY. Do NOT flag security vulnerabilities, ' +
  'performance issues, or correctness/logic defects — those belong to a separate review ' +
  'pipeline, not this one.\n' +
  'Group the given files by shared pattern you can actually see recurring ACROSS multiple ' +
  'files (not a one-off in a single file). Each group needs a short `theme`, the `files` ' +
  '(by path, drawn only from the files given to you) that exhibit it, and a `rationale` ' +
  'explaining what you observed. A file may appear in more than one group if it exhibits ' +
  'more than one pattern. Omit a group if you cannot point to at least one concrete instance.';

export function buildFileSelectionPrompt(samples: ConventionFileSample[]): ChatMessage[] {
  const user = `## Sample files\n${renderSamples(samples)}`;
  return [
    { role: 'system', content: FILE_SELECTION_SYSTEM },
    { role: 'user', content: user },
  ];
}

const EXTRACTION_SYSTEM =
  'You are extracting concrete, evidence-backed code-style convention candidates from a ' +
  'group of files that were already identified as sharing a pattern.\n' +
  'Scope: code-style/house-convention patterns ONLY — not security, performance, or ' +
  'correctness findings.\n' +
  'For each convention candidate, return `{rule, evidence_path, evidence_snippet, ' +
  'confidence}`:\n' +
  '- `rule`: a concise, actionable statement of the convention (e.g. "Always use ' +
  'async/await; never `.then()` chains").\n' +
  '- `evidence_path`: MUST be exactly one of the file paths in the given group — never a ' +
  'path outside it.\n' +
  '- `evidence_snippet`: an ACTUAL quoted excerpt from that file\'s sampled content below — ' +
  'never a paraphrase or a snippet you did not see verbatim in the sample.\n' +
  '- `confidence`: your own certainty (0-1) that this is a real, recurring convention in ' +
  'this codebase, not a one-off.\n' +
  'Extract candidates from the given group only — do not consider files outside it.';

export function buildExtractionPrompt(
  group: ConventionFileGroup,
  samples: ConventionFileSample[],
): ChatMessage[] {
  const groupSamples = samples.filter((s) => group.files.includes(s.path));
  const user =
    `## Group\ntheme: ${group.theme}\nrationale: ${group.rationale}\nfiles: ${group.files.join(', ')}\n\n` +
    `## Sample files\n${renderSamples(groupSamples)}`;
  return [
    { role: 'system', content: EXTRACTION_SYSTEM },
    { role: 'user', content: user },
  ];
}
