import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, SmartDiffGroup } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import prReviewMessages from "../../../../messages/en/prReview.json";
import shellMessages from "../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: `@@ -1,1 +1,1 @@\n+hello` };
}

describe("SmartDiffViewer", () => {
  it("renders groups in the fixed role order the API already sorted them in (core → tests → wiring → docs → boilerplate)", () => {
    // The server (buildSmartDiff, unit-tested separately) is the one that
    // sorts groups into DISPLAY_ROLE_ORDER — SmartDiffViewer just renders
    // whatever order it's handed, so this fixture is pre-sorted like a real
    // response would be.
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "src/service.ts", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "tests", files: [{ path: "src/service.test.ts", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 3, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
    ];
    const files = [file("src/service.ts"), file("src/service.test.ts"), file("src/index.ts"), file("README.md"), file("pnpm-lock.yaml")];

    renderWithIntl(<SmartDiffViewer groups={groups} files={files} />);

    const labels = screen.getAllByText(/^(Core|Tests|Wiring|Docs|Boilerplate)$/).map((el) => el.textContent);
    expect(labels).toEqual(["Core", "Tests", "Wiring", "Docs", "Boilerplate"]);
  });

  it("never renders a group with zero files", () => {
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "src/service.ts", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
    ];
    renderWithIntl(<SmartDiffViewer groups={groups} files={[file("src/service.ts")]} />);

    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
    expect(screen.queryByText("Tests")).not.toBeInTheDocument();
  });

  it("starts docs and boilerplate collapsed while other groups follow the size-based auto-expand rule", () => {
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "src/core-file.ts", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "docs", files: [{ path: "docs/doc-file.md", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null }] },
    ];
    const files = [file("src/core-file.ts"), file("docs/doc-file.md"), file("pnpm-lock.yaml")];

    renderWithIntl(<SmartDiffViewer groups={groups} files={files} />);

    // core's group section is open, and its (small) file card auto-expands too.
    expect(screen.getByText("src/core-file.ts")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();

    // docs/boilerplate GROUP sections start collapsed — their file cards
    // (and the file path text inside them) are not in the DOM yet.
    expect(screen.queryByText("docs/doc-file.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
  });

  it("the show/hide-comments toggle also gates inline finding cards", () => {
    const groups: SmartDiffGroup[] = [
      { role: "core", files: [{ path: "src/service.ts", additions: 1, deletions: 0, finding_lines: [1], pseudocode_summary: null }] },
    ];
    const finding: FindingRecord = {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
      file: "src/service.ts",
      start_line: 1,
      end_line: 1,
      rationale: "A secret is committed in source.",
      suggestion: null,
      confidence: 0.9,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "r1",
      accepted_at: null,
      dismissed_at: null,
    };
    const findingApi: DiffFindingApi = {
      byPath: new Map([["src/service.ts", [finding]]]),
      pending: new Set(),
      onAction: () => {},
    };
    const commentingHidden: DiffCommentApi = {
      comments: [],
      canComment: false,
      showComments: false,
      posting: false,
      onSubmit: async () => ({}),
    };

    const { rerender } = renderWithIntl(
      <SmartDiffViewer groups={groups} files={[file("src/service.ts")]} commenting={commentingHidden} findingApi={findingApi} />,
    );
    // The file card still shows its "has findings" dot even while the finding
    // card itself is hidden — that indicator isn't gated by the toggle.
    expect(screen.getByTestId("finding-dot")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
        <SmartDiffViewer
          groups={groups}
          files={[file("src/service.ts")]}
          commenting={{ ...commentingHidden, showComments: true }}
          findingApi={findingApi}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
