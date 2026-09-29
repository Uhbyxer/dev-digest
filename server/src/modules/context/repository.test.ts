import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextRepository } from './repository.js';
import type { Db } from '../../db/client.js';

afterEach(() => vi.restoreAllMocks());

const A = '.devdigest/specs/a.md';
const B = '.devdigest/docs/b.md';

/** Fake drizzle chain: 1st select = enabled agents, 2nd = skill->agent links. */
function fakeDb(enabledAgents: string[], links: { skillId: string; agentId: string }[]) {
  const results = [enabledAgents.map((id) => ({ id })), links];
  let call = 0;
  const chain = () => {
    const rows = results[call++] ?? [];
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.innerJoin = () => q;
    q.where = () => Promise.resolve(rows);
    return q;
  };
  return { select: chain } as unknown as Db;
}

describe('ContextRepository.usedByCounts', () => {
  it('AC-9: counts distinct ENABLED agents, directly or via skills, without double counting', async () => {
    const repo = new ContextRepository(
      fakeDb(['ag1', 'ag2'], [
        { skillId: 's1', agentId: 'ag1' }, // ag1 also attaches A directly -> counted once
        { skillId: 's1', agentId: 'ag2' },
        { skillId: 's1', agentId: 'disabledAgent' },
      ]),
    );
    vi.spyOn(repo, 'listForRepo').mockResolvedValue([
      { ownerType: 'agent', ownerId: 'ag1', path: A },
      { ownerType: 'skill', ownerId: 's1', path: A },
      { ownerType: 'agent', ownerId: 'disabledAgent', path: B },
    ] as never);
    const m = await repo.usedByCounts('w1', 'r1');
    expect(m.get(A)).toBe(2);
    expect(m.get(B)).toBe(0);
  });

  it('returns an empty map without querying when nothing is attached', async () => {
    const repo = new ContextRepository({ select: () => { throw new Error('no query expected'); } } as unknown as Db);
    vi.spyOn(repo, 'listForRepo').mockResolvedValue([]);
    expect((await repo.usedByCounts('w1', 'r1')).size).toBe(0);
  });
});
