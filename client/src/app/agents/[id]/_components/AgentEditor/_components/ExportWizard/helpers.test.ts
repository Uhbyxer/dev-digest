import { describe, it, expect } from "vitest";
import type { CiFile } from "@devdigest/shared";
import { isPlaceholderFile } from "./helpers";

const file = (path: string, over: Partial<CiFile> = {}): CiFile => ({
  path,
  contents: "",
  editable: false,
  size_bytes: 0,
  ...over,
});

describe("isPlaceholderFile", () => {
  it("matches only the bundled runner, not other empty read-only files", () => {
    expect(isPlaceholderFile(file(".devdigest/runner/index.js", { size_bytes: 2_500_000 }))).toBe(true);
    expect(isPlaceholderFile(file(".devdigest/memory.jsonl"))).toBe(false);
  });
});
