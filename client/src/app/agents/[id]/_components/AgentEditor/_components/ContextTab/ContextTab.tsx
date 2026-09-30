/* ContextTab — Agent Editor "Context" tab: attach/order Project Context
   documents for the active repository. */
"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { ContextAttachments } from "@/components/context-attachments";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ agent }: { agent: Agent }) {
  const { repoId } = useActiveRepo();
  return <ContextAttachments ownerType="agent" ownerId={agent.id} repoId={repoId} />;
}
