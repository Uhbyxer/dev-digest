import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";
import { FindingRow } from "./FindingRow";
import type { AgentColumnFinding } from "@/lib/types";

afterEach(cleanup);

const finding = {
  id: "f1", severity: "WARNING", category: "bug", title: "Null deref", file: "a.ts", start_line: 7,
  confidence: 0.8, rationale: "Because the value can be null.", suggestion: "Add a guard.",
} as AgentColumnFinding;

function ui(props: Partial<React.ComponentProps<typeof FindingRow>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <FindingRow finding={finding} mode="accordion" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FindingRow", () => {
  it("AC-17: collapsed hides rationale/fix; expanded shows them", () => {
    ui();
    expect(screen.queryByText("Because the value can be null.")).toBeNull();
    ui({ expanded: true });
    expect(screen.getByText("Because the value can be null.")).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Add a guard.")).toBeInTheDocument();
  });

  it("AC-18/AC-19: Accept/Dismiss call onDecide; Learn/eval/Reply are disabled placeholders", () => {
    const onDecide = vi.fn();
    ui({ expanded: true, onDecide });
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(onDecide.mock.calls).toEqual([["accept"], ["dismiss"]]);
    for (const name of [/Learn/, /Turn into eval case/, /Reply to author/]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    expect(onDecide).toHaveBeenCalledTimes(2);
  });

  it("AC-18: pending disables Accept/Dismiss; compact mode has no expand control", () => {
    ui({ expanded: true, pending: true });
    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Dismiss/ })).toBeDisabled();
    cleanup();
    ui({ mode: "compact" });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Null deref")).toBeInTheDocument();
  });
});
