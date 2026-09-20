import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../messages/en/conventions.json";

const mockUpdateMutate = vi.fn();
const mockScanMutate = vi.fn();
const mockCreateSkill = vi.fn().mockResolvedValue({});

const PENDING: ConventionCandidate = {
  id: "c-pending",
  repo_id: "r1",
  rule: "Always use async/await, never .then() chains.",
  evidence_path: "src/lib/fetch.ts",
  evidence_snippet: "await fetchThing();",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-09-10T00:00:00.000Z",
  updated_at: "2026-09-10T00:00:00.000Z",
};

const ACCEPTED: ConventionCandidate = {
  id: "c-accepted",
  repo_id: "r1",
  rule: "Cache access goes through one singleton.",
  evidence_path: "src/cache.ts",
  evidence_snippet: null,
  confidence: 0.7,
  status: "accepted",
  created_at: "2026-09-09T00:00:00.000Z",
  updated_at: "2026-09-09T00:00:00.000Z",
};

let conventions: ConventionCandidate[] = [PENDING, ACCEPTED];

vi.mock("../../../../../lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { conventions, last_scanned_at: "2026-09-10T00:00:00.000Z" },
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useScanConventions: () => ({ mutate: mockScanMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useCreateSkillFromConventions: () => ({ mutateAsync: mockCreateSkill, isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  mockUpdateMutate.mockClear();
  mockScanMutate.mockClear();
  mockCreateSkill.mockClear();
  conventions = [PENDING, ACCEPTED];
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("renders each convention's rule, evidence, and confidence", () => {
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    expect(screen.getByDisplayValue("Always use async/await, never .then() chains.")).toBeInTheDocument();
    expect(screen.getByText("src/lib/fetch.ts")).toBeInTheDocument();
    expect(screen.getByText("await fetchThing();")).toBeInTheDocument();
    expect(screen.getByText("91% conf")).toBeInTheDocument();
  });

  it("clicking Accept on a pending row PATCHes status to accepted", () => {
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    const pendingRow = screen
      .getByDisplayValue("Always use async/await, never .then() chains.")
      .closest("[data-convention-id]")! as HTMLElement;
    const acceptBtn = within(pendingRow).getByRole("button", { name: "Accept" });
    fireEvent.click(acceptBtn);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: "c-pending", patch: { status: "accepted" } });
  });

  it("clicking Reject on a row PATCHes status to rejected", () => {
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    const rejectButtons = screen.getAllByRole("button", { name: "Reject" });
    fireEvent.click(rejectButtons[0]!);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: "c-pending", patch: { status: "rejected" } });
  });

  it("editing a rule and blurring PATCHes only the rule, never the status", () => {
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    const input = screen.getByDisplayValue("Always use async/await, never .then() chains.");
    fireEvent.change(input, { target: { value: "Always use async/await." } });
    fireEvent.blur(input);
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: "c-pending", patch: { rule: "Always use async/await." } });
  });

  it("disables Create skill when there are zero accepted conventions", () => {
    conventions = [PENDING];
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("opens the create-skill modal pre-filled from accepted conventions", () => {
    renderWithIntl(<ConventionsView repoId="r1" repoFullName="acme/widgets" />);
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByDisplayValue("acme-widgets-conventions")).toBeInTheDocument();
    expect(
      within(modal).getByDisplayValue("1 house convention extracted from acme/widgets"),
    ).toBeInTheDocument();
    expect(within(modal).getByDisplayValue(/Cache access goes through one singleton\./)).toBeInTheDocument();
  });
});
