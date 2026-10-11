import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockGitHubClient } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import { CiRepository } from './repository.js';
import { CiService } from './service.js';

const agent = {
  id: 'a1', workspaceId: 'ws', name: 'Sec', description: '', provider: 'openrouter', model: 'm/x',
  systemPrompt: 'Review.', ciFailOn: 'critical', enabled: true, tags: [], scope: [], updatedAt: new Date(),
};
const input = {
  action: 'open_pr', target: 'gha', repo: 'acme/widgets', base: 'main', post_as: 'github_review', triggers: ['pull_request'],
} as never;

function setup(installed: { agentId: string; agentName: string }[]) {
  vi.spyOn(CiRepository.prototype, 'findRepoInstallations').mockResolvedValue(installed);
  vi.spyOn(CiRepository.prototype, 'listSkills').mockResolvedValue([]);
  vi.spyOn(CiRepository.prototype, 'upsertInstallation').mockResolvedValue({
    id: 'i1', agentId: 'a1', repo: 'acme/widgets', targetType: 'gha', installedAt: new Date(), status: 'pending', workflowVersion: '1',
  } as never);
  const github = new MockGitHubClient({});
  const commit = vi.spyOn(github, 'commitFiles');
  const container = {
    db: {},
    github: async () => github,
    runnerBundle: { read: async () => 'runner' },
    agentsRepo: {
      getById: async () => agent,
      linkedSkills: async () => [],
      list: async () => [agent],
    },
  } as unknown as Container;
  return { commit, service: new CiService(container) };
}

afterEach(() => vi.restoreAllMocks());

describe('CiService.export', () => {
  it('rejects when another agent already has CI installed on the repo', async () => {
    const { service, commit } = setup([{ agentId: 'other', agentName: 'Perf' }]);
    await expect(service.export('ws', 'a1', input)).rejects.toMatchObject({
      statusCode: 422,
      message: 'repo already has DevDigest CI installed for agent Perf; one agent per repo in v1',
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('first export commits memory.jsonl; re-export for the same agent omits it', async () => {
    const first = setup([]);
    await first.service.export('ws', 'a1', input);
    const paths1 = first.commit.mock.calls[0]![1].files.map((f: { path: string }) => f.path);
    expect(paths1).toContain('.devdigest/memory.jsonl');

    vi.restoreAllMocks();
    const again = setup([{ agentId: 'a1', agentName: 'Sec' }]);
    await again.service.export('ws', 'a1', input);
    const paths2 = again.commit.mock.calls[0]![1].files.map((f: { path: string }) => f.path);
    expect(paths2).not.toContain('.devdigest/memory.jsonl');
    expect(paths2.length).toBe(paths1.length - 1);
  });
});
