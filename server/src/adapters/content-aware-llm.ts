import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Review,
} from '@devdigest/shared';

/**
 * T13 — a content-aware fake LLM, distinct from `MockLLMProvider`
 * (`./mocks.ts`, not modified by this feature). Where `MockLLMProvider`
 * always returns the same canned fixture regardless of what it was asked,
 * this fake inspects the prompt messages it actually receives for specific
 * skill-body substrings and returns a DIFFERENT canned `Review` depending on
 * whether they're present.
 *
 * This is the control-experiment fixture: a plain `MockLLMProvider` with two
 * arbitrary fixtures would pass even if `assemblePrompt` silently stopped
 * wiring skills into the prompt at all (both runs would just get whichever
 * fixture the test wired up, with no way to see the wiring broke). This fake
 * only returns the "skill saw it" fixture when the skill's body text is
 * ACTUALLY present in the assembled prompt.
 */
export interface ContentAwareRule {
  /** Exact substring to search for in the joined prompt message content. */
  contains: string;
  /** Review to return when `contains` is found. */
  review: Review;
}

export class ContentAwareFakeLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    private rules: ContentAwareRule[],
    private fallback: Review,
    id: 'openai' | 'anthropic' = 'openai',
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'fake-content-aware', provider: this.id }];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return { text: 'fake completion', model: req.model, tokensIn: 100, tokensOut: 50, costUsd: 0.001 };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const text = req.messages.map((m) => m.content).join('\n');
    const matched = this.rules.find((r) => text.includes(r.contains));
    const fixture = matched?.review ?? this.fallback;
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`ContentAwareFakeLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(1536).fill(0));
  }
}
