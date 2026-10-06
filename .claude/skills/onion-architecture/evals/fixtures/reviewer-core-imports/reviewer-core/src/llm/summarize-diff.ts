import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summarizeDiff(diff: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: `Summarize this diff in two sentences:\n\n${diff}` }],
  });
  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}
