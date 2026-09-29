import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../messages/en/context.json";

const saveAsync = vi.fn();
const DOC = { path: ".devdigest/specs/api.md", type: "specs", size: 2150, tokens: 538, used_by: 3 };

vi.mock("@/lib/hooks/context", () => ({
  useContextDocuments: () => ({ isLoading: false, isError: false, data: { documents: [DOC], state: "ok" }, refetch: vi.fn() }),
  useContextDocument: () => ({
    isLoading: false,
    isError: false,
    data: { ...DOC, content: "# Title\n\n<img src=x onerror=alert(1)>", mtime: "m", hash: "h" },
    refetch: vi.fn(),
  }),
  useSaveContextDocument: () => ({ mutateAsync: saveAsync, isPending: false }),
  useRefreshContext: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateContextDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadContextDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteContextDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({ useRepoIntelStatus: () => ({ data: undefined }) }));

import { ContextView } from "./ContextView";

afterEach(() => {
  cleanup();
  saveAsync.mockReset();
});

function renderIt() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ContextView", () => {
  it("previews without raw HTML, keeps edits on a failed save, then shows the local-edit caveat", async () => {
    renderIt();
    expect(screen.getByText("specs/ · 2.1 KB · ≈ 538 tokens")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /api\.md/ }));
    expect(await screen.findByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByRole("textbox", { name: "Document content" });
    fireEvent.change(box, { target: { value: "# Title\n\n<img src=x onerror=alert(1)> more" } });

    saveAsync.mockRejectedValueOnce(new Error("boom"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Couldn’t save the document/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document content" })).toHaveValue(
      "# Title\n\n<img src=x onerror=alert(1)> more",
    );

    saveAsync.mockResolvedValueOnce({ document: {} });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/not on base branch/)).toBeInTheDocument();
  });
});
