import type { CiInstallation } from "@devdigest/shared";

/** Most recent installation by `installed_at` (the server lists them ascending). */
export function latestInstallation(list: CiInstallation[]): CiInstallation | undefined {
  return list.reduce<CiInstallation | undefined>(
    (best, i) => (!best || Date.parse(i.installed_at) > Date.parse(best.installed_at) ? i : best),
    undefined,
  );
}
