/* ConventionRow — one detected Convention: inline-editable rule text,
   read-only evidence + confidence, a status badge, and Accept/Reject actions.
   Editing `rule` NEVER changes `status` (and vice versa) — user story #6/#7. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { STATUS_COLOR } from "../../constants";
import { s } from "./styles";

export function ConventionRow({
  convention,
  onEditRule,
  onSetStatus,
}: {
  convention: ConventionCandidate;
  onEditRule: (rule: string) => void;
  onSetStatus: (status: ConventionStatus) => void;
}) {
  const t = useTranslations("conventions");
  const [rule, setRule] = React.useState(convention.rule);

  // Keep the local draft in sync when the row's underlying data changes
  // (e.g. after a re-scan or a save from elsewhere), but not while the field
  // still holds an un-submitted edit.
  React.useEffect(() => {
    setRule(convention.rule);
  }, [convention.rule]);

  const commitRule = () => {
    const trimmed = rule.trim();
    if (trimmed && trimmed !== convention.rule) {
      onEditRule(trimmed);
    } else {
      setRule(convention.rule);
    }
  };

  return (
    <div style={s.row} data-convention-id={convention.id}>
      <div style={s.topLine}>
        <div style={s.ruleInput}>
          <TextInput
            value={rule}
            onChange={setRule}
            onBlur={commitRule}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
        <Badge color={STATUS_COLOR[convention.status]}>{t(`status.${convention.status}`)}</Badge>
        <div style={s.actions}>
          <Button
            kind={convention.status === "accepted" ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            disabled={convention.status === "accepted"}
            onClick={() => onSetStatus("accepted")}
          >
            {t("row.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            disabled={convention.status === "rejected"}
            onClick={() => onSetStatus("rejected")}
          >
            {t("row.reject")}
          </Button>
        </div>
      </div>
      <div style={s.metaLine}>
        <ConfidenceNum value={convention.confidence ?? 0} />
        {convention.evidence_path && (
          <span className="mono" style={s.evidencePath}>
            {convention.evidence_path}
          </span>
        )}
      </div>
      {convention.evidence_snippet && <pre style={s.snippet}>{convention.evidence_snippet}</pre>}
    </div>
  );
}
