import type { IconName } from "@devdigest/ui";

/** The five Tour sections in their fixed display order. */
export const SECTION_KEYS = [
  "overview",
  "critical_paths",
  "run_locally",
  "reading_path",
  "first_tasks",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_ICONS: Record<SectionKey, IconName> = {
  overview: "Layers",
  critical_paths: "Activity",
  run_locally: "Command",
  reading_path: "ListChecks",
  first_tasks: "Target",
};

/** Index states the Tour can be generated from (partial is allowed, with a banner). */
export const READY_INDEX_STATUSES = ["full", "partial"];
