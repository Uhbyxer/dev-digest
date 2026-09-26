import { describe, it, expect } from 'vitest';
import { mapBlastResultToContract } from '../src/modules/blast/mapper.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('mapBlastResultToContract', () => {
  it('groups callers by viaSymbol into one DownstreamImpact per changed symbol', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/b.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/caller1.ts', symbol: 'handler1', viaSymbol: 'foo', line: 10, rank: 5 },
        { file: 'src/caller2.ts', symbol: 'handler2', viaSymbol: 'foo', line: 20, rank: 2 },
        { file: 'src/caller3.ts', symbol: 'handler3', viaSymbol: 'bar', line: 30, rank: 1 },
      ],
      impactedEndpoints: ['GET /foo'],
      factsByFile: {
        'src/caller1.ts': { endpoints: ['GET /foo'], crons: [] },
        'src/caller3.ts': { endpoints: [], crons: ['nightly-sync'] },
      },
      degraded: false,
    };

    const contract = mapBlastResultToContract(result);

    expect(contract.changed_symbols).toEqual([
      { name: 'foo', file: 'src/a.ts', kind: 'function' },
      { name: 'bar', file: 'src/b.ts', kind: 'function' },
    ]);
    expect(contract.downstream).toHaveLength(2);
    expect(contract.downstream[0]).toEqual({
      symbol: 'foo',
      callers: [
        { name: 'handler1', file: 'src/caller1.ts', line: 10 },
        { name: 'handler2', file: 'src/caller2.ts', line: 20 },
      ],
      endpoints_affected: ['GET /foo'],
      crons_affected: [],
    });
    expect(contract.downstream[1]).toEqual({
      symbol: 'bar',
      callers: [{ name: 'handler3', file: 'src/caller3.ts', line: 30 }],
      endpoints_affected: [],
      crons_affected: ['nightly-sync'],
    });
    expect(contract.degraded).toBe(false);
    expect(contract.reason).toBeUndefined();
  });

  it('orders changed symbols by their highest-ranked caller, unranked symbols last', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'lowRank', kind: 'function' },
        { file: 'src/b.ts', name: 'noCallers', kind: 'function' },
        { file: 'src/c.ts', name: 'highRank', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'x', viaSymbol: 'lowRank', line: 1, rank: 1 },
        { file: 'src/y.ts', symbol: 'y', viaSymbol: 'highRank', line: 2, rank: 9 },
      ],
      impactedEndpoints: [],
      degraded: false,
    };

    const contract = mapBlastResultToContract(result);

    expect(contract.changed_symbols.map((s) => s.name)).toEqual([
      'highRank',
      'lowRank',
      'noCallers',
    ]);
  });

  it('passes degraded/reason through unchanged and produces empty endpoints/crons when factsByFile is absent', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/caller.ts', symbol: 'handler', viaSymbol: 'foo', line: 5, rank: 0 }],
      impactedEndpoints: ['GET /foo'],
      degraded: true,
      reason: 'no_data',
    };

    const contract = mapBlastResultToContract(result);

    expect(contract.degraded).toBe(true);
    expect(contract.reason).toBe('no_data');
    expect(contract.downstream[0]!.endpoints_affected).toEqual([]);
    expect(contract.downstream[0]!.crons_affected).toEqual([]);
  });

  it('renders a "no callers" state as an empty downstream caller list, not a blank/throwing result', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };

    const contract = mapBlastResultToContract(result);

    expect(contract.downstream).toEqual([
      { symbol: 'foo', callers: [], endpoints_affected: [], crons_affected: [] },
    ]);
    expect(contract.summary).toBe('1 changed symbol(s), 0 caller(s), 0 endpoint(s), 0 cron job(s) affected.');
  });
});
