"use client";

import { SparkAreaChart } from "@tremor/react";
import { Card } from "@/components/ui/card";

export interface KpiCardProps {
  label: string;
  value: string;
  trendLabel?: string;
  sparkData?: Array<{ x: string | number; v: number }>;
  tone?: "neutral" | "good" | "warn" | "bad";
}

const TONE_CLASS: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-foreground",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-rose-400",
};

export function KpiCard({
  label,
  value,
  trendLabel,
  sparkData = [],
  tone = "neutral",
}: KpiCardProps) {
  const hasSpark = sparkData.length > 1;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-semibold tabular-nums ${TONE_CLASS[tone]}`}>{value}</p>
          {trendLabel && <p className="text-xs text-muted-foreground">{trendLabel}</p>}
        </div>
        {hasSpark && (
          <div className="w-24 h-12">
            <SparkAreaChart data={sparkData} index="x" categories={["v"]} colors={["slate"]} />
          </div>
        )}
      </div>
    </Card>
  );
}
