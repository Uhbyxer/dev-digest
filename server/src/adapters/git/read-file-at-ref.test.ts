import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from './simple-git.js';

describe('SimpleGitClient.readFileAtRef bounded read', () => {
  let root: string;
  const repo = { owner: 'o', name: 'r' };
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', join(root, 'o', 'r'), '-c', 'user.email=a@b.c', '-c', 'user.name=t', ...a], { stdio: 'ignore' });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gitref-'));
    await mkdir(join(root, 'o', 'r'), { recursive: true });
    git('init', '-q');
    await writeFile(join(root, 'o/r/small.md'), 'hello');
    await writeFile(join(root, 'o/r/big.md'), 'x'.repeat(5000));
    git('add', '.');
    git('commit', '-q', '-m', 'i');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('returns full content under the cap, null when absent', async () => {
    const c = new SimpleGitClient(root);
    expect(await c.readFileAtRef(repo, 'HEAD', 'small.md', 100)).toBe('hello');
    expect(await c.readFileAtRef(repo, 'HEAD', 'nope.md', 100)).toBeNull();
  });

  it('returns a maxBytes+1 truncation for an oversize blob (treated as oversize)', async () => {
    const c = new SimpleGitClient(root);
    const r = await c.readFileAtRef(repo, 'HEAD', 'big.md', 100);
    expect(r).toHaveLength(101);
  });
});
