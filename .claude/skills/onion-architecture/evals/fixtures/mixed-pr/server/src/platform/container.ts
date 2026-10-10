import type { GitHubClient, Notifier, SecretsProvider } from '@devdigest/shared';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SlackNotifier } from '../adapters/slack/notifier.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';

export interface ContainerOverrides {
  secrets?: SecretsProvider;
  github?: GitHubClient;
  notifier?: Notifier;
}

export interface Container {
  secrets: SecretsProvider;
  github: GitHubClient;
  notifier: Notifier;
}

export function buildContainer(overrides: ContainerOverrides = {}): Container {
  const secrets = overrides.secrets ?? new LocalSecretsProvider();
  return {
    secrets,
    github: overrides.github ?? new OctokitGitHubClient(secrets.get('GITHUB_TOKEN')),
    notifier: overrides.notifier ?? new SlackNotifier(secrets.get('SLACK_WEBHOOK_URL')),
  };
}
