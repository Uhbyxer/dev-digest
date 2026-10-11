/* CiTab — Agent Editor "CI" tab: "CI deployment" header, Active-in-N badge,
   Update CI config / Add to CI, Fail CI on selector, one row per installed repo
   with last run + history, and Add repository (spec AC-34, AC-35). The tab
   pulls new results from GitHub on load (AC-27). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, FormField, SelectInput, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { useCiInstallations, useCiRefresh, useUpdateAgent } from "../../../../../../../lib/hooks";
import { CI_FAIL_ON_UI_VALUES, toUiFailOn } from "../../../../../../../lib/ci-format";
import { ExportWizard, type ExportWizardInitial } from "../ExportWizard";
import { InstallationRow } from "./InstallationRow";
import { latestInstallation } from "./helpers";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci.ciTab");
  const installations = useCiInstallations(agent.id);
  const refresh = useCiRefresh(agent.id);
  const update = useUpdateAgent();
  // `null` = closed; `{}` = blank wizard; otherwise prefilled (Update CI config).
  const [wizard, setWizard] = React.useState<ExportWizardInitial | null>(null);

  // Pull-based ingest once per agent when the tab opens.
  const { mutate: doRefresh } = refresh;
  React.useEffect(() => {
    doRefresh();
  }, [agent.id, doRefresh]);

  const list = installations.data ?? [];
  const latest = latestInstallation(list);
  const prefill = (i: CiInstallation): ExportWizardInitial => ({ repo: i.repo, target: i.target_type });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("heading")}</h2>
        <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
          {t("activeIn", { count: list.filter((i) => i.status === "active").length })}
        </Badge>
        <span style={s.spacer} />
        <Button kind="secondary" disabled={!latest} onClick={() => latest && setWizard(prefill(latest))}>
          {t("updateConfig")}
        </Button>
        <Button kind="primary" icon="Plus" onClick={() => setWizard({})}>
          {t("addToCi")}
        </Button>
      </div>

      {refresh.data?.degraded && (
        <div style={s.banner} role="status">
          {t("degraded")}
        </div>
      )}

      <FormField label={t("failOn")} hint={t("failOnHint")}>
        <SelectInput
          mono={false}
          value={toUiFailOn(agent.ci_fail_on)}
          onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
          options={CI_FAIL_ON_UI_VALUES.map((v) => ({ value: v, label: t(`failOnOptions.${v}`) }))}
        />
      </FormField>

      {installations.isError ? (
        <ErrorState body={t("loadError")} onRetry={() => installations.refetch()} />
      ) : installations.isLoading ? (
        <Skeleton height={80} />
      ) : list.length === 0 ? (
        <EmptyState icon="Workflow" title={t("heading")} body={t("empty")} />
      ) : (
        <>
          <div style={s.list}>
            {list.map((i) => (
              <InstallationRow key={i.id} agentId={agent.id} installation={i} onUpdate={(x) => setWizard(prefill(x))} />
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Button kind="ghost" icon="Plus" onClick={() => setWizard({})}>
              {t("addRepository")}
            </Button>
          </div>
        </>
      )}

      {wizard && <ExportWizard agent={agent} initial={wizard} onClose={() => setWizard(null)} />}
    </div>
  );
}
