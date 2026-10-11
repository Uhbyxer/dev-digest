import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, CiInstallation } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const INSTALLATION: CiInstallation = {
  id: "i1",
  agent_id: "ag1",
  repo: "acme/widgets",
  target_type: "gha",
  installed_at: "2026-07-01T00:00:00Z",
  status: "active",
  workflow_version: "1",
  last_run_status: "REQUEST_CHANGES",
  last_run_at: "2026-07-01T00:00:00Z",
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
}
let calls: Call[];
let installations: CiInstallation[];

beforeEach(() => {
  calls = [];
  installations = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, "");
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method, path, body });
      const reply = (json: unknown) =>
        new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
      if (path.startsWith("/ci/refresh")) return reply({ degraded: false, ingested: 0, skipped: 0 });
      if (path.endsWith("/ci/installations")) return reply(installations);
      if (method === "PUT") return reply({ ...AGENT, ...body });
      return reply([]);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiTab", () => {
  it("AC-35: Fail CI on offers exactly Critical / Warning + / Never and persists the choice via the agent update", async () => {
    renderTab();
    const select = await screen.findByRole("combobox");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Critical", "Warning +", "Never"]);
    expect(select).toHaveValue("critical");

    fireEvent.change(select, { target: { value: "warning" } });
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT" && c.path === "/agents/ag1")?.body).toEqual({ ci_fail_on: "warning" }),
    );
    fireEvent.change(select, { target: { value: "never" } });
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([
        { ci_fail_on: "warning" },
        { ci_fail_on: "never" },
      ]),
    );
  });

  it("AC-34: refreshes on mount, shows header + installation row, and Add repository opens the wizard", async () => {
    installations = [INSTALLATION];
    renderTab();

    expect(screen.getByRole("heading", { name: "CI deployment" })).toBeInTheDocument();
    await screen.findByText("acme/widgets");
    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("workflow 1")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/ci/refresh?agent_id=ag1")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Export to CI")).toBeInTheDocument();
  });
});
