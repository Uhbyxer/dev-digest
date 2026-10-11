/* AgentCard — one selectable agent row on Configure run (AC-6): checkbox, icon,
   name, teaser (agents.description, omitted when empty), `time · $cost`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import type { AgentWithEstimate } from "@/lib/types";
import { accentFor, formatDuration } from "../../helpers";
import { s } from "./styles";

export function AgentCard({
  agent,
  checked,
  onChange,
}: {
  agent: AgentWithEstimate;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTranslations("multiAgent");
  const accent = accentFor(agent.id);
  const I = Icon[accent.icon];
  return (
    <label style={s.card(accent.color, checked)} data-testid="agent-card">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: accent.color, marginTop: 6 }}
      />
      <span style={s.iconBox(accent.color)} aria-hidden>
        <I size={15} />
      </span>
      <span style={s.cardMain}>
        <div style={s.cardName}>{agent.name}</div>
        {agent.description && <div style={s.cardTeaser}>{agent.description}</div>}
      </span>
      <span style={s.cardEst} title={agent.has_history ? undefined : t("configure.noHistory")}>
        {agent.has_history
          ? `${formatDuration(agent.est_duration_ms)} · ${formatCost(agent.est_cost_usd)}`
          : "—"}
      </span>
    </label>
  );
}
