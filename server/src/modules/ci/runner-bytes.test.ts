import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FsRunnerBundleProvider } from '../../adapters/runner-bundle/index.js';
import { assembleCiFiles } from './files.js';
import { RUNNER_PATH } from './workflow.js';
import type { AgentRow } from '../../db/rows.js';

const DIST = fileURLToPath(new URL('../../../../agent-runner/dist/index.js', import.meta.url));
const agent = {
  id: 'a1', name: 'A', provider: 'openrouter', model: 'm/x', systemPrompt: 'p',
  strategy: 'auto', ciFailOn: 'critical', createdAt: new Date(2026, 0, 1),
} as unknown as AgentRow;

describe('exported runner == committed agent-runner/dist/index.js', () => {
  it('the provider returns the dist bytes and the shipped runner file carries them unchanged', async () => {
    const dist = await readFile(DIST, 'utf8');
    expect(dist.length).toBeGreaterThan(1000);

    const runner = await new FsRunnerBundleProvider().read();
    expect(runner).toBe(dist);

    const files = assembleCiFiles({
      agent, linkedSkills: [], allAgents: [agent], allSkills: [],
      target: 'gha', triggers: ['opened'], postAs: 'github_review', runnerContents: runner,
    });
    const shipped = files.find((f) => f.path === RUNNER_PATH)!;
    expect(shipped.contents).toBe(dist);
    expect(shipped.size_bytes).toBe(Buffer.byteLength(dist, 'utf8'));
  });
});
