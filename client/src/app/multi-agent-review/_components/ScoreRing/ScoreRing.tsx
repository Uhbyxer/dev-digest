/* ScoreRing — circular score with the Multi-Agent thresholds (AC-29):
   >= 70 green, 50-69 orange, < 50 red. Not colour-only: the number is rendered. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { scoreColor } from "../../helpers";

export function ScoreRing({ score, size = 40, stroke = 3.5 }: { score: number; size?: number; stroke?: number }) {
  const t = useTranslations("multiAgent");
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div
      role="img"
      aria-label={t("score.label", { score })}
      data-testid="score-ring"
      data-color={color}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.min(100, Math.max(0, score)) / 100)}
          strokeLinecap="round"
        />
      </svg>
      <div
        className="tnum"
        aria-hidden
        style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.32, fontWeight: 700 }}
      >
        {score}
      </div>
    </div>
  );
}
