/* ProjectContextSection — collapsible "Project context — attached specs
   (untrusted)" section: the injected block as PLAIN TEXT (never rendered as
   markdown/HTML) with a Copy action, per-entry origin, and skipped documents
   with reasons. Renders nothing for old traces without the snapshot. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { ProjectContextSnapshot } from "@devdigest/shared";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection";

export function ProjectContextSection({ snapshot }: { snapshot?: ProjectContextSnapshot | null }) {
  const t = useTranslations("runs");
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  if (!snapshot) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.text);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <TraceSection
      icon="FileText"
      title={t("trace.projectContext.title")}
      defaultOpen={false}
      right={<Badge color="var(--text-muted)">{snapshot.entries.length}</Badge>}
    >
      {snapshot.entries.length === 0 && snapshot.text.trim() === "" ? (
        <span style={s.specsNone}>{t("trace.projectContext.empty")}</span>
      ) : (
        <>
          <div style={s.specsWrap}>
            {snapshot.entries.map((e) => (
              <span key={e.path} className="mono" style={s.spec}>
                {e.path} · {t("trace.projectContext.entryOrigin", { origin: e.origin })} ·{" "}
                {t("trace.projectContext.tokens", { count: e.tokens })}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={() => void copy()}>
              {copied ? t("trace.projectContext.copied") : t("trace.projectContext.copy")}
            </Button>
          </div>
          <pre className="mono" style={s.rawPre} data-testid="project-context-text">
            {snapshot.text}
          </pre>
        </>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={s.promptLabel}>{t("trace.projectContext.skippedTitle")}</div>
        {snapshot.skipped.length === 0 ? (
          <span style={s.specsNone}>{t("trace.projectContext.skippedNone")}</span>
        ) : (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {snapshot.skipped.map((k) => (
              <li key={k.path}>
                <span className="mono">{k.path}</span> — {k.reason}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TraceSection>
  );
}
