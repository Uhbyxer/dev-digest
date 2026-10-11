import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
const mutateAsync = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", enabled: true, est_duration_ms: 8200, est_cost_usd: 0.06, has_history: true },
      { id: "a2", name: "Perf", enabled: true, est_duration_ms: null, est_cost_usd: null, has_history: false },
      { id: "a3", name: "Off", enabled: false, est_duration_ms: 1000, est_cost_usd: 0.01, has_history: true },
    ],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useStartMultiAgentRun: () => ({ mutateAsync, isPending: false }),
}));

import { AgentPicker } from "./AgentPicker";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <AgentPicker prId="pr1" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Run Review"));
}

describe("AgentPicker", () => {
  it("lists enabled agents pre-checked with estimates and the run count", () => {
    setup();
    expect(screen.getByLabelText(/Security/)).toBeChecked();
    expect(screen.getByLabelText(/Perf/)).toBeChecked();
    expect(screen.queryByLabelText(/Off/)).toBeNull();
    expect(screen.getByText("~8s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeEnabled();
  });

  it("Clear disables the run button; run posts exactly the checked agents then navigates", async () => {
    mutateAsync.mockResolvedValue({ multi_run_id: "m1", pr_id: "pr1", runs: [] });
    setup();
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Security/));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(["a1"]));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/m1?pr=pr1"));
  });

  it("keeps the picker open and shows a translated error when starting fails", async () => {
    mutateAsync.mockRejectedValue(Object.assign(new Error("x"), { status: 409 }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("agents is disabled");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
