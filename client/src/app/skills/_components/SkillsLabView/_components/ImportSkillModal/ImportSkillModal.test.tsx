import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";

const mockPreview = vi.fn();
const mockConfirm = vi.fn().mockResolvedValue({});
let previewError: Error | undefined;

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({
    mutateAsync: mockPreview,
    isPending: false,
    isError: !!previewError,
    error: previewError,
  }),
  useImportSkillConfirm: () => ({
    mutateAsync: mockConfirm,
    isPending: false,
    isError: false,
    error: undefined,
  }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
  mockPreview.mockReset();
  mockConfirm.mockClear();
  previewError = undefined;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function uploadFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImportSkillModal", () => {
  it("uploading a file triggers a preview call and renders the parsed fields as editable, without saving", async () => {
    mockPreview.mockResolvedValue({
      name: "imported-skill",
      description: "An imported skill.",
      type: "custom",
      body: "Imported body.",
      source: "imported_url",
    });
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);

    const file = new File(["---\nname: x\n---\nbody"], "x.md", { type: "text/markdown" });
    uploadFile(document.querySelector('input[type="file"]')!, file);

    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getByDisplayValue("imported-skill")).toBeInTheDocument());
    expect(screen.getByDisplayValue("An imported skill.")).toBeInTheDocument();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("confirm calls the confirm endpoint with the (possibly edited) preview payload", async () => {
    mockPreview.mockResolvedValue({
      name: "imported-skill",
      description: "An imported skill.",
      type: "custom",
      body: "Imported body.",
      source: "imported_url",
    });
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const file = new File(["content"], "x.md", { type: "text/markdown" });
    uploadFile(document.querySelector('input[type="file"]')!, file);
    await waitFor(() => expect(screen.getByDisplayValue("imported-skill")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("imported-skill"), { target: { value: "renamed-skill" } });
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith({
        name: "renamed-skill",
        description: "An imported skill.",
        type: "custom",
        body: "Imported body.",
        source: "imported_url",
      }),
    );
  });

  it("renders an error state when preview fails", async () => {
    previewError = new Error("Only a markdown file or a zip archive is accepted");
    mockPreview.mockRejectedValue(previewError);
    renderWithIntl(<ImportSkillModal onClose={() => {}} />);
    const file = new File(["bad"], "x.exe", { type: "application/octet-stream" });
    uploadFile(document.querySelector('input[type="file"]')!, file);

    await waitFor(() =>
      expect(screen.getByText(/Only a markdown file or a zip archive is accepted/)).toBeInTheDocument(),
    );
  });
});
