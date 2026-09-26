import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import type { PrHistory } from "@devdigest/shared";
import { PriorPrsPanel } from "./PriorPrsPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));
}

function renderPanel() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        <PriorPrsPanel prId="pr-1" repoFullName="acme/widgets" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PriorPrsPanel", () => {
  it("renders the empty state when no prior PRs overlap", async () => {
    const empty: PrHistory = { history: [] };
    mockFetchOnce(empty);
    renderPanel();
    expect(await screen.findByText("No prior PRs overlap these files.")).toBeInTheDocument();
  });

  it("renders each prior PR with a GitHub link, author, and overlap count", async () => {
    const history: PrHistory = {
      history: [
        {
          pr_number: 42,
          title: "Refactor auth",
          merged_at: "2026-01-01T00:00:00Z",
          author: "alice",
          files_overlap: ["src/a.ts", "src/b.ts"],
          notes: "",
        },
      ],
    };
    mockFetchOnce(history);
    renderPanel();

    const link = await screen.findByText("#42 Refactor auth");
    expect(link.closest("a")).toHaveAttribute("href", "https://github.com/acme/widgets/pull/42");
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.getByText(/2 overlap/)).toBeInTheDocument();
  });
});
