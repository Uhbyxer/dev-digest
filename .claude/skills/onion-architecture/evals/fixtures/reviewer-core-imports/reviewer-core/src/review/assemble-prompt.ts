import type { Finding } from '@devdigest/shared';

export interface PromptInput {
  diff: string;
  conventions: string[];
  priorFindings: Finding[];
}

export function assemblePrompt(input: PromptInput): { system: string; user: string } {
  const rules = input.conventions.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const prior = input.priorFindings.map((f) => `- ${f.file}:${f.line} ${f.title}`).join('\n');
  return {
    system: `You review pull requests.\nProject conventions:\n${rules}`,
    user: `Previously reported:\n${prior || '(none)'}\n\nDiff:\n${input.diff}`,
  };
}
