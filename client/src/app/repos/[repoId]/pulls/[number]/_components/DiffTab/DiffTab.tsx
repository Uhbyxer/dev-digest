"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, usePrSmartDiff, useFindingAction } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { FindingActionKind, FindingRecord, PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  // Smart Diff ⇄ Original order — local state only, always starts on Smart
  // Diff (this component remounts every time the tab is revisited, since the
  // parent only renders it while `tab === "diff"`.
  const [view, setView] = React.useState<"smart" | "original">("smart");

  const { data: smartDiff } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();
  const [pendingFindingIds, setPendingFindingIds] = React.useState<Set<string>>(new Set());

  // Union of findings across EVERY persisted review for this PR (not just the
  // newest) — a finding counts regardless of accept/dismiss state.
  const findingsByPath = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const review of reviews ?? []) {
      for (const f of review.findings) {
        const list = map.get(f.file) ?? [];
        list.push(f);
        map.set(f.file, list);
      }
    }
    return map;
  }, [reviews]);

  const findingApi: DiffFindingApi | undefined = prId
    ? {
        byPath: findingsByPath,
        pending: pendingFindingIds,
        onAction: (findingId: string, action: FindingActionKind) => {
          setPendingFindingIds((s) => new Set(s).add(findingId));
          findingAction.mutate(
            { findingId, action, prId },
            {
              onSettled: () =>
                setPendingFindingIds((s) => {
                  const next = new Set(s);
                  next.delete(findingId);
                  return next;
                }),
            },
          );
        },
      }
    : undefined;

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button kind="ghost" size="sm" onClick={() => setView((v) => (v === "smart" ? "original" : "smart"))}>
              {view === "smart" ? t("smartDiff.originalOrderToggle") : t("smartDiff.smartDiffToggle")}
            </Button>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      {view === "smart" ? (
        <SmartDiffViewer groups={smartDiff?.groups ?? []} files={files} commenting={commenting} findingApi={findingApi} />
      ) : (
        <DiffViewer files={files} commenting={commenting} findingApi={findingApi} />
      )}
    </section>
  );
}
