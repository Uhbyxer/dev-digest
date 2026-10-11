import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import { DisagreeBlock } from "./DisagreeBlock";
import type { AgentColumn, Conflict } from "@/lib/types";

afterEach(cleanup);

const col = (id: string, status: AgentColumn["status"], n: number): AgentColumn =>
  ({
    run_id: `r-${id}`, agent_id: id, agent_name: id, provider: null, model: null, status,
    verdict: null, score: 70, summary: null, duration_ms: 1000, cost_usd: 0.01,
    findings: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, severity: "WARNING", category: "bug", title: "t", file: "a.ts", start_line: 1 })),
  }) as AgentColumn;

const unanimous: Conflict = {
  file: "a.ts", line: 1, title: "Same everywhere",
  takes: [
    { agent_id: "a", persona: "A", verdict: "WARNING", note: "" },
    { agent_id: "b", persona: "B", verdict: "WARNING", note: "" },
  ],
};
const split: Conflict = {
  file: "b.ts", line: 2, title: "Split",
  takes: [
    { agent_id: "a", persona: "A", verdict: "CRITICAL", note: "bad" },
    { agent_id: "b", persona: "B", verdict: "ignored", note: "" },
  ],
};

function ui(columns: AgentColumn[], conflicts: Conflict[]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <DisagreeBlock columns={columns} conflicts={conflicts} />
    </NextIntlClientProvider>,
  );
}

describe("DisagreeBlock", () => {
  it("shows every group, 'did not flag', and hides unanimous ones with the switch", () => {
    ui([col("a", "done", 1), col("b", "done", 0)], [unanimous, split]);
    expect(screen.getAllByTestId("conflict-row")).toHaveLength(2);
    expect(screen.getByText("did not flag")).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Show only conflicts" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(screen.getAllByTestId("conflict-row")).toHaveLength(1);
    expect(screen.getByText("Split")).toBeInTheDocument();
  });

  it("shows a waiting note while an agent is running", () => {
    ui([col("a", "done", 1), col("b", "running", 0)], []);
    expect(screen.getByText("Waiting for 1 agent to finish…")).toBeInTheDocument();
  });

  it("renders nothing when the run has no findings", () => {
    ui([col("a", "done", 0), col("b", "done", 0)], []);
    expect(screen.queryByText("Where agents disagree")).toBeNull();
  });
});
