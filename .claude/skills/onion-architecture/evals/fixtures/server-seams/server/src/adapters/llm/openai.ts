import OpenAI from 'openai';
import type { LLMProvider, LLMRequest, LLMResponse } from '@devdigest/shared';

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_tokens: req.maxTokens,
    });
    return {
      text: res.choices[0]?.message.content ?? '',
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
    };
  }
}
