import type { LLMProvider, SecretsProvider } from '@devdigest/shared';
import type { Db } from '../db/client.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';

export interface ContainerOverrides {
  secrets?: SecretsProvider;
  llm?: LLMProvider;
}

export interface Container {
  db: Db;
  secrets: SecretsProvider;
  llm: LLMProvider;
}

export function buildContainer(db: Db, overrides: ContainerOverrides = {}): Container {
  const secrets = overrides.secrets ?? new LocalSecretsProvider();
  const llm = overrides.llm ?? new OpenAIProvider(secrets.get('OPENAI_API_KEY'));
  return { db, secrets, llm };
}
