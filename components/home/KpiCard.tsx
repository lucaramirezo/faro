"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { SparkAreaChart } from "@tremor/react";
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: string;
  trendLabel?: string;
  sparkData?: Array<{ x: string | number; v: number }>;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: IconSvgElement;
}

const TONE_CLASS: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-foreground",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-rose-400",
};

/**
 * KpiCard — full-bleed Tremor chart + left-to-right scrim + relative overlay.
 *
 * The chart fills the entire card surface via absolute positioning. A scrim
 * (from-card via-card/70 to-transparent) sits over the chart so numbers read
 * crisply on the left while the chart breathes on the right. The KPI overlay
 * is `relative` so it stacks above the scrim without z-index gymnastics.
 *
 * Refactored from the previous w-24 h-12 corner sparkline (B3, 2026-05-13).
 */
export function KpiCard({
  label,
  value,
  trendLabel,
  sparkData = [],
  tone = "neutral",
  icon,
}: KpiCardProps) {
  const hasSpark = sparkData.length > 1;
  return (
    <Card className="relative overflow-hidden h-32 p-0">
      {hasSpark && (
        <div className="absolute inset-0 pointer-events-none">
          <SparkAreaChart
            data={sparkData}
            index="x"
            categories={["v"]}
            colors={["amber"]}
            className="w-full h-full"
          />
        </div>
      )}
      {/* Scrim: opaque on the left, fades to transparent on the right so the
          chart suggests a trend without obscuring the KPI text. */}
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/70 to-transparent pointer-events-none" />
      <div className="relative h-full p-4 flex flex-col justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide inline-flex items-center gap-1.5">
          {icon && <HugeiconsIcon icon={icon} size={12} strokeWidth={2} className="opacity-70" />}
          {label}
        </p>
        <div className="space-y-0.5">
          <p className={`text-2xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</p>
          {trendLabel && <p className="text-xs text-muted-foreground tabular-nums">{trendLabel}</p>}
        </div>
      </div>
    </Card>
  );
}
