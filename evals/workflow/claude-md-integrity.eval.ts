import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../src/index.js";

/**
 * Static integrity of the CLAUDE.md files — NO model, runs in milliseconds.
 * An agent follows "Read when" pointers literally, so a pointer to a missing file silently costs it
 * a turn (or a wrong guess). Checks: (1) every package listed in the root table has its own CLAUDE.md,
 * (2) every concrete path in a "Read when" / "Agent skills" section exists.
 */

const claudeMdFiles = ["CLAUDE.md", ...readdirSync(REPO_ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(REPO_ROOT, d.name, "CLAUDE.md")))
  .map((d) => `${d.name}/CLAUDE.md`)];

/** Backticked path-like tokens inside the "Read when" and "Agent skills" sections (placeholders/globs skipped). */
function pointers(file: string): string[] {
  const text = readFileSync(join(REPO_ROOT, file), "utf8");
  const out: string[] = [];
  let inSection = false;
  for (const line of text.split("\n")) {
    if (/^#{2,3} /.test(line)) inSection = /read when|agent skills|issue tracker|triage labels|domain docs/i.test(line);
    if (!inSection) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const tok = m[1].split("#")[0];
      if (!tok || /[<>*\s]/.test(tok) || tok.startsWith("pnpm") || !/(\/|\.md$|\.json$)/.test(tok)) continue;
      out.push(tok);
    }
  }
  return [...new Set(out)];
}

describe("workflow:claude-md-integrity", () => {
  test("every package in the root table has its own CLAUDE.md", () => {
    const root = readFileSync(join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const packages = [...root.matchAll(/^\|\s*`([a-z0-9-]+)\/`\s*\|/gm)].map((m) => m[1]);
    expect(packages.length).toBeGreaterThan(0);
    const missing = packages.filter((p) => !existsSync(join(REPO_ROOT, p, "CLAUDE.md")));
    expect(missing, `packages listed in CLAUDE.md without <package>/CLAUDE.md: ${missing.join(", ")}`).toEqual([]);
  });

  for (const file of claudeMdFiles) {
    test(`${file}: every path in its Read-when / Agent-skills pointers exists`, () => {
      const base = dirname(join(REPO_ROOT, file));
      const missing = pointers(file).filter((p) => !existsSync(resolve(base, p)));
      expect(missing, `${file} points at missing paths: ${missing.join(", ")}`).toEqual([]);
    });
  }
});
