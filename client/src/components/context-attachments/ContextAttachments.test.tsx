import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../messages/en/context.json";

const mutate = vi.fn();
const KB = 1024;

vi.mock("../../lib/hooks/context", () => ({
  useContextDocuments: () => ({
    isLoading: false,
    isError: false,
    data: {
      documents: [
        { path: ".devdigest/specs/a.md", type: "specs", size: 100, tokens: 25 },
        { path: ".devdigest/specs/b.md", type: "specs", size: 100, tokens: 25 },
        { path: ".devdigest/docs/huge.md", type: "docs", size: 200 * KB, tokens: 50000 },
      ],
    },
  }),
  useOwnerContext: () => ({
    isLoading: false,
    isError: false,
    data: {
      attachments: [
        { owner_type: "agent", owner_id: "ag1", repo_id: "r1", path: ".devdigest/specs/a.md", order: 0 },
        { owner_type: "agent", owner_id: "ag1", repo_id: "r1", path: ".devdigest/specs/b.md", order: 1 },
        { owner_type: "agent", owner_id: "ag1", repo_id: "r1", path: ".devdigest/specs/gone.md", order: 2 },
      ],
      missing: [".devdigest/specs/gone.md"],
      tokens_total: 9000,
      over_threshold: true,
    },
  }),
  useSetOwnerContext: () => ({ mutate, error: null }),
  useOwnerEffectiveContext: () => ({ data: undefined }),
  useContextDocument: () => ({ data: { content: "# Hello <script>x</script>" }, isLoading: false }),
}));

import { ContextAttachments } from "./ContextAttachments";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderIt() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ContextAttachments ownerType="agent" ownerId="ag1" repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ContextAttachments", () => {
  it("shows counts, missing badge and over-threshold warning; reorders by keyboard with an announcement", async () => {
    renderIt();
    expect(screen.getByText("3 of 4 attached")).toBeInTheDocument();
    expect(screen.getAllByText("100 B · ≈ 25 tokens")).toHaveLength(2);
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText(/over 8000 tokens/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move .devdigest/specs/b.md up" }));
    expect(mutate.mock.calls[0]![0]).toEqual([
      ".devdigest/specs/b.md",
      ".devdigest/specs/a.md",
      ".devdigest/specs/gone.md",
    ]);
    expect(screen.getByText("Moved .devdigest/specs/b.md to position 1 of 3.")).toBeInTheDocument();
  });

  it("refuses to attach a document over 100 KB and previews safely", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("checkbox", { name: /huge\.md/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than 100 KB/);
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Preview .devdigest/specs/a.md" }));
    expect(screen.getByRole("heading", { name: /Hello/ })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});
