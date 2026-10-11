import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import { AgentSummary } from "./AgentSummary";
import type { AgentColumn } from "@/lib/types";

afterEach(cleanup);

const col = (over: Partial<AgentColumn>): AgentColumn =>
  ({
    run_id: "r1", agent_id: "a1", agent_name: "Security", provider: null, model: null, status: "done",
    verdict: null, score: 82, summary: "Looks fine overall.", duration_ms: 8200, cost_usd: 0.05, findings: [],
    ...over,
  }) as AgentColumn;

function ui(column: AgentColumn, variant: "header" | "card", onViewTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <AgentSummary column={column} variant={variant} onViewTrace={onViewTrace} />
    </NextIntlClientProvider>,
  );
  return onViewTrace;
}

describe("AgentSummary", () => {
  it("AC-16: header and card variants share name, time and cost; card has summary + View trace", () => {
    ui(col({}), "header");
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText(/8\.2s/)).toBeInTheDocument();
    cleanup();
    const onViewTrace = ui(col({}), "card");
    expect(screen.getByText("Looks fine overall.")).toBeInTheDocument();
    expect(screen.getByText(/8\.2s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledWith("r1");
  });

  it("AC-13: running shows live status; AC-15: failed shows reason", () => {
    ui(col({ status: "running", score: null, summary: null }), "card");
    expect(screen.getByRole("status", { name: "Running" })).toBeInTheDocument();
    expect(screen.getByText("Agent is reviewing the pull request…")).toBeInTheDocument();
    cleanup();
    ui(col({ status: "failed", score: null, summary: "Provider timed out" }), "card");
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByText("Provider timed out")).toBeInTheDocument();
  });
});
