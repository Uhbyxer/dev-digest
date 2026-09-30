import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PrBriefCard } from "./PrBriefCard";

/**
 * PrBriefCard (ADR-0004). The hooks call `api.*` → global `fetch`, so `fetch`
 * is mocked (client/CLAUDE.md convention) — a tiny router over method + path.
 */

const BRIEF: PrBrief = {
  summary: "Adds rate limiting to the public API.",
  intent: null,
  blast: null,
  risks: {
    risks: [
      { kind: "logic", title: "Limiter bypass", explanation: "Health route skips the limiter.", severity: "high", file_refs: ["src/limiter.ts"] },
      { kind: "api", title: "Config drift", explanation: "New env var.", severity: "low", file_refs: ["src/config.ts"] },
    ],
  },
  review_focus: [
    { file: "src/limiter.ts", line: 12, reason: "core logic" },
    { file: "src/config.ts", reason: "new setting" },
  ],
  head_sha: "sha-1",
  generated_at: new Date().toISOString(),
  missing: [],
};

let brief: PrBrief | null;
let stale: boolean;
let reviews: unknown[];
let generateStatus: number;
const requests: { method: string; path: string }[] = [];

function respond(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  brief = null;
  stale = false;
  reviews = [];
  generateStatus = 200;
  requests.length = 0;
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string }) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, "");
      const method = init?.method ?? "GET";
      requests.push({ method, path });
      if (path.endsWith("/brief") && method === "GET") return respond({ brief, stale } satisfies PrBriefResponse);
      if (path.endsWith("/brief") && method === "POST") {
        if (generateStatus >= 300) return respond({ error: { message: "boom" } }, generateStatus);
        brief = { ...BRIEF, generated_at: new Date().toISOString() };
        stale = false;
        return respond({ brief, stale: false } satisfies PrBriefResponse);
      }
      if (path.endsWith("/reviews")) return respond(reviews);
      return respond(null);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
        <PrBriefCard prId="pr-1" repoId="r1" prNumber={7} aside={<div>ASIDE</div>} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const posts = () => requests.filter((r) => r.method === "POST");

describe("PrBriefCard", () => {
  it("empty → Generate → the Brief is shown (summary, Risk areas, Review focus, aside)", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expect(screen.getByText("Limiter bypass")).toBeInTheDocument();
    expect(screen.getByText("src/limiter.ts")).toBeInTheDocument(); // the risk's file
    expect(screen.getByText("src/limiter.ts:12")).toBeInTheDocument(); // focus with a verified line
    expect(screen.getByText("— new setting")).toBeInTheDocument(); // focus item without a line
    expect(screen.getByText("ASIDE")).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("still shows the aside (Intent / Blast radius) before a Brief exists", async () => {
    renderCard();
    await screen.findByRole("button", { name: "Generate brief" });
    expect(screen.getByText("ASIDE")).toBeInTheDocument();
  });

  it("shows a stored Brief immediately, without calling generate", async () => {
    brief = BRIEF;
    renderCard();
    expect(await screen.findByText("Limiter bypass")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("shows a focus item without a verified line as the file alone", async () => {
    brief = BRIEF;
    renderCard();
    await screen.findByText("Limiter bypass");
    expect(screen.queryByText("src/config.ts:undefined")).not.toBeInTheDocument();
    expect(screen.getAllByText("src/config.ts").length).toBeGreaterThan(0);
  });

  it("says so when no risks survived verification", async () => {
    brief = { ...BRIEF, risks: { risks: [] } };
    renderCard();
    expect(await screen.findByText("No notable risks flagged.")).toBeInTheDocument();
  });

  it("names the data the Brief was built without", async () => {
    brief = { ...BRIEF, missing: ["intent", "blast"] };
    renderCard();
    expect(await screen.findByText("Built without: Intent, Blast radius.")).toBeInTheDocument();
  });

  it("marks a stale Brief and never regenerates by itself", async () => {
    brief = BRIEF;
    stale = true;
    renderCard();
    expect(await screen.findByText(/Stale/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it("refresh regenerates the Brief", async () => {
    brief = { ...BRIEF, summary: "OLD SUMMARY" };
    renderCard();
    await screen.findByText("OLD SUMMARY");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByText("Adds rate limiting to the public API.")).toBeInTheDocument();
    expect(screen.queryByText("OLD SUMMARY")).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("a failed generation shows an error with Retry, and keeps the previous Brief", async () => {
    brief = { ...BRIEF, summary: "PREVIOUS" };
    generateStatus = 502;
    renderCard();
    await screen.findByText("PREVIOUS");
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't generate the brief.");
    expect(screen.getByText("PREVIOUS")).toBeInTheDocument();

    generateStatus = 200;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(posts()).toHaveLength(2);
  });

  it("clicking a Review focus item opens Files changed with the file and line", async () => {
    brief = BRIEF;
    renderCard();
    await screen.findByText("Limiter bypass");
    fireEvent.click(screen.getByRole("button", { name: "Open src/limiter.ts in Files changed" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Flimiter.ts&line=12");
    fireEvent.click(screen.getByRole("button", { name: "Open src/config.ts in Files changed" }));
    expect(push).toHaveBeenLastCalledWith("/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts");
  });

  it("expands and collapses a risk's explanation; the icon carries its severity", async () => {
    brief = BRIEF;
    renderCard();
    await screen.findByText("Limiter bypass");
    expect(screen.queryByText("Health route skips the limiter.")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Limiter bypass/ });
    fireEvent.click(toggle);
    expect(screen.getByText("Health route skips the limiter.")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("Health route skips the limiter.")).not.toBeInTheDocument();
    expect(document.querySelector('[data-severity="high"]')).not.toBeNull();
    expect(document.querySelector('[data-severity="low"]')).not.toBeNull();
  });

  it("tops the card with the verdict banner and score only when a review exists", async () => {
    brief = BRIEF;
    reviews = [
      { id: "rv1", pr_id: "pr-1", agent_id: null, run_id: null, agent_name: "General", kind: "review", verdict: "request_changes", summary: "Needs work", score: 42, model: null, created_at: "", findings: [] },
    ];
    const { unmount } = renderCard();
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    unmount();

    reviews = [];
    renderCard();
    await screen.findByText("Limiter bypass");
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
  });
});
