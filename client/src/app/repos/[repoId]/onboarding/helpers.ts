import type { OnboardingTour } from "@devdigest/shared";
import { notify } from "@/lib/toast";
import { SECTION_KEYS, type SectionKey } from "./constants";

/** Copy to the clipboard; resolves false (never throws) when it is denied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy `text` and raise a success/error toast. */
export async function copyWithToast(text: string, okMessage: string, errMessage: string): Promise<void> {
  if (await copyText(text)) notify.success(okMessage);
  else notify.error(errMessage);
}

/** The Tour's own local URL (only meaningful on the same machine). */
export function tourUrl(repoId: string): string {
  return `${window.location.origin}/repos/${repoId}/onboarding`;
}

/** Labels needed to render a Tour as Markdown (kept out of this pure function's i18n). */
export interface MarkdownLabels {
  heading: string;
  titles: Record<SectionKey, string>;
  notGenerated: string;
  dependents: (count: number) => string;
}

/** Render the whole Tour — all five sections, in order — as Markdown. */
export function tourToMarkdown(tour: OnboardingTour, labels: MarkdownLabels): string {
  const body = (k: SectionKey): string => {
    const sec = tour.sections[k];
    if (sec.status === "not_generated") return `_${labels.notGenerated}_`;
    switch (k) {
      case "overview":
        return tour.sections.overview.text ?? "";
      case "critical_paths":
        return tour.sections.critical_paths.items
          .map((i) => `- \`${i.path}\` — ${labels.dependents(i.dependents)}${i.role ? ` · ${i.role}` : ""}`)
          .join("\n");
      case "run_locally":
        return "```sh\n" + tour.sections.run_locally.steps.map((x) => x.command).join("\n") + "\n```";
      case "reading_path":
        return tour.sections.reading_path.items.map((i, n) => `${n + 1}. \`${i.path}\` — ${i.reason}`).join("\n");
      case "first_tasks":
        return tour.sections.first_tasks.items
          .map((i) => `- ${i.title} (${i.files.map((f) => `\`${f}\``).join(", ")})`)
          .join("\n");
    }
  };
  return [`# ${labels.heading}`, ...SECTION_KEYS.map((k) => `## ${labels.titles[k]}\n\n${body(k)}`)].join("\n\n") + "\n";
}
