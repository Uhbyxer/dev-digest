import type { LLMClient } from '../llm/types.js';
import { assemblePrompt, type PromptInput } from './assemble-prompt.js';
import { parseFindings } from '../output/parse-findings.js';

export async function runReview(llm: LLMClient, input: PromptInput) {
  const prompt = assemblePrompt(input);
  const res = await llm.complete({ ...prompt, maxTokens: 4000 });
  return { findings: parseFindings(res.text), tokensIn: res.tokensIn, tokensOut: res.tokensOut };
}
