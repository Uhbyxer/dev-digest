"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink, Chip } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import type { BlastRadius } from "@devdigest/shared";
import { s } from "./styles";

interface BlastTreeProps {
  blast: BlastRadius;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

/**
 * Tree view: one expandable/collapsible group per changed symbol (user story
 * 11) — expanded by default so a small PR reads exactly like the baseline
 * plain-list layout, but a PR with many changed symbols can be collapsed down
 * to just the headings.
 */
export function BlastTree({ blast, repoFullName, headSha }: BlastTreeProps) {
  const t = useTranslations("blast");
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<number>>(() => new Set());

  function toggle(i: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div style={s.symbolList}>
      {blast.downstream.map((d, i) => {
        // `symbol` alone isn't unique — the same method name can be declared
        // in several changed files/classes. `downstream[i]` corresponds 1:1
        // to `changed_symbols[i]` (the mapper builds both from the same
        // ordered list), so pull the file from there to disambiguate and to
        // key the group uniquely.
        const declFile = blast.changed_symbols[i]?.file;
        const isCollapsed = collapsed.has(i);
        return (
          <div key={`${d.symbol}-${declFile ?? i}`} style={s.symbolGroup}>
            <div style={s.symbolHeading}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={!isCollapsed}
                style={s.collapseToggle}
              >
                {isCollapsed ? <Icon.ChevronRight size={14} /> : <Icon.ChevronDown size={14} />}
                <span className="mono">
                  {d.symbol}
                  {declFile && <span style={s.declFile}> — {declFile}</span>}
                </span>
              </button>
              <span style={s.callerCount}>{t("callerCount", { count: d.callers.length })}</span>
            </div>
            {!isCollapsed && (
              <>
                {d.callers.length === 0 ? (
                  <p style={s.emptyLine}>{t("noCallers")}</p>
                ) : (
                  <ul style={s.list}>
                    {d.callers.map((c, ci) => {
                      const label = `${c.name} — ${c.file}:${c.line}`;
                      return (
                        <li key={ci}>
                          {repoFullName && headSha ? (
                            <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>{label}</MonoLink>
                          ) : (
                            <span className="mono">{label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {(d.endpoints_affected.length > 0 || d.crons_affected.length > 0) && (
                  <div style={s.chips}>
                    {d.endpoints_affected.map((e) => (
                      <Chip key={`e-${e}`}>{e}</Chip>
                    ))}
                    {d.crons_affected.map((c) => (
                      <Chip key={`c-${c}`}>{c}</Chip>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
