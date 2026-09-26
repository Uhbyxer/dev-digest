/**
 * `mapBlastResultToContract` — pure mapping from repo-intel's `BlastResult`
 * (flat `callers: BlastCallerRow[]`, each carrying `viaSymbol`) into the
 * shared `BlastRadius` contract (`downstream: DownstreamImpact[]`, one entry
 * per changed symbol). No DB/network — the single highest-value seam for this
 * feature per the spec's Testing Decisions.
 */
import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

export function mapBlastResultToContract(result: BlastResult): BlastRadius {
  const rankBySymbol = new Map<string, number>();
  for (const c of result.callers) {
    const prev = rankBySymbol.get(c.viaSymbol) ?? 0;
    if (c.rank > prev) rankBySymbol.set(c.viaSymbol, c.rank);
  }

  // Highest-impact symbol first (user story 9); symbols with no callers (rank
  // 0, never set) sort last, ties keep the facade's original order.
  const orderedSymbols = [...result.changedSymbols].sort(
    (a, b) => (rankBySymbol.get(b.name) ?? 0) - (rankBySymbol.get(a.name) ?? 0),
  );

  const downstream: DownstreamImpact[] = orderedSymbols.map((sym) => {
    const callers = result.callers.filter((c) => c.viaSymbol === sym.name);
    const callerFiles = new Set(callers.map((c) => c.file));

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    if (result.factsByFile) {
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpoints.add(e);
        for (const c of facts.crons) crons.add(c);
      }
    }

    return {
      symbol: sym.name,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  // Derived from `downstream`, NOT `result.impactedEndpoints` — the latter is
  // populated on the T1 ripgrep path too (via extractEndpoints) while
  // `factsByFile` (what `downstream[].endpoints_affected` reads) is only
  // present on the persistent path; using two different sources here would
  // make the summary sentence disagree with the stat row it sits above.
  const totalEndpoints = new Set<string>();
  const totalCrons = new Set<string>();
  for (const d of downstream) {
    for (const e of d.endpoints_affected) totalEndpoints.add(e);
    for (const c of d.crons_affected) totalCrons.add(c);
  }

  const summary = `${result.changedSymbols.length} changed symbol(s), ${result.callers.length} caller(s), ${totalEndpoints.size} endpoint(s), ${totalCrons.size} cron job(s) affected.`;

  return {
    changed_symbols: orderedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary,
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
