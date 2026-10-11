import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildManifest } from './manifest.js';

const agent = {
  name: 'Security Reviewer',
  provider: 'openrouter' as const,
  model: 'anthropic/claude-sonnet-4',
  systemPrompt: 'You review: "quotes", colons: and\nnewlines.\n',
  strategy: 'single-pass' as const,
  ciFailOn: 'warning' as const,
};

describe('buildManifest (AC-5, AC-36)', () => {
  it('emits YAML that validates against the shared AgentManifest schema', () => {
    const yaml = buildManifest(agent, ['sql-injection', 'secrets']);
    const parsed = AgentManifest.safeParse(parse(yaml));
    expect(parsed.success).toBe(true);
  });

  it('round-trips the agent fields exactly (incl. awkward prompt text)', () => {
    const out = parse(buildManifest(agent, ['a'])) as Record<string, unknown>;
    expect(out).toEqual({
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      system_prompt: agent.systemPrompt,
      skills: ['a'],
      strategy: 'single-pass',
      ci_fail_on: 'warning',
    });
  });

  it('ships an empty skills list for an agent with no skills (still valid)', () => {
    const out = AgentManifest.parse(parse(buildManifest(agent, [])));
    expect(out.skills).toEqual([]);
  });

  it('rejects an agent whose fields fail the schema', () => {
    expect(() => buildManifest({ ...agent, model: '' }, [])).toThrow();
  });
});
