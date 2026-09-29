import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTour } from "@devdigest/shared";
import messages from "../../../../../../messages/en/onboarding.json";

const mockGenerate = vi.fn();

const TOUR: OnboardingTour = {
  repo_id: "r1",
  generated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  index_commit_sha: "sha-1",
  files_indexed: 12450,
  partial_index: false,
  llm_input: null,
  sections: {
    overview: { status: "ok", text: "payments-api is a Node service." },
    critical_paths: {
      status: "ok",
      items: [{ path: "src/server.ts", dependents: 14, role: null }],
    },
    run_locally: { status: "ok", steps: [{ command: "pnpm install" }, { command: "pnpm dev" }] },
    reading_path: { status: "not_generated", items: [] },
    first_tasks: { status: "ok", items: [{ title: "Add a health check", files: ["src/server.ts"] }] },
  },
};

let tour: OnboardingTour | null = TOUR;
let stale = false;
let indexStatus: "full" | "partial" | "degraded" | "failed" = "full";

vi.mock("../../../../../lib/hooks/onboarding", () => ({
  useOnboardingTour: () => ({
    data: { tour, stale },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useGenerateOnboardingTour: () => ({ mutate: mockGenerate, isPending: false }),
}));
vi.mock("../../../../../lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { status: indexStatus, filesIndexed: 10 } }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

afterEach(() => {
  cleanup();
  mockGenerate.mockClear();
  tour = TOUR;
  stale = false;
  indexStatus = "full";
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnboardingTourView repoId="r1" repoFullName="acme/payments-api" />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingTourView", () => {
  it("shows an empty state whose Generate button starts generation", () => {
    tour = null;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("disables Generate with the reason while the index is not ready", () => {
    tour = null;
    indexStatus = "failed";
    renderView();
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeDisabled();
    expect(screen.getByText(/index isn't ready yet \(status: failed\)/)).toBeInTheDocument();
  });

  it("renders the five sections in the fixed order", () => {
    renderView();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
    expect(screen.getByText("payments-api is a Node service.")).toBeInTheDocument();
    expect(screen.getByText("src/server.ts — used by 14 files")).toBeInTheDocument();
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("Add a health check")).toBeInTheDocument();
  });

  it("shows the header with file count and relative refresh time", () => {
    renderView();
    expect(screen.getByText(/Generated from index of 12450 files · last refreshed 2h ago/)).toBeInTheDocument();
  });

  it("marks a not-generated section without hiding the others", () => {
    renderView();
    expect(screen.getAllByText("This section could not be generated.")).toHaveLength(1);
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
  });

  it("offers an On this page nav linking to all five sections", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
  });

  it("collapses and expands a section", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Collapse Architecture overview" }));
    expect(screen.queryByText("payments-api is a Node service.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Architecture overview" }));
    expect(screen.getByText("payments-api is a Node service.")).toBeInTheDocument();
  });

  it("shows a stale badge only when the index is newer than the Tour", () => {
    renderView();
    expect(screen.queryByText("Stale — the repo index is newer than this tour")).not.toBeInTheDocument();
    cleanup();
    stale = true;
    renderView();
    expect(screen.getByText("Stale — the repo index is newer than this tour")).toBeInTheDocument();
    // Stale is display-only: nothing regenerates by itself.
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("shows a banner when the Tour was built from a partial index", () => {
    tour = { ...TOUR, partial_index: true };
    renderView();
    expect(screen.getByText("Built from a partial index — parts of the repo may be missing.")).toBeInTheDocument();
  });

  it("has no partial banner for a full index", () => {
    renderView();
    expect(screen.queryByText(/partial index/)).not.toBeInTheDocument();
  });

  it("Regenerate starts generation", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  describe("copy actions", () => {
    const writeText = vi.fn();
    beforeEach(() => {
      writeText.mockReset().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
    });

    it("Copy as Markdown copies all five sections", async () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const md = writeText.mock.calls[0]![0] as string;
      for (const title of [
        "Architecture overview",
        "Critical paths",
        "How to run locally",
        "Guided reading path",
        "First tasks",
      ]) {
        expect(md).toContain(`## ${title}`);
      }
      expect(md).toContain("payments-api is a Node service.");
      expect(md).toContain("`src/server.ts` — used by 14 files");
      expect(md).toContain("pnpm install");
      expect(md).toContain("Add a health check");
    });

    it("Share link copies the Tour page's local URL", async () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Share link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding`));
    });

    it("each run command has a copy button", async () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm dev" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("pnpm dev"));
    });

    it("Open on a critical path copies its relative path (no in-app file viewer)", async () => {
      renderView();
      fireEvent.click(screen.getByRole("button", { name: "Open src/server.ts" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("src/server.ts"));
    });
  });
});
