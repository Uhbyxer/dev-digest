import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";

const push = vi.fn();
const mutateAsync = vi.fn();
let pulls: unknown[] = [{ id: "pr1", number: 482, title: "Add rate limiting" }];
let query = "";
let detail: unknown = undefined;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "repo1" }) }));
vi.mock("@/lib/hooks/core", () => ({ usePulls: () => ({ data: pulls, isLoading: false }),
  usePullDetail: (id: string | null) => ({ data: id ? detail : undefined }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", description: "Finds secrets", enabled: true, est_duration_ms: 8200, est_cost_usd: 0.06, has_history: true },
      { id: "a2", name: "Perf", description: "", enabled: true, est_duration_ms: null, est_cost_usd: null, has_history: false },
    ],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useStartMultiAgentRun: () => ({ mutateAsync, isPending: false }),
}));

import { ConfigureRun } from "./ConfigureRun";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pulls = [{ id: "pr1", number: 482, title: "Add rate limiting" }];
  query = "";
  detail = undefined;
});

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <ConfigureRun />
    </NextIntlClientProvider>,
  );

describe("ConfigureRun", () => {
  it("disables agents and the run button until a PR is chosen", () => {
    renderIt();
    expect(screen.getByText("Pick a pull request first to choose agents.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeDisabled();
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
  });

  it("after choosing a PR shows teaser/estimate/summary and runs the selected agents", async () => {
    mutateAsync.mockResolvedValue({ multi_run_id: "m1", pr_id: "pr1", runs: [] });
    renderIt();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr1" } });
    expect(screen.getByText("Finds secrets")).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.06")).toBeInTheDocument();
    expect(screen.getByText("≈ 8.2s · $0.06 · parallel fan-out")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(["a1"]));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/m1?pr=pr1"));
  });

  it("shows the empty state when there are no pull requests", () => {
    pulls = [];
    renderIt();
    expect(screen.getByText("No pull requests yet")).toBeInTheDocument();
  });

  it("resolves a ?pr= deep link to a PR outside the active repo's list", () => {
    query = "pr=other";
    detail = { id: "other", number: 7, title: "Elsewhere" };
    renderIt();
    expect(screen.getByRole("combobox")).toHaveValue("other");
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeEnabled();
  });

  it("shows a translated inline error and stays put when starting fails", async () => {
    mutateAsync.mockRejectedValue(Object.assign(new Error("x"), { status: 429 }));
    renderIt();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(push).not.toHaveBeenCalled();
  });
});
