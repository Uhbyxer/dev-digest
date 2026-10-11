/** Pure presentation helpers for Multi-Agent Review (estimate, colours, sorting). */
import type {
  AgentColumnFinding,
  AgentWithEstimate,
  FindingRecord,
} from "../../lib/types";
import {
  AGENT_ACCENTS,
  CONF_GOOD,
  CONF_MID,
  MULTI_AGENT_ROUTE,
  SCORE_GOOD,
  SCORE_MID,
  SEVERITY_RANK,
} from "./constants";

export interface EstimateSummary {
  /** max of the selected agents' estimated durations; null when none has history. */
  durationMs: number | null;
  /** sum of the selected agents' estimated costs; null when none has history. */
  costUsd: number | null;
}

/** Client-side pre-run summary (AC-7/AC-9): time = max, cost = sum; agents with
    `has_history:false` (null estimates) are skipped. No request is made. */
export function summarizeEstimate(
  selected: Pick<AgentWithEstimate, "est_duration_ms" | "est_cost_usd" | "has_history">[],
): EstimateSummary {
  let durationMs: number | null = null;
  let costUsd: number | null = null;
  for (const a of selected) {
    if (!a.has_history) continue;
    if (a.est_duration_ms != null) durationMs = Math.max(durationMs ?? 0, a.est_duration_ms);
    if (a.est_cost_usd != null) costUsd = (costUsd ?? 0) + a.est_cost_usd;
  }
  return { durationMs, costUsd };
}

/** "8.2s" / "1m 4s"; null → "—". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** "~6s" for the compact picker estimate; null → "—". */
export function formatApproxSeconds(ms: number | null | undefined): string {
  return ms == null ? "—" : `~${Math.max(1, Math.round(ms / 1000))}s`;
}

/** Score ring / tab badge colour (AC-29). */
export function scoreColor(score: number): string {
  return score >= SCORE_GOOD ? "var(--ok)" : score >= SCORE_MID ? "var(--warn)" : "var(--crit)";
}

/** Confidence dot colour (AC-29); `pct` is 0-100. */
export function confidenceColor(pct: number): string {
  return pct >= CONF_GOOD ? "var(--ok)" : pct >= CONF_MID ? "var(--warn)" : "var(--crit)";
}

/** Confidence as a whole percent from a 0-1 (or already 0-100) value; null if absent. */
export function confidencePercent(confidence: number | null | undefined): number | null {
  if (confidence == null) return null;
  return Math.round(confidence <= 1 ? confidence * 100 : confidence);
}

/** Stable accent (colour + icon) per agent id. */
export function accentFor(agentId: string) {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return AGENT_ACCENTS[h % AGENT_ACCENTS.length]!;
}

/** CRITICAL → WARNING → SUGGESTION, then file, then line (AC-26). */
export function sortFindings<T extends Pick<AgentColumnFinding, "severity" | "file" | "start_line">>(
  findings: T[],
): T[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line,
  );
}

/** "src/a.ts:12" or "src/a.ts:12-15". */
export function fileLine(f: Pick<AgentColumnFinding, "file" | "start_line" | "end_line">): string {
  const end = f.end_line;
  return end != null && end !== f.start_line
    ? `${f.file}:${f.start_line}-${end}`
    : `${f.file}:${f.start_line}`;
}

/** Adapt column findings to the FindingRecord shape the shared RunTraceDrawer expects. */
export function toFindingRecords(findings: AgentColumnFinding[]): FindingRecord[] {
  return findings.map(
    (f) =>
      ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line ?? f.start_line,
        rationale: f.rationale ?? "",
        suggestion: f.suggestion ?? null,
        confidence: f.confidence ?? 0,
        kind: f.kind ?? null,
        accepted_at: f.accepted_at ?? null,
        dismissed_at: f.dismissed_at ?? null,
      }) as unknown as FindingRecord,
  );
}

/** Result-page URL: the PR id rides in `?pr=` because the read endpoint is PR-scoped. */
export function resultsHref(multiRunId: string, prId: string): string {
  return `${MULTI_AGENT_ROUTE}/${multiRunId}?pr=${encodeURIComponent(prId)}`;
}

export type StartErrorKey = "notFound" | "conflict" | "rateLimit" | "server" | "generic";

/** Maps a failed start-run request to a translation key (404/409/429/5xx). */
export function startErrorKey(err: unknown): StartErrorKey {
  const status = (err as { status?: number } | null)?.status;
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status === 429) return "rateLimit";
  if (typeof status === "number" && status >= 500) return "server";
  return "generic";
}
