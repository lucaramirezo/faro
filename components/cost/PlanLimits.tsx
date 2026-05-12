"use client";

import { ProgressCircle } from "@tremor/react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// The Claude Code OAuth Max plan ($200) tracks two weekly hour budgets:
//   * Sonnet 4: 240–480 hrs
//   * Opus 4:  24–40 hrs   ← binding cap, this is what `/usage` reports
// Claude Code's status line surfaces the Opus cap as the "weekly" % because
// it's the constraint users actually hit. We mirror that — single bar against
// the Opus high-end (40h), with the low-end (24h) as the amber line.
const OPUS_WEEKLY_HIGH_HRS = 40;
const OPUS_WEEKLY_LOW_HRS = 24;
const SONNET_WEEKLY_HIGH_HRS = 480;
const SONNET_WEEKLY_LOW_HRS = 240;

export interface PlanLimitsProps {
  fiveHourBlockTokens?: number;
  fiveHourBlockProjectedTokens?: number;
  fiveHourBlockRemainingMinutes?: number;
  weeklyHoursUsed?: number;
}

function pct(used: number | undefined, cap: number | undefined): number {
  if (!used || !cap || cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

function fmtHours(h: number | undefined): string {
  if (h === undefined) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(h < 10 ? 1 : 0)}h`;
}

function fmtMinutes(m: number | undefined): string {
  if (m === undefined) return "—";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function PlanLimits({
  fiveHourBlockTokens,
  fiveHourBlockProjectedTokens,
  fiveHourBlockRemainingMinutes,
  weeklyHoursUsed,
}: PlanLimitsProps) {
  const blockPct = pct(fiveHourBlockTokens, fiveHourBlockProjectedTokens);
  const weeklyPct = pct(weeklyHoursUsed, OPUS_WEEKLY_HIGH_HRS);
  const weeklyLowPct = pct(weeklyHoursUsed, OPUS_WEEKLY_LOW_HRS);

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
            cap. Treat the bars as directional indicators.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* 5-hour block */}
      <div className="flex items-center gap-4">
        <ProgressCircle
          value={blockPct}
          radius={36}
          strokeWidth={6}
          color={blockPct > 80 ? "rose" : blockPct > 60 ? "amber" : "emerald"}
        >
          <span className="text-xs font-medium tabular-nums">{blockPct}%</span>
        </ProgressCircle>
        <div className="space-y-0.5 min-w-0">
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
          <p className="text-xs text-muted-foreground">
            {fiveHourBlockRemainingMinutes !== undefined ? (
              <>
                <span className="text-foreground/85 tabular-nums">
                  {fmtMinutes(fiveHourBlockRemainingMinutes)}
                </span>{" "}
                remaining in the block
              </>
            ) : (
              "no active block"
            )}
          </p>
        </div>
      </div>

      {/* Weekly — all models, against the binding Opus cap */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Weekly (all models)
          </p>
          <p className="text-xs tabular-nums">
            {weeklyHoursUsed !== undefined ? (
              <>
                <span className="text-foreground">{fmtHours(weeklyHoursUsed)}</span>
                <span className="text-muted-foreground"> of {OPUS_WEEKLY_HIGH_HRS}h</span>
                <span className="text-muted-foreground/80"> · {weeklyPct}%</span>
              </>
            ) : (
              <span className="text-muted-foreground/70">data pending</span>
            )}
          </p>
        </div>

        <div className="relative h-2 rounded-full bg-secondary/30 overflow-hidden">
          <div
            className={`h-full transition-all ${
              weeklyPct > 80
                ? "bg-rose-500/70"
                : weeklyPct > 60
                  ? "bg-amber-500/70"
                  : "bg-emerald-500/70"
            }`}
            style={{ width: `${weeklyPct}%` }}
          />
          {/* Low-end Opus threshold marker at 24/40 = 60% */}
          <div
            aria-hidden="true"
            className="absolute top-0 h-full w-px bg-foreground/40"
            style={{ left: `${(OPUS_WEEKLY_LOW_HRS / OPUS_WEEKLY_HIGH_HRS) * 100}%` }}
            title={`Opus low-end cap: ${OPUS_WEEKLY_LOW_HRS}h`}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 tabular-nums">
          <span>
            {weeklyLowPct}% of {OPUS_WEEKLY_LOW_HRS}h (low end)
          </span>
          <span>cap {OPUS_WEEKLY_HIGH_HRS}h</span>
        </div>

        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Single bar = all model usage against the Opus 4 weekly cap (the binding constraint Claude
          Code's <code>/usage</code> surfaces). Sonnet 4 has a much larger {SONNET_WEEKLY_LOW_HRS}–
          {SONNET_WEEKLY_HIGH_HRS}h budget — almost never the limiter. Hours estimate counts non-gap
          5h blocks in the last 7 days × 5h.
        </p>
      </div>
    </Card>
  );
}
