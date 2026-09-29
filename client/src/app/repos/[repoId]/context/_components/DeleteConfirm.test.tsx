import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../messages/en/context.json";

const delAsync = vi.fn();
vi.mock("@/lib/hooks/context", () => ({
  useDeleteContextDocument: () => ({ mutateAsync: delAsync, isPending: false }),
}));

import { DeleteConfirm } from "./DeleteConfirm";

afterEach(() => {
  cleanup();
  delAsync.mockReset();
});

describe("DeleteConfirm", () => {
  it("AC-7: deletes only after confirmation; a failure shows an error and keeps the dialog", async () => {
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <DeleteConfirm repoId="r1" path=".devdigest/specs/a.md" onClose={onClose} onDeleted={onDeleted} />
      </NextIntlClientProvider>,
    );
    expect(delAsync).not.toHaveBeenCalled();

    delAsync.mockRejectedValueOnce(new Error("x"));
    fireEvent.click(screen.getByRole("button", { name: contextMessages.delete.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(contextMessages.delete.error);
    expect(onDeleted).not.toHaveBeenCalled();

    delAsync.mockResolvedValueOnce({ deleted: true });
    fireEvent.click(screen.getByRole("button", { name: contextMessages.delete.confirm }));
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(delAsync).toHaveBeenLastCalledWith(".devdigest/specs/a.md");
  });
});
