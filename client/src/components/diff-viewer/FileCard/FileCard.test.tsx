import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";
import { parseDiffTarget } from "../target";

const scrollIntoView = vi.fn();
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
});

const patch = (n: number) => `@@ -1,${n} +1,${n} @@\n` + Array.from({ length: n }, (_, i) => `+line ${i + 1}`).join("\n");
// Above AUTO_EXPAND_MAX_LINES → collapsed by default.
const bigFile: PrFile = { path: "src/big.ts", additions: 5000, deletions: 0, patch: patch(30) };

function renderCard(target?: { file: string; line?: number }, file = bigFile) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={file} target={target} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard deep link target", () => {
  it("stays collapsed without a target", () => {
    renderCard();
    expect(screen.queryByText("line 1")).not.toBeInTheDocument();
  });

  it("expands the target file and scrolls to the line", () => {
    const { container } = renderCard({ file: "src/big.ts", line: 20 });
    expect(screen.getByText("line 20")).toBeInTheDocument();
    const row = container.querySelector('[data-new-line="20"]')!;
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances.at(-1)).toBe(row);
  });

  it("expands and scrolls to the file when no line is given", () => {
    const { container } = renderCard({ file: "src/big.ts" });
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(scrollIntoView.mock.instances.at(-1)).toBe(container.querySelector("[data-file]"));
  });

  it("ignores a target for another file, and an unknown line does not break", () => {
    renderCard({ file: "src/other.ts", line: 3 });
    expect(screen.queryByText("line 1")).not.toBeInTheDocument();
    cleanup();
    renderCard({ file: "src/big.ts", line: 9999 });
    expect(screen.getByText("line 1")).toBeInTheDocument();
  });
});

describe("parseDiffTarget", () => {
  it("reads file and line; drops a bad line; needs a file", () => {
    expect(parseDiffTarget("a.ts", "12")).toEqual({ file: "a.ts", line: 12 });
    expect(parseDiffTarget("a.ts", "abc")).toEqual({ file: "a.ts" });
    expect(parseDiffTarget("a.ts", null)).toEqual({ file: "a.ts" });
    expect(parseDiffTarget(null, "3")).toBeUndefined();
  });
});
