import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../messages/en/context.json";

const uploadAsync = vi.fn();
vi.mock("@/lib/hooks/context", () => ({
  useUploadContextDocument: () => ({ mutateAsync: uploadAsync, isPending: false }),
}));

import { UploadDialog } from "./UploadDialog";

afterEach(() => {
  cleanup();
  uploadAsync.mockReset();
});

function renderIt(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <UploadDialog repoId="r1" onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}
const pick = (file: File) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

describe("UploadDialog", () => {
  it("AC-6: rejects a non-.md file with a message and never uploads; accepts .md", async () => {
    const onClose = renderIt();
    pick(new File(["x"], "notes.txt", { type: "text/plain" }));
    fireEvent.click(screen.getByRole("button", { name: contextMessages.upload.submit }));
    expect(screen.getByRole("alert")).toHaveTextContent(contextMessages.upload.notMarkdown);
    expect(uploadAsync).not.toHaveBeenCalled();

    uploadAsync.mockResolvedValueOnce({});
    pick(new File(["# hi"], "ok.MD", { type: "text/markdown" }));
    fireEvent.click(screen.getByRole("button", { name: contextMessages.upload.submit }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(uploadAsync).toHaveBeenCalledWith(expect.objectContaining({ type: "specs" }));
  });
});
