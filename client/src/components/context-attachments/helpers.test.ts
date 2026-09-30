import { describe, it, expect } from "vitest";
import type { ContextDocument } from "@devdigest/shared";
import { buildRows, dropOnto, movePath, toggleAttachment } from "./helpers";

const doc = (path: string, type: ContextDocument["type"] = "specs"): ContextDocument => ({ path, type, size: 1, tokens: 1 });

describe("attachment helpers", () => {
  it("AC-13/14/15: toggle appends/removes; move clamps; drop places dragged at target's position", () => {
    expect(toggleAttachment(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleAttachment(["a", "b"], "a")).toEqual(["b"]);
    expect(movePath(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    const same = ["a", "b"];
    expect(movePath(same, "a", -1)).toBe(same); // clamped no-op keeps identity
    expect(movePath(same, "zzz", 1)).toBe(same);
    expect(dropOnto(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(dropOnto(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });

  it("AC-12/16/19: attached first in order (incl. missing), rest sorted; filter narrows both without changing attachments", () => {
    const docs = [doc(".devdigest/docs/z.md", "docs"), doc(".devdigest/specs/a.md"), doc(".devdigest/specs/b.md")];
    const attached = [".devdigest/specs/b.md", ".devdigest/specs/gone.md"];
    const rows = buildRows(docs, attached, "");
    expect(rows.map((r) => [r.path, r.attached, r.missing])).toEqual([
      [".devdigest/specs/b.md", true, false],
      [".devdigest/specs/gone.md", true, true],
      [".devdigest/docs/z.md", false, false],
      [".devdigest/specs/a.md", false, false],
    ]);
    expect(buildRows(docs, attached, " GONE ").map((r) => r.path)).toEqual([".devdigest/specs/gone.md"]);
    expect(attached).toHaveLength(2);
  });
});
