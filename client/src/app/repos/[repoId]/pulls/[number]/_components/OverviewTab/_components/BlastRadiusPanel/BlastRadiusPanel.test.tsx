import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import blastMessages from "../../../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import type { BlastRadius } from "@devdigest/shared";
import { BlastRadiusPanel } from "./BlastRadiusPanel";

/**
 * BlastRadiusPanel — the read-only Blast Radius panel on PR Overview (issue
 * #32). `useBlastRadius` calls `api.get` → the global `fetch`, so mock `fetch`
 * directly (client/CLAUDE.md convention) rather than mocking the hook itself.
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

function renderPanel(overrides: Partial<Parameters<typeof BlastRadiusPanel>[0]> = {}) {
  const qc = new QueryClient();
  const result = render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages, brief: briefMessages }}>
        <BlastRadiusPanel
          prId="pr-1"
          repoId="repo-1"
          repoFullName="acme/widgets"
          headSha="abc123"
          {...overrides}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { qc, ...result };
}

const BASE_BLAST: BlastRadius = {
  changed_symbols: [{ name: "foo", file: "src/a.ts", kind: "function" }],
  downstream: [
    {
      symbol: "foo",
      callers: [{ name: "handler", file: "src/caller.ts", line: 12 }],
      endpoints_affected: ["GET /foo"],
      crons_affected: [],
    },
  ],
  summary: "1 changed symbol(s), 1 caller(s), 1 endpoint(s), 0 cron job(s) affected.",
  degraded: false,
};

describe("BlastRadiusPanel", () => {
  it("renders nothing while the query is unresolved", async () => {
    mockFetchOnce(BASE_BLAST);
    const { container, qc } = renderPanel();
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(qc.getQueryState(["pr-blast", "pr-1"])?.status).toBe("success");
    });
  });

  it("renders the stat row, caller list with a GitHub deep-link, and the summary line", async () => {
    mockFetchOnce(BASE_BLAST);
    renderPanel();

    expect(await screen.findByText("foo")).toBeInTheDocument();
    expect(screen.getByText(BASE_BLAST.summary)).toBeInTheDocument();
    const link = screen.getByText("handler — src/caller.ts:12").closest("a");
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/blob/abc123/src/caller.ts#L12");
    expect(screen.getByText("GET /foo")).toBeInTheDocument();
  });

  it('renders a "no callers found" empty state for a symbol with no callers, alongside one that has them', async () => {
    mockFetchOnce({
      ...BASE_BLAST,
      changed_symbols: [
        ...BASE_BLAST.changed_symbols,
        { name: "bar", file: "src/b.ts", kind: "function" },
      ],
      downstream: [
        ...BASE_BLAST.downstream,
        { symbol: "bar", callers: [], endpoints_affected: [], crons_affected: [] },
      ],
    });
    renderPanel();

    await screen.findByText("bar");
    expect(screen.getByText("No callers found.")).toBeInTheDocument();
    expect(screen.getByText("handler — src/caller.ts:12")).toBeInTheDocument();
  });

  it('renders the overall "no downstream callers" empty state when nothing was found', async () => {
    mockFetchOnce({
      ...BASE_BLAST,
      downstream: [{ symbol: "foo", callers: [], endpoints_affected: [], crons_affected: [] }],
    });
    renderPanel();

    expect(await screen.findByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
  });

  it("renders the degraded/index-incomplete indicator with a reason and a resync action", async () => {
    mockFetchOnce({ ...BASE_BLAST, degraded: true, reason: "no_data" });
    renderPanel();

    expect(await screen.findAllByText("Index incomplete")).not.toHaveLength(0);
    expect(screen.getByText(/no_data/)).toBeInTheDocument();
    expect(screen.getByText("Resync")).toBeInTheDocument();
  });
});
