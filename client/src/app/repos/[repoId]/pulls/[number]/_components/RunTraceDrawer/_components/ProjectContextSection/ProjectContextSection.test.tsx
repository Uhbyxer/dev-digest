import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import { ProjectContextSection } from "./ProjectContextSection";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>{ui}</NextIntlClientProvider>);

describe("ProjectContextSection", () => {
  it("renders nothing for old traces without a snapshot", () => {
    wrap(<ProjectContextSection snapshot={undefined} />);
    expect(screen.queryByText(/Project context/)).toBeNull();
  });

  it("shows the block as plain text with origin and skipped reasons", async () => {
    wrap(
      <ProjectContextSection
        snapshot={{
          text: "## Project context\n<b>bold</b>",
          entries: [{ path: ".devdigest/specs/a.md", origin: "skill:x", tokens: 5 }],
          skipped: [{ path: ".devdigest/specs/gone.md", reason: "missing at base ref" }],
        }}
      />,
    );
    fireEvent.click(screen.getByText(/Project context — attached specs/));
    expect(screen.getByTestId("project-context-text")).toHaveTextContent("<b>bold</b>");
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText(/from skill:x/)).toBeInTheDocument();
    expect(screen.getByText(/missing at base ref/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy project context" })).toBeInTheDocument();
  });

  const snap = { text: "t", entries: [], skipped: [] };
  const open = () => fireEvent.click(screen.getByText(/Project context — attached specs/));

  it("shows Copied only after clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wrap(<ProjectContextSection snapshot={{ ...snap, text: "hello" }} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy project context" }));
    expect(await screen.findByRole("button", { name: /Copied/ })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("does not show Copied when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    wrap(<ProjectContextSection snapshot={{ ...snap, text: "hello" }} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy project context" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Copied/ })).toBeNull();
  });
});
