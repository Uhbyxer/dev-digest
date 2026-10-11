import { describe, it, expect } from "vitest";
import type { CiInstallation } from "@devdigest/shared";
import { latestInstallation } from "./helpers";

const inst = (repo: string, installed_at: string) => ({ repo, installed_at }) as CiInstallation;

describe("latestInstallation", () => {
  it("picks the most recent by installed_at regardless of list order", () => {
    const list = [inst("old", "2026-01-01T00:00:00Z"), inst("new", "2026-08-01T00:00:00Z"), inst("mid", "2026-05-01T00:00:00Z")];
    expect(latestInstallation(list)?.repo).toBe("new");
    expect(latestInstallation([])).toBeUndefined();
  });
});
