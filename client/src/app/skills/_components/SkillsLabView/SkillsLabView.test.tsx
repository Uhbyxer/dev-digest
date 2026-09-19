import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";

const mockUpdate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      {
        id: "s1",
        name: "Test Quality Checklist",
        description: "Flags missing corner cases.",
        type: "rubric",
        source: "manual",
        body: "FULL SKILL BODY TEXT",
        enabled: true,
        version: 1,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: mockUpdate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn() }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useImportSkillConfirm: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsLabView } from "./SkillsLabView";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsLabView", () => {
  it("renders the skill list", () => {
    renderWithIntl(<SkillsLabView />);
    expect(screen.getByText("Test Quality Checklist")).toBeInTheDocument();
    expect(screen.getByText("Rubric")).toBeInTheDocument();
  });

  it("clicking a card opens the preview panel with the full body", () => {
    renderWithIntl(<SkillsLabView />);
    fireEvent.click(screen.getByText("Test Quality Checklist"));
    expect(screen.getByText("FULL SKILL BODY TEXT")).toBeInTheDocument();
  });

  it("toggling enabled calls the update endpoint", () => {
    renderWithIntl(<SkillsLabView />);
    fireEvent.click(screen.getByRole("switch"));
    expect(mockUpdate).toHaveBeenCalledWith({ id: "s1", patch: { enabled: false } });
  });
});
