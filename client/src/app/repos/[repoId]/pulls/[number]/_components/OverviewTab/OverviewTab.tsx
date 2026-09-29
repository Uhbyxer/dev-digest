"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { PrBriefCard } from "./_components/PrBriefCard";
import { PriorPrsPanel } from "./_components/PriorPrsPanel";
import { s } from "./styles";
import { s as briefStyles } from "./_components/PrBriefCard/styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | number | null | undefined;
  repoId?: string | null | undefined;
  repoFullName?: string | null | undefined;
  headSha?: string | null | undefined;
  prNumber?: number | string | null | undefined;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha, prNumber }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      <PrBriefCard
        prId={prId}
        repoId={repoId}
        prNumber={prNumber}
        aside={
          <>
            <div style={briefStyles.asideCell}>
              <IntentPanel prId={prId} />
            </div>
            <div style={briefStyles.asideCell}>
              <BlastRadiusPanel prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
            </div>
          </>
        }
      />
      <PriorPrsPanel prId={prId} repoFullName={repoFullName} />
    </>
  );
}
