"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { s } from "./styles";

interface BlastGraphProps {
  blast: BlastRadius;
}

const ROW_H = 26;
const PADDING = 20;
const LEFT_X = 170;
const RIGHT_X = 470;
const WIDTH = 640;

/**
 * Hand-rolled inline SVG node-link view — changed symbols on the left, their
 * callers on the right, an edge per caller. No charting/graph dependency:
 * dataset size is small by construction (repo-intel caps callers per symbol
 * and BFS depth), so a static two-column layout is enough to see the fan-out
 * shape at a glance (user story 12). Not a general-purpose graph component.
 */
export function BlastGraph({ blast }: BlastGraphProps) {
  const t = useTranslations("blast");

  const symbols = blast.changed_symbols.map((sym) => ({
    label: sym.name,
    file: sym.file,
  }));

  const callers: { label: string; file: string; symIndex: number }[] = [];
  blast.downstream.forEach((d, i) => {
    for (const c of d.callers) callers.push({ label: c.name, file: `${c.file}:${c.line}`, symIndex: i });
  });

  if (callers.length === 0) {
    return <p style={s.emptyLine}>{t("graph.empty")}</p>;
  }

  const rows = Math.max(symbols.length, callers.length, 1);
  const height = PADDING * 2 + ROW_H * (rows - 1);
  const symY = (i: number) => PADDING + i * ROW_H;
  const callerY = (i: number) => PADDING + i * ROW_H;

  return (
    <div style={s.graphScroll}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        width={WIDTH}
        height={height}
        viewBox={`0 0 ${WIDTH} ${height}`}
      >
        {callers.map((c, i) => (
          <line
            key={`edge-${i}`}
            x1={LEFT_X}
            y1={symY(c.symIndex)}
            x2={RIGHT_X}
            y2={callerY(i)}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {symbols.map((sym, i) => (
          <g key={`sym-${i}`}>
            <circle cx={LEFT_X} cy={symY(i)} r={4} fill="var(--accent, #6ea8fe)" />
            <text x={LEFT_X - 12} y={symY(i) + 4} textAnchor="end" fontSize={12} className="mono" fill="var(--text-primary)">
              {sym.label}
              <title>{sym.file}</title>
            </text>
          </g>
        ))}

        {callers.map((c, i) => (
          <g key={`caller-${i}`}>
            <circle cx={RIGHT_X} cy={callerY(i)} r={3} fill="var(--text-muted)" />
            <text x={RIGHT_X + 10} y={callerY(i) + 4} fontSize={11} className="mono" fill="var(--text-secondary)">
              {c.label}
              <title>{c.file}</title>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
