"use client";

import { Activity01Icon, AiChat01Icon, AlarmClockIcon } from "@hugeicons/core-free-icons";
import { KpiCard } from "@/components/home/KpiCard";
import type { ActivityEntry } from "@/lib/sessions";

interface ActivityCardsProps {
  entries: ActivityEntry[];
}

function fmtHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

export function ActivityCards({ entries }: ActivityCardsProps) {
  // Week window: the last 7 calendar days of the supplied series.
  const week = entries.slice(-7);
  const totalFocused = week.reduce((acc, e) => acc + e.focusedHours, 0);
  const totalSessions = week.reduce((acc, e) => acc + e.sessionCount, 0);
  const totalTurns = week.reduce((acc, e) => acc + e.turnCount, 0);
  const avgSessionLen = totalSessions > 0 ? totalFocused / totalSessions : 0;

  const sparkFocused = week.map((e) => ({ x: e.date, v: e.focusedHours }));
  const sparkTurns = week.map((e) => ({ x: e.date, v: e.turnCount }));
  const sparkAvg = week.map((e) => ({
    x: e.date,
    v: e.sessionCount > 0 ? e.focusedHours / e.sessionCount : 0,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <KpiCard
        label="Focused this week"
        value={fmtHours(totalFocused)}
        trendLabel={`across ${totalSessions} session${totalSessions === 1 ? "" : "s"}`}
        sparkData={sparkFocused}
        icon={AlarmClockIcon}
      />
      <KpiCard
        label="Avg session length"
        value={fmtHours(avgSessionLen)}
        trendLabel="focused-minutes per session"
        sparkData={sparkAvg}
        icon={Activity01Icon}
      />
      <KpiCard
        label="Turns this week"
        value={totalTurns.toLocaleString()}
        trendLabel="user + assistant messages"
        sparkData={sparkTurns}
        icon={AiChat01Icon}
      />
    </div>
  );
}
