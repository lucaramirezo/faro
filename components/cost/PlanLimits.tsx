"use client";

import { ProgressCircle } from "@tremor/react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WEEKLY_CAP_VERBATIM = "240–480 hrs Sonnet 4 / 24–40 hrs Opus 4 (Anthropic, May 2026)";

export interface PlanLimitsProps {
  fiveHourBlockTokens?: number;
  fiveHourBlockProjectedTokens?: number;
  fiveHourBlockRemainingMinutes?: number;
  weeklyMinutesUsed?: number;
  weeklyMinutesCapLow?: number;
}

function pct(used: number | undefined, cap: number | undefined): number {
  if (!used || !cap || cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

export function PlanLimits({
  fiveHourBlockTokens,
  fiveHourBlockProjectedTokens,
  fiveHourBlockRemainingMinutes,
  weeklyMinutesUsed,
  weeklyMinutesCapLow,
}: PlanLimitsProps) {
  const blockPct = pct(fiveHourBlockTokens, fiveHourBlockProjectedTokens);
  const weeklyLowPct = pct(weeklyMinutesUsed, weeklyMinutesCapLow);
  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Plan limits</h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-xs text-muted-foreground underline decoration-dotted"
            >
              cache tokens?
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Anthropic has not published whether cached input tokens count toward the Max weekly hour
            cap. Treat the bar as a directional indicator.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-4">
        <ProgressCircle
          value={blockPct}
          radius={36}
          strokeWidth={6}
          color={blockPct > 80 ? "rose" : blockPct > 60 ? "amber" : "emerald"}
        >
          <span className="text-xs font-medium tabular-nums">{blockPct}%</span>
        </ProgressCircle>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">5-hour block</p>
          <p className="text-sm tabular-nums">
            {fiveHourBlockTokens?.toLocaleString() ?? "—"} tokens
            {fiveHourBlockProjectedTokens && (
              <span className="text-muted-foreground">
                {" "}
                / projected {fiveHourBlockProjectedTokens.toLocaleString()}
              </span>
            )}
          </p>
          {fiveHourBlockRemainingMinutes !== undefined && (
            <p className="text-xs text-muted-foreground">
              {fiveHourBlockRemainingMinutes} min remaining
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Weekly window</p>
          <p className="text-xs tabular-nums">
            {weeklyMinutesUsed !== undefined ? `${Math.round(weeklyMinutesUsed / 60)}h used` : "—"}
          </p>
        </div>
        <div className="h-2 rounded-full bg-secondary/30 overflow-hidden">
          <div className="h-full bg-emerald-500/70" style={{ width: `${weeklyLowPct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">{WEEKLY_CAP_VERBATIM}</p>
      </div>
    </Card>
  );
}
