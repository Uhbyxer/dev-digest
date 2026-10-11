import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import { TabsView } from "./TabsView";
import type { AgentColumn } from "@/lib/types";

afterEach(cleanup);

const f = (id: string, title: string) => ({
  id, severity: "WARNING", category: "bug", title, file: "a.ts", start_line: 1, rationale: `why-${id}`, suggestion: null,
});
const col = (id: string, over: Partial<AgentColumn> = {}): AgentColumn =>
  ({
    run_id: `r-${id}`, agent_id: id, agent_name: `Agent ${id}`, provider: null, model: null, status: "done",
    verdict: null, score: 70, summary: `sum-${id}`, duration_ms: 1000, cost_usd: 0.01, findings: [],
    ...over,
  }) as AgentColumn;

describe("TabsView", () => {
  it("AC-27/AC-17/AC-14: switches tabs locally, one accordion row open at a time, decide + View trace wired", () => {
    const onDecide = vi.fn();
    const onViewTrace = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
        <TabsView
          onDecide={onDecide}
          onViewTrace={onViewTrace}
          columns={[
            col("a", { findings: [f("1", "First"), f("2", "Second")] as never }),
            col("b", { status: "failed", score: null, summary: "boom" }),
          ]}
        />
      </NextIntlClientProvider>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("sum-a")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /First/ }));
    expect(screen.getByText("why-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Second/ }));
    expect(screen.queryByText("why-1")).toBeNull();
    expect(screen.getByText("why-2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onDecide).toHaveBeenCalledWith("2", "accept");

    fireEvent.click(screen.getByRole("button", { name: "View trace" }));
    expect(onViewTrace).toHaveBeenCalledWith("r-a");

    // AC-15: failed agent's tab shows reason and no findings
    fireEvent.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText("First")).toBeNull();
  });
});
