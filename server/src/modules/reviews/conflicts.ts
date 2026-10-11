import type { AgentColumn, Conflict, ConflictTake, Severity } from '@devdigest/shared';

/**
 * Deterministic "where agents disagree" computation for a multi-agent run.
 *
 * Pure: no DB, no LLM, no embeddings. Findings from every COMPLETED agent are
 * grouped by identical `file` AND overlapping `[start_line, end_line]` ranges
 * (transitively — a sorted sweep per file merges chains of overlaps). Each group
 * becomes one `Conflict` with exactly one take per agent that ran: that agent's
 * highest severity in the group, or `'ignored'` ("did not flag"). Unanimous
 * groups are returned too; the client decides whether to filter them out.
 */

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

type ColumnFinding = AgentColumn['findings'][number];

interface Flagged {
  /** Unique per column (agent runs are unique even when `agent_id` is '' for a deleted agent). */
  runId: string;
  agentId: string;
  agentName: string;
  finding: ColumnFinding;
  start: number;
  end: number;
}

const NOTE_IGNORED = 'Did not flag this';

function endLine(f: ColumnFinding): number {
  const end = f.end_line ?? f.start_line;
  return end >= f.start_line ? end : f.start_line;
}

/** Strictly higher severity wins; ties keep the earlier (stable) entry. */
function higher(a: Flagged, b: Flagged): Flagged {
  return SEVERITY_RANK[b.finding.severity] > SEVERITY_RANK[a.finding.severity] ? b : a;
}

export function computeConflicts(columns: AgentColumn[]): Conflict[] {
  const ran = columns.filter((c) => c.status === 'done');
  if (ran.length === 0) return [];

  const byFile = new Map<string, Flagged[]>();
  for (const col of ran) {
    for (const finding of col.findings) {
      const list = byFile.get(finding.file) ?? [];
      list.push({
        runId: col.run_id,
        agentId: col.agent_id,
        agentName: col.agent_name,
        finding,
        start: finding.start_line,
        end: endLine(finding),
      });
      byFile.set(finding.file, list);
    }
  }

  const conflicts: Conflict[] = [];
  for (const file of [...byFile.keys()].sort()) {
    const items = byFile
      .get(file)!
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);

    // Sorted sweep: extend the current group while the next range starts inside it.
    const groups: Flagged[][] = [];
    let current: Flagged[] = [];
    let currentEnd = -Infinity;
    for (const item of items) {
      if (current.length > 0 && item.start <= currentEnd) {
        current.push(item);
        currentEnd = Math.max(currentEnd, item.end);
      } else {
        if (current.length > 0) groups.push(current);
        current = [item];
        currentEnd = item.end;
      }
    }
    if (current.length > 0) groups.push(current);

    for (const group of groups) {
      const lead = group.reduce(higher);
      const takes: ConflictTake[] = ran.map((col) => {
        const mine = group.filter((g) => g.runId === col.run_id);
        if (mine.length === 0) {
          return {
            agent_id: col.agent_id,
            persona: col.agent_name,
            verdict: 'ignored',
            note: NOTE_IGNORED,
          };
        }
        const top = mine.reduce(higher);
        return {
          agent_id: col.agent_id,
          persona: col.agent_name,
          verdict: top.finding.severity,
          note: top.finding.title,
        };
      });
      conflicts.push({
        file,
        line: Math.min(...group.map((g) => g.start)),
        title: lead.finding.title,
        takes,
      });
    }
  }
  return conflicts;
}
