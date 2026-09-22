/* SmartDiffViewer — the Files changed tab's default view: PR files grouped
   by role (core → tests → wiring → docs → boilerplate) instead of GitHub's
   raw order. Reuses FileCard/DiffViewer's rendering primitive per file; only
   owns the role-grouping/collapse chrome around it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { FileCard } from "../FileCard";

/** Role groups the reviewer should skim by default are collapsed on load;
    lock-files/generated output/snapshots (boilerplate) and prose (docs)
    are worth far less first-pass attention than core/tests/wiring. */
const DEFAULT_COLLAPSED: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

function GroupSection({
  group,
  filesByPath,
  commenting,
  findingApi,
}: {
  group: SmartDiffGroup;
  filesByPath: Map<string, PrFile>;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!DEFAULT_COLLAPSED.has(group.role));

  const filesWithFindings = findingApi
    ? group.files.filter((f) => (findingApi.byPath.get(f.path)?.length ?? 0) > 0).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{t(ROLE_LABEL_KEY[group.role])}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("smartDiff.filesCount", { count: group.files.length })}
        </span>
        {filesWithFindings > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--crit)",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--crit)" }} />
            {t("smartDiff.filesWithFindings", { count: filesWithFindings })}
          </span>
        )}
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
          {group.files.map((gf) => {
            const file = filesByPath.get(gf.path) ?? {
              path: gf.path,
              additions: gf.additions,
              deletions: gf.deletions,
              patch: null,
            };
            return <FileCard key={gf.path} file={file} commenting={commenting} findingApi={findingApi} />;
          })}
        </div>
      )}
    </div>
  );
}

export function SmartDiffViewer({
  groups,
  files,
  commenting,
  findingApi,
}: {
  groups: SmartDiffGroup[];
  /** Full PrFiles (with patch text) — Smart Diff's response carries role +
      finding_lines, not the patch; joined here by path. */
  files: PrFile[];
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const filesByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  // Keyed on `files`, not `groups`: the smart-diff grouping request is a
  // separate query from the PR's files, so `groups` can still be empty while
  // it's loading (or if it errors) even though the PR clearly has files.
  if (files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  return (
    <div style={s.list}>
      {groups.map((g) => (
        <GroupSection key={g.role} group={g} filesByPath={filesByPath} commenting={commenting} findingApi={findingApi} />
      ))}
    </div>
  );
}
