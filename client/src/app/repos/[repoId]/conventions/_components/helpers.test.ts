import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import {
  buildConventionsSkillDraft,
  filterByStatus,
  relativeTime,
  slugify,
  sortConventions,
} from "./helpers";

function convention(overrides: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c1",
    repo_id: "r1",
    rule: "Always use async/await, never .then() chains.",
    evidence_path: "src/lib/fetch.ts",
    evidence_snippet: "await fetchThing();",
    confidence: 0.9,
    status: "pending",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("slugify", () => {
  it("replaces slashes and lowercases", () => {
    expect(slugify("Acme/Widgets")).toBe("acme-widgets");
  });
});

describe("buildConventionsSkillDraft", () => {
  it("builds name/description/body from accepted conventions", () => {
    const accepted = [
      convention({ id: "c1", rule: "Always async/await.", evidence_path: "src/a.ts", evidence_snippet: "await x();" }),
      convention({ id: "c2", rule: "Cache access goes through one singleton.", evidence_path: "src/cache.ts", evidence_snippet: null }),
    ];
    const draft = buildConventionsSkillDraft("acme/widgets", accepted);

    expect(draft.name).toBe("acme-widgets-conventions");
    expect(draft.description).toBe("2 house conventions extracted from acme/widgets");
    expect(draft.body).toContain("## Always async/await.");
    expect(draft.body).toContain("Evidence: `src/a.ts`");
    expect(draft.body).toContain("```\nawait x();\n```");
    expect(draft.body).toContain("## Cache access goes through one singleton.");
    expect(draft.body).toContain("Evidence: `src/cache.ts`");
    // No snippet for c2 — no fenced block should be emitted for it.
    expect(draft.body.split("Evidence: `src/cache.ts`")[1]?.startsWith("\n\n```")).toBe(false);
  });

  it("singularizes the description for exactly one accepted convention", () => {
    const draft = buildConventionsSkillDraft("acme/widgets", [convention({})]);
    expect(draft.description).toBe("1 house convention extracted from acme/widgets");
  });

  it("falls back to 'unknown' evidence when evidence_path is null", () => {
    const draft = buildConventionsSkillDraft("acme/widgets", [
      convention({ evidence_path: null, evidence_snippet: null }),
    ]);
    expect(draft.body).toContain("Evidence: `unknown`");
  });
});

describe("sortConventions", () => {
  it("orders by confidence DESC, nulls last, then created_at DESC", () => {
    const a = convention({ id: "a", confidence: 0.5, created_at: "2026-09-01T00:00:00.000Z" });
    const b = convention({ id: "b", confidence: 0.9, created_at: "2026-09-02T00:00:00.000Z" });
    const c = convention({ id: "c", confidence: null, created_at: "2026-09-03T00:00:00.000Z" });
    const d = convention({ id: "d", confidence: 0.9, created_at: "2026-09-05T00:00:00.000Z" });

    const sorted = sortConventions([a, b, c, d]).map((x) => x.id);
    expect(sorted).toEqual(["d", "b", "a", "c"]);
  });
});

describe("filterByStatus", () => {
  it("passes everything through for 'all'", () => {
    const list = [convention({ status: "pending" }), convention({ status: "rejected" })];
    expect(filterByStatus(list, "all")).toHaveLength(2);
  });

  it("filters down to a single status", () => {
    const list = [
      convention({ id: "p", status: "pending" }),
      convention({ id: "a", status: "accepted" }),
    ];
    expect(filterByStatus(list, "accepted").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("relativeTime", () => {
  it("returns null for a missing timestamp", () => {
    expect(relativeTime(null)).toBeNull();
    expect(relativeTime(undefined)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date")).toBeNull();
  });

  it("formats a recent timestamp as 'just now'", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
  });
});
