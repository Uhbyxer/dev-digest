/* ExportWizard — Target → Preview → Configure → Install modal (spec AC-1…AC-14).
   "Update CI config" reuses it prefilled via `initial`. Only the workflow file is
   editable; edits are sent as `workflow_contents` and dropped when Configure
   changes the generated workflow. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent, CiExport, CiPostAs, CiTarget, CiTrigger } from "@devdigest/shared";
import { ApiError } from "../../../../../../../lib/api";
import { useCiExport, useCiPreview, useCiReadiness, useRepos } from "../../../../../../../lib/hooks";
import {
  DEFAULT_BASE,
  DEFAULT_POST_AS,
  DEFAULT_TARGET,
  DEFAULT_TRIGGERS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_KEYS,
  STEP_PREVIEW,
  STEP_TARGET,
} from "./constants";
import { downloadZipBase64, findWorkflow, isValidRepo, zipFilename } from "./helpers";
import { ConfigureStep } from "./steps/ConfigureStep";
import { InstallStep, type InstallAction } from "./steps/InstallStep";
import { PreviewStep } from "./steps/PreviewStep";
import { TargetStep } from "./steps/TargetStep";
import { s } from "./styles";

export interface ExportWizardInitial {
  repo?: string;
  target?: CiTarget;
}

export function ExportWizard({
  agent,
  initial,
  onClose,
}: {
  agent: Agent;
  initial?: ExportWizardInitial;
  onClose: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const [step, setStep] = React.useState(STEP_TARGET);
  const [target, setTarget] = React.useState<CiTarget>(initial?.target ?? DEFAULT_TARGET);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>(DEFAULT_POST_AS);
  const [repo, setRepo] = React.useState(initial?.repo ?? "");
  const [action, setAction] = React.useState<InstallAction>("open_pr");
  const [result, setResult] = React.useState<CiExport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const repos = useRepos().data ?? [];
  const readiness = useCiReadiness();
  const exportMut = useCiExport(agent.id);

  // Non-GHA targets can only be delivered as a zip.
  const effectiveAction: InstallAction = target === "gha" ? action : "files";

  const previewKey = `${target}|${postAs}|${[...triggers].sort().join(",")}`;
  const preview = useCiPreview(agent.id, { target, post_as: postAs, triggers }, step >= STEP_PREVIEW);
  const files = preview.data?.files;
  const workflow = findWorkflow(files);

  // Workflow edits belong to the generated variant they were made on.
  const [edit, setEdit] = React.useState<{ key: string; text: string } | null>(null);
  const edited = edit && edit.key === previewKey ? edit.text : null;
  const workflowText = edited ?? workflow?.contents ?? "";

  const repoOk = isValidRepo(repo);
  const selectedRepo = repos.find((r) => r.full_name === repo.trim());

  const install = () => {
    setError(null);
    exportMut.mutate(
      {
        repo: repo.trim(),
        target,
        action: effectiveAction,
        post_as: postAs,
        triggers,
        base: selectedRepo?.default_branch ?? DEFAULT_BASE,
        workflow_contents: edited != null && edited !== workflow?.contents ? edited : undefined,
      },
      {
        onSuccess: (res) => {
          if (res.zip_base64) downloadZipBase64(res.zip_base64, zipFilename(repo));
          setResult(res);
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  };

  const labels = STEP_KEYS.map((k) => t(`steps.${k}`));
  const busy = exportMut.isPending;
  const previewReady = !!files && !preview.isError;

  const footer = result ? (
    <div style={s.footer}>
      <span style={s.spacer} />
      <Button kind="primary" onClick={onClose}>
        {t("close")}
      </Button>
    </div>
  ) : (
    <div style={s.footer}>
      <Button kind="tertiary" onClick={onClose}>
        {t("cancel")}
      </Button>
      <span style={s.spacer} />
      {step > STEP_TARGET && (
        <Button kind="secondary" onClick={() => setStep(step - 1)} disabled={busy}>
          {t("back")}
        </Button>
      )}
      {step < STEP_INSTALL ? (
        <Button
          kind="primary"
          onClick={() => setStep(step + 1)}
          disabled={step >= STEP_PREVIEW && !previewReady}
        >
          {t("continue")}
        </Button>
      ) : (
        <Button
          kind="primary"
          onClick={install}
          loading={busy}
          disabled={!repoOk || !previewReady}
        >
          {effectiveAction === "open_pr" ? t("install.run") : t("install.runZip")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      width={860}
      title={initial?.repo ? t("updateTitle") : t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.stepsBar}>
        <ExportWizardSteps step={result ? STEP_INSTALL + 1 : step} labels={labels} />
      </div>
      <div style={s.body}>
        {step === STEP_TARGET && <TargetStep target={target} onChange={setTarget} />}
        {step === STEP_PREVIEW && (
          <PreviewStep
            files={files}
            loading={preview.isLoading}
            error={preview.isError}
            onRetry={() => preview.refetch()}
            workflowText={workflowText}
            onWorkflowChange={(text) => setEdit({ key: previewKey, text })}
          />
        )}
        {step === STEP_CONFIGURE && (
          <ConfigureStep
            triggers={triggers}
            onTriggers={setTriggers}
            postAs={postAs}
            onPostAs={setPostAs}
            openrouterReady={readiness.data?.openrouter_key_ready}
          />
        )}
        {step === STEP_INSTALL && (
          <InstallStep
            target={target}
            repo={repo}
            onRepo={setRepo}
            repoOptions={repos.map((r) => r.full_name)}
            action={effectiveAction}
            onAction={setAction}
            fileCount={files?.length ?? 0}
            error={error}
            result={result}
          />
        )}
      </div>
    </Modal>
  );
}
