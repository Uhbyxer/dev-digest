"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, TextInput } from "@devdigest/ui";
import type { CiExport, CiTarget } from "@devdigest/shared";
import { PR_TITLE, REPO_DATALIST_ID } from "../constants";
import { isValidRepo } from "../helpers";
import { s } from "../styles";

export type InstallAction = "open_pr" | "files";

/** Step 4 — repo + "Open a PR" / "Copy files as a zip" (AC-10, AC-13, AC-14). */
export function InstallStep({
  target,
  repo,
  onRepo,
  repoOptions,
  action,
  onAction,
  fileCount,
  error,
  result,
}: {
  target: CiTarget;
  repo: string;
  onRepo: (r: string) => void;
  repoOptions: string[];
  action: InstallAction;
  onAction: (a: InstallAction) => void;
  fileCount: number;
  error: string | null;
  result: CiExport | null;
}) {
  const t = useTranslations("ci.exportWizard.install");
  const canPr = target === "gha";
  const repoTrim = repo.trim();

  if (result) {
    return (
      <div style={s.done} role="status">
        <h3 style={s.h3}>{t("doneTitle")}</h3>
        {result.pr_url ? (
          <>
            <span>{t("donePr", { repo: repoTrim })}</span>
            <a href={result.pr_url} target="_blank" rel="noopener noreferrer">
              <Button kind="primary" iconRight="ExternalLink">
                {t("viewPr")}
              </Button>
            </a>
          </>
        ) : (
          <span>{result.zip_base64 ? t("doneZip") : t("donePrNoUrl", { repo: repoTrim })}</span>
        )}
      </div>
    );
  }

  return (
    <div>
      <FormField
        label={t("repo")}
        hint={repoTrim && !isValidRepo(repoTrim) ? t("repoInvalid") : t("repoHint")}
        required
      >
        <TextInput
          mono
          value={repo}
          onChange={onRepo}
          placeholder={t("repoPlaceholder")}
          list={REPO_DATALIST_ID}
          aria-label={t("repo")}
          autoComplete="off"
        />
        <datalist id={REPO_DATALIST_ID}>
          {repoOptions.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </FormField>
      <div role="radiogroup" aria-label={t("openPr")}>
        <button
          type="button"
          role="radio"
          aria-checked={action === "open_pr"}
          disabled={!canPr}
          style={{ ...s.actionCard(action === "open_pr"), opacity: canPr ? 1 : 0.5 }}
          onClick={() => onAction("open_pr")}
        >
          <strong>{t("openPr")}</strong>
          <div style={s.muted}>{t("openPrCard", { repo: repoTrim || "…", title: PR_TITLE, count: fileCount })}</div>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={action === "files"}
          style={s.actionCard(action === "files")}
          onClick={() => onAction("files")}
        >
          <strong>{t("zip")}</strong>
          <div style={s.muted}>{t("zipCard", { count: fileCount })}</div>
        </button>
      </div>
      {!canPr && <div style={s.muted}>{t("zipOnly")}</div>}
      {error && (
        <div style={s.error} role="alert">
          {t("error", { message: error })}
        </div>
      )}
    </div>
  );
}
