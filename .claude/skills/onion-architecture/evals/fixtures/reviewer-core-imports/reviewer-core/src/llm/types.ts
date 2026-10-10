export interface LLMClient {
  complete(input: { system: string; user: string; maxTokens: number }): Promise<{ text: string; tokensIn: number; tokensOut: number }>;
}
