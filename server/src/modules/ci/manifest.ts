import { stringify } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';

/**
 * Serialize an agent to the manifest YAML the CI runner reads (AC-5, AC-36).
 * Validated with the SAME `AgentManifest` schema the runner uses, so the two
 * ends cannot drift. `skills` are slugs resolving to `.devdigest/skills/<slug>.md`.
 */
export function buildManifest(
  agent: Pick<AgentRow, 'name' | 'provider' | 'model' | 'systemPrompt' | 'strategy' | 'ciFailOn'>,
  skillSlugs: string[],
): string {
  const candidate = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  const parsed = AgentManifest.safeParse(candidate);
  if (!parsed.success) {
    throw new ValidationError('Agent cannot be exported: manifest is invalid', parsed.error.flatten());
  }
  return stringify(candidate);
}

/** A skill's shipped file body (`.devdigest/skills/<slug>.md`). */
export function skillFileBody(skill: Pick<SkillRow, 'body'>): string {
  return skill.body.endsWith('\n') ? skill.body : `${skill.body}\n`;
}
