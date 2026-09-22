"use client";

import React from "react";
import { SectionLabel, Badge } from "@devdigest/ui";
import { useIntent } from "@/lib/hooks";
import { s } from "./styles";

interface IntentPanelProps {
  prId: string | number | null | undefined;
}

/**
 * Minimal, read-only INTENT panel (decision #7, docs/plans/intent-layer.md):
 * one-line paraphrase + IN SCOPE / OUT OF SCOPE bullets, with an "Inferred"
 * badge when the intent wasn't derived from a substantive PR description. No
 * RISK AREAS section here — that's the separate risk_brief feature's panel.
 */
export function IntentPanel({ prId }: IntentPanelProps) {
  const { data: intent } = useIntent(prId);

  if (!intent) return null;

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          intent.confidence === "inferred" ? (
            <Badge>Inferred</Badge>
          ) : (
            <Badge color="var(--accent)">Stated</Badge>
          )
        }
      >
        Intent
      </SectionLabel>
      <p style={s.intentLine}>{intent.intent}</p>
      <div style={s.scopeGroups}>
        {intent.in_scope.length > 0 && (
          <div>
            <span style={s.scopeHeading}>In scope</span>
            <ul style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {intent.out_of_scope.length > 0 && (
          <div>
            <span style={s.scopeHeading}>Out of scope</span>
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
