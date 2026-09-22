import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@/lib/types";
import messages from "../../../../messages/en/prReview.json";
import { FindingLineCard } from "./FindingLineCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingLineCard", () => {
  it("renders severity, title, and rationale expanded by default (no click needed)", () => {
    renderWithIntl(<FindingLineCard finding={FINDING} onAction={() => {}} />);
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText(/Stripe key is committed/)).toBeInTheDocument();
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingLineCard finding={FINDING} onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("does not render a file:line link (redundant once anchored to the line)", () => {
    renderWithIntl(<FindingLineCard finding={FINDING} onAction={() => {}} />);
    expect(screen.queryByText("src/config.ts:11")).not.toBeInTheDocument();
  });
});
