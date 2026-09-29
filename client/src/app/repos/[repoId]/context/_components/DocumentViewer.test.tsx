import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../messages/en/context.json";

const saveAsync = vi.fn();
const refetch = vi.fn();
const DOC = { path: ".devdigest/specs/api.md", type: "specs" as const, size: 10, tokens: 3, used_by: 1 };

vi.mock("@/lib/hooks/context", () => ({
  useContextDocument: () => ({
    isLoading: false,
    isError: false,
    data: { ...DOC, content: "original", mtime: "m1", hash: "h1" },
    refetch,
  }),
  useSaveContextDocument: () => ({ mutateAsync: saveAsync, isPending: false }),
  useDeleteContextDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { DocumentViewer } from "./DocumentViewer";

afterEach(() => {
  cleanup();
  saveAsync.mockReset();
  refetch.mockReset();
});

function renderIt() {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <DocumentViewer repoId="r1" doc={DOC} onDeleted={() => {}} />
    </NextIntlClientProvider>,
  );
}
const box = () => screen.getByRole("textbox", { name: "Document content" });

describe("DocumentViewer", () => {
  it("AC-4: saves with the loaded hash/mtime guard; Save is disabled until the draft differs", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(box(), { target: { value: "edited" } });
    saveAsync.mockResolvedValueOnce({ document: {} });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(saveAsync).toHaveBeenCalledWith({
      path: DOC.path,
      content: "edited",
      expected_mtime: "m1",
      expected_hash: "h1",
    });
  });

  it("AC-11: on a save conflict the unsaved draft is kept, the user is warned, and reload discards it", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(box(), { target: { value: "mine" } });
    saveAsync.mockResolvedValueOnce({ document: {}, conflict: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(contextMessages.viewer.conflict);
    expect(box()).toHaveValue("mine");

    fireEvent.click(screen.getByRole("button", { name: contextMessages.viewer.conflictReload }));
    await vi.waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(box()).toHaveValue("original");
  });

  it("Discard restores the loaded text", () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(box(), { target: { value: "tmp" } });
    fireEvent.click(screen.getByRole("button", { name: contextMessages.viewer.discard }));
    expect(box()).toHaveValue("original");
  });
});
