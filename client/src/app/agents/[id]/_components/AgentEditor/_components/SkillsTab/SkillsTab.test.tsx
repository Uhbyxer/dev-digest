import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const mockSetSkills = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      { id: "s1", name: "Alpha Skill", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1 },
      { id: "s2", name: "Beta Skill", description: "d", type: "security", source: "manual", body: "b", enabled: true, version: 1 },
      { id: "s3", name: "Gamma Skill", description: "d", type: "custom", source: "manual", body: "b", enabled: true, version: 1 },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentSkillLinks: () => ({
    data: [
      { agent_id: "ag1", skill_id: "s1", order: 0 },
      { agent_id: "ag1", skill_id: "s2", order: 1 },
    ],
  }),
  useSetAgentSkills: () => ({ mutate: mockSetSkills }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mockSetSkills.mockClear();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "s",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("renders the enabled count and per-skill type badges", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("Rubric")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("checking an unlinked skill calls setSkills with it appended", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Gamma Skill/i }));
    expect(mockSetSkills).toHaveBeenCalledWith(["s1", "s2", "s3"]);
  });

  it("unchecking a linked skill calls setSkills without it", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha Skill/i }));
    expect(mockSetSkills).toHaveBeenCalledWith(["s2"]);
  });

  it("dragging a linked row onto another linked row reorders and persists", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const rowA = screen.getByTestId("skill-row-s1");
    const rowB = screen.getByTestId("skill-row-s2");
    fireEvent.dragStart(rowA);
    fireEvent.dragOver(rowB);
    fireEvent.drop(rowB);
    expect(mockSetSkills).toHaveBeenCalledWith(["s2", "s1"]);
  });
});
