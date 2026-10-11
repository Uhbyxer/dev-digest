import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import { ColumnsView } from "./ColumnsView";
import type { AgentColumn } from "@/lib/types";

afterEach(cleanup);

const col = (id: string, over: Partial<AgentColumn> = {}): AgentColumn =>
  ({
    run_id: `r-${id}`, agent_id: id, agent_name: `Agent ${id}`, provider: null, model: null, status: "done",
    verdict: null, score: 70, summary: null, duration_ms: 1000, cost_usd: 0.01, findings: [],
    ...over,
  }) as AgentColumn;

const finding = (id: string, severity: string, title: string) => ({ id, severity, category: "bug", title, file: "a.ts", start_line: 1 });

describe("ColumnsView", () => {
  it("renders one column per agent; failed shows reason, running shows status, siblings unaffected; View trace passes run id", () => {
    const onViewTrace = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
        <ColumnsView
          onViewTrace={onViewTrace}
          columns={[
            col("a", { findings: [finding("1", "SUGGESTION", "Minor"), finding("2", "CRITICAL", "Major")] as never }),
            col("b", { status: "failed", score: null, summary: "Rate limited" }),
            col("c", { status: "running", score: null }),
          ]}
        />
      </NextIntlClientProvider>,
    );
    const cols = screen.getAllByTestId("agent-column");
    expect(cols).toHaveLength(3);

    // AC-26-ish ordering: severity-sorted findings (CRITICAL first)
    const titles = within(cols[0]!).getAllByText(/Minor|Major/).map((n) => n.textContent);
    expect(titles).toEqual(["Major", "Minor"]);

    // AC-15
    expect(within(cols[1]!).getByRole("alert")).toHaveTextContent("Rate limited");
    // AC-13
    expect(within(cols[2]!).getAllByRole("status").length).toBeGreaterThan(0);
    expect(within(cols[2]!).getByText("Agent is reviewing the pull request…")).toBeInTheDocument();

    // AC-14 (component half): View trace hands the agent_run id to the page, which sets ?trace=
    fireEvent.click(within(cols[2]!).getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledWith("r-c");
  });
});
