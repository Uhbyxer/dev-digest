import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const BASE: RunTrace = {
  config: { agent: "Sec", version: "1", provider: "openai", model: "gpt-4.1", pr: 1, source: "local" },
  stats: { duration_ms: 1000, tokens_in: 10, tokens_out: 5, cost_usd: 0.01, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: { system: "sys", skills: null, memory: null, specs: "LEGACY SPECS TEXT", user: "usr" },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: [],
  log: [],
};

const renderIt = (trace: RunTrace) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
      <TraceBody trace={trace} findings={[]} />
    </NextIntlClientProvider>,
  );

describe("TraceBody project context", () => {
  it("AC-32/34/36: with a snapshot shows the section, specs read with origin, skipped reason; legacy specs block is not duplicated", () => {
    renderIt({
      ...BASE,
      specs_read: [".devdigest/specs/a.md"],
      project_context: {
        text: "## Project context\nBODY",
        entries: [{ path: ".devdigest/specs/a.md", origin: "skill:sec", tokens: 3 }],
        skipped: [{ path: ".devdigest/specs/gone.md", reason: "missing on origin/main" }],
      },
    });
    expect(screen.getByText(/Project context — attached specs/)).toBeInTheDocument();
    expect(screen.getByText(".devdigest/specs/a.md (skill:sec)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project context (dynamic)")).toBeNull();
    fireEvent.click(screen.getByText(/Project context — attached specs/));
    expect(screen.getByText(/missing on origin\/main/)).toBeInTheDocument();
  });

  it("old trace without project_context: no section, specs read is 'none', legacy specs block still shown", () => {
    renderIt(BASE);
    expect(screen.queryByText(/Project context — attached specs/)).toBeNull();
    expect(screen.getByText("none")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context (dynamic)")).toBeInTheDocument();
  });
});
