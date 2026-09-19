import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const mockCreate = vi.fn().mockResolvedValue({});
const mockUpdate = vi.fn().mockResolvedValue({});

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateSkill: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

import { SkillEditorModal } from "./SkillEditorModal";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const SKILL: Skill = {
  id: "s1",
  name: "API Contract Stability",
  description: "Use when a diff touches a route.",
  type: "convention",
  source: "manual",
  body: "Body text.",
  enabled: true,
  version: 1,
};

describe("SkillEditorModal", () => {
  it("blocks submit and shows an error when a required field is empty", () => {
    renderWithIntl(<SkillEditorModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("submit calls create with the entered payload", () => {
    renderWithIntl(<SkillEditorModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("API Contract Stability"), {
      target: { value: "My New Skill" },
    });
    fireEvent.change(screen.getByPlaceholderText("Use when a diff touches an HTTP route…"), {
      target: { value: "A description." },
    });
    fireEvent.change(screen.getByPlaceholderText(/Describe the guidance/), {
      target: { value: "The body." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(mockCreate).toHaveBeenCalledWith({
      name: "My New Skill",
      description: "A description.",
      type: "custom",
      body: "The body.",
    });
  });

  it("editing an existing skill submits an update with the right payload", () => {
    renderWithIntl(<SkillEditorModal skill={SKILL} onClose={() => {}} />);
    expect(screen.getByDisplayValue("API Contract Stability")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save"));
    expect(mockUpdate).toHaveBeenCalledWith({
      id: "s1",
      patch: {
        name: "API Contract Stability",
        description: "Use when a diff touches a route.",
        type: "convention",
        body: "Body text.",
      },
    });
  });
});
