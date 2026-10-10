import type { AgentEvalRun } from "@devdigest/shared";
import { pct } from "../../../../lib/eval-format";

/** The newest run of each agent (input is newest-first). */
export function latestPerAgent(runs: AgentEvalRun[]): AgentEvalRun[] {
  const seen = new Set<string>();
  return runs.filter((r) => (seen.has(r.agent_id) ? false : (seen.add(r.agent_id), true)));
}

export const runLabel = (r: AgentEvalRun) =>
  `${r.agent_name ?? r.agent_id} · ${new Date(r.ran_at).toLocaleString()} · R ${pct(r.recall)} / P ${pct(r.precision)}`;
