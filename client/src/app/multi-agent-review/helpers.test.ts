import { describe, it, expect } from "vitest";
import { summarizeEstimate, scoreColor, confidenceColor, sortFindings, formatDuration } from "./helpers";

describe("summarizeEstimate", () => {
  it("time = max, cost = sum, skipping agents without history", () => {
    const r = summarizeEstimate([
      { est_duration_ms: 8200, est_cost_usd: 0.06, has_history: true },
      { est_duration_ms: 7400, est_cost_usd: 0.05, has_history: true },
      { est_duration_ms: null, est_cost_usd: null, has_history: false },
    ]);
    expect(r.durationMs).toBe(8200);
    expect(r.costUsd).toBeCloseTo(0.11);
  });
  it("is null when nothing has history", () => {
    expect(summarizeEstimate([{ est_duration_ms: null, est_cost_usd: null, has_history: false }])).toEqual({
      durationMs: null,
      costUsd: null,
    });
  });
});

describe("colour thresholds (AC-29)", () => {
  it("score", () => {
    expect([72, 70, 69, 58, 50, 49, 38].map(scoreColor)).toEqual([
      "var(--ok)", "var(--ok)", "var(--warn)", "var(--warn)", "var(--warn)", "var(--crit)", "var(--crit)",
    ]);
  });
  it("confidence", () => {
    expect([98, 90, 89, 50, 49].map(confidenceColor)).toEqual([
      "var(--ok)", "var(--ok)", "var(--warn)", "var(--warn)", "var(--crit)",
    ]);
  });
});

describe("sortFindings", () => {
  it("orders by severity, then file, then line", () => {
    const f = (severity: string, file: string, start_line: number) => ({ severity, file, start_line }) as never;
    const out = sortFindings([f("SUGGESTION", "a", 1), f("CRITICAL", "b", 9), f("CRITICAL", "b", 2), f("WARNING", "a", 5)]);
    expect(out.map((x: { severity: string; start_line: number }) => `${x.severity}:${x.start_line}`)).toEqual([
      "CRITICAL:2", "CRITICAL:9", "WARNING:5", "SUGGESTION:1",
    ]);
  });
});

describe("formatDuration", () => {
  it("formats seconds and null", () => {
    expect(formatDuration(8200)).toBe("8.2s");
    expect(formatDuration(null)).toBe("—");
  });
});
