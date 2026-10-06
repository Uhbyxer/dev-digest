import type { GitHubClient, Notifier } from '@devdigest/shared';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';

export interface PullRequestEvent {
  action: 'opened' | 'synchronize' | 'closed';
  repo: { owner: string; name: string };
  number: number;
  installationToken: string;
}

export class WebhookService {
  constructor(
    private readonly github: GitHubClient,
    private readonly notifier: Notifier,
  ) {}

  async handlePullRequest(event: PullRequestEvent): Promise<void> {
    if (event.action === 'closed') return;
    const client = new OctokitGitHubClient(event.installationToken);
    const pr = await client.getPull(event.repo.owner, event.repo.name, event.number);
    await this.notifier.send({
      title: `PR #${pr.number} ${event.action}`,
      body: `${pr.title} — ${pr.changedFiles} files changed`,
    });
  }
}
