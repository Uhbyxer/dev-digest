import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Intent } from "@/lib/types";
import { IntentPanel } from "./IntentPanel";

/**
 * IntentPanel — the read-only INTENT panel on PR Overview (decision #7/#10,
 * docs/plans/intent-layer.md). `useIntent` calls `api.get` → the global
 * `fetch`, so we mock `fetch` directly (client/CLAUDE.md convention) rather
 * than mocking the hook itself.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 300,
      status,
      json: async () => body,
    }),
  );
}

function renderPanel(prId: string | number | null | undefined = "pr-1") {
  const qc = new QueryClient();
  const result = render(
    <QueryClientProvider client={qc}>
      <IntentPanel prId={prId} />
    </QueryClientProvider>,
  );
  return { qc, ...result };
}

const BASE_INTENT: Intent = {
  intent: "Adds rate limiting to public API endpoints.",
  in_scope: ["Add limiter middleware", "Apply it to public routes"],
  out_of_scope: ["Per-user rate limit tiers"],
  confidence: "inferred",
  sources: ["title", "diff_stats"],
};

describe("IntentPanel", () => {
  it("renders nothing when the intent query resolves to null", async () => {
    mockFetchOnce(null);
    const prId = "pr-1";
    const { container, qc } = renderPanel(prId);

    // Wait for the query to actually reach a resolved (`success`) state —
    // asserting only that `fetch` was called (the previous version of this
    // test) can't distinguish "not loaded yet" from "loaded and correctly
    // empty", since `IntentPanel` renders `null` in both cases (`data:
    // undefined` before load, `data: null` after a null resolution).
    await waitFor(() => {
      const state = qc.getQueryState(["pr-intent", prId]);
      expect(state?.status).toBe("success");
    });
    expect(qc.getQueryData(["pr-intent", prId])).toBeNull();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/intent/i)).not.toBeInTheDocument();
  });

  it("renders the one-line intent, in-scope/out-of-scope lists, and the Inferred badge for an inferred intent", async () => {
    mockFetchOnce(BASE_INTENT);
    renderPanel();

    expect(await screen.findByText(BASE_INTENT.intent)).toBeInTheDocument();
    expect(screen.getByText("Add limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Apply it to public routes")).toBeInTheDocument();
    expect(screen.getByText("Per-user rate limit tiers")).toBeInTheDocument();
    expect(screen.getByText("Inferred")).toBeInTheDocument();
    expect(screen.queryByText("Stated")).not.toBeInTheDocument();
  });

  it('renders a "Stated" badge instead of "Inferred" when confidence is stated', async () => {
    mockFetchOnce({ ...BASE_INTENT, confidence: "stated" });
    renderPanel();

    await screen.findByText(BASE_INTENT.intent);
    expect(screen.getByText("Stated")).toBeInTheDocument();
    expect(screen.queryByText("Inferred")).not.toBeInTheDocument();
  });
});
