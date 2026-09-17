"use client";

import React from "react";
import { SeverityBadge, type Severity, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, type SeverityCounts } from "./helpers";

const ORDER: (keyof SeverityCounts)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Severity counters above "Review runs" — click one to filter every run's
 *  findings panel down to just that severity; click it again to clear. */
export function SeverityFilterBar({
  findings,
  active,
  onChange,
}: {
  findings: FindingRecord[];
  active: Severity | null;
  onChange: (severity: Severity | null) => void;
}) {
  if (findings.length === 0) return null;
  const counts = countBySeverity(findings);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      {ORDER.map((sev) => {
        const isActive = active === sev;
        return (
          <button
            key={sev}
            type="button"
            onClick={() => onChange(isActive ? null : sev)}
            aria-pressed={isActive}
            style={{
              background: "none",
              border: `1px solid ${isActive ? SEV[sev].c : "transparent"}`,
              borderRadius: 6,
              padding: 0,
              cursor: "pointer",
              opacity: active && !isActive ? 0.5 : 1,
            }}
          >
            <SeverityBadge severity={sev} count={counts[sev]} />
          </button>
        );
      })}
    </div>
  );
}
