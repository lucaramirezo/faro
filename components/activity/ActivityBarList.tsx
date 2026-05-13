"use client";

import { BarList } from "@tremor/react";
import { Card } from "@/components/ui/card";
import type { ActivityEntry } from "@/lib/sessions";

interface ActivityBarListProps {
  entries: ActivityEntry[];
}

export function ActivityBarList({ entries }: ActivityBarListProps) {
  const data = entries.map((e) => ({
    name: e.date,
    value: Number(e.focusedHours.toFixed(2)),
  }));
  return (
    <Card className="p-5">
      <div className="space-y-1 mb-4">
        <h2 className="text-sm font-semibold tracking-tight">
          Focused hours per day (last 14 days)
        </h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          Sum of consecutive jsonl-record gaps under 15 minutes.
        </p>
      </div>
      <BarList data={data} valueFormatter={(v: number) => `${v.toFixed(1)}h`} className="text-sm" />
    </Card>
  );
}
