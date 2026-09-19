import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { relativeTime as compactRelativeTime } from "@/lib/format";

/** `owner/repo` -> `owner-repo`, lowercased — used for the generated Skill's name. */
export function slugify(fullName: string): string {
  return fullName.trim().toLowerCase().replace(/\//g, "-");
}

/**
 * Pure draft-builder for the "create skill from conventions" modal (user
 * stories #11-13). This is the ONLY place the generated Skill body's markdown
 * format is defined — the server does not generate it, the client sends the
 * final body verbatim.
 *
 * Each accepted convention becomes a `## <rule>` section citing its evidence
 * path, with the evidence snippet (when present) as a fenced code block, so
 * an agent applying the Skill can trace a rule back to the code it came from
 * (user story #12).
 */
export function buildConventionsSkillDraft(
  repoFullName: string,
  accepted: ConventionCandidate[],
): { name: string; description: string; body: string } {
  const name = `${slugify(repoFullName)}-conventions`;
  const description = `${accepted.length} house convention${accepted.length === 1 ? "" : "s"} extracted from ${repoFullName}`;
  const body = accepted
    .map((c) => {
      const lines = [`## ${c.rule}`, "", `Evidence: \`${c.evidence_path ?? "unknown"}\``];
      if (c.evidence_snippet) {
        lines.push("", "```", c.evidence_snippet, "```");
      }
      return lines.join("\n");
    })
    .join("\n\n");
  return { name, description, body };
}

/** Conventions sorted confidence DESC (nulls last), then created_at DESC —
 *  mirrors the server's own ordering, used as a stable fallback/re-sort when
 *  the list is filtered client-side. */
export function sortConventions(conventions: ConventionCandidate[]): ConventionCandidate[] {
  return [...conventions].sort((a, b) => {
    if (a.confidence == null && b.confidence != null) return 1;
    if (a.confidence != null && b.confidence == null) return -1;
    if (a.confidence != null && b.confidence != null && a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Filter a convention list down to one status, or pass everything through
 *  for "all" — the list NEVER hides data by a hardcoded confidence floor
 *  (user story #20); this is purely an optional display filter. */
export function filterByStatus(
  conventions: ConventionCandidate[],
  status: "all" | ConventionStatus,
): ConventionCandidate[] {
  if (status === "all") return conventions;
  return conventions.filter((c) => c.status === status);
}

/** "Last scanned" phrasing (e.g. "just now", "3h ago") over the shared compact
 *  relative-time formatter in `lib/format.ts` — same bucketing, different wording. */
export function relativeTime(iso: string | null | undefined): string | null {
  const compact = compactRelativeTime(iso);
  if (compact === "—") return null;
  return compact === "now" ? "just now" : `${compact} ago`;
}
