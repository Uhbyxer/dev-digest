"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { PriorPrsPanel } from "./_components/PriorPrsPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | number | null | undefined;
  repoId?: string | null | undefined;
  repoFullName?: string | null | undefined;
  headSha?: string | null | undefined;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      <IntentPanel prId={prId} />
      <BlastRadiusPanel prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      <PriorPrsPanel prId={prId} repoFullName={repoFullName} />
    </>
  );
}
