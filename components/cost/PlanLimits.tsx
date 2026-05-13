"use client";

import { ProgressCircle } from "@tremor/react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UsageWindow } from "@/lib/anthropic-usage";

export interface PlanLimitsProps {
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDaySonnet: UsageWindow | null;
  /** Status of the underlying fetch — drives the degraded-mode banner. */
  fetchStatus: "ok" | "no_credentials" | "token_expired" | "rate_limited" | "error";
  errorDetail?: string;
}

function relativeUntil(iso: string | null | undefined): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "—";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  const restMin = min - hr * 60;
  if (hr < 24) return restMin > 0 ? `in ${hr}h ${restMin}m` : `in ${hr}h`;
  const days = Math.floor(hr / 24);
  return `in ${days}d ${hr - days * 24}h`;
}

function absoluteLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function tone(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 80) return "rose";
  if (pct >= 60) return "amber";
  return "emerald";
}

function StatusBanner({
  status,
  detail,
}: {
  status: PlanLimitsProps["fetchStatus"];
  detail?: string;
}) {
  if (status === "ok") return null;
  const messages: Record<Exclude<PlanLimitsProps["fetchStatus"], "ok">, string> = {
    no_credentials:
      "No Claude Code OAuth credentials at ~/.claude/.credentials.json — run `claude /login` on the host.",
    token_expired:
      "OAuth access token expired. Run any `claude` command interactively to trigger refresh.",
    rate_limited: "Anthropic /api/oauth/usage returned 429 — showing last cached values.",
    error: `Subscription usage fetch failed${detail ? ` — ${detail}` : ""}.`,
  };
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      {messages[status]}
    </div>
  );
}

interface UsageBarProps {
  label: string;
  scope: string;
  window: UsageWindow | null;
  emptyHint?: string;
}

function UsageBar({ label, scope, window, emptyHint = "no usage yet" }: UsageBarProps) {
  const pct = window ? Math.min(100, Math.max(0, window.utilization)) : 0;
  const colorClass = window
    ? pct >= 80
      ? "bg-rose-500/70"
      : pct >= 60
        ? "bg-amber-500/70"
        : "bg-emerald-500/70"
    : "bg-muted/40";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground/80">{scope}</p>
        </div>
        <div className="text-right shrink-0">
          {window ? (
            <>
              <p className="text-sm tabular-nums font-medium">{window.utilization.toFixed(0)}%</p>
              {window.resets_at && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[11px] text-muted-foreground tabular-nums cursor-help">
                      resets {relativeUntil(window.resets_at)}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span className="font-mono text-xs">{absoluteLocal(window.resets_at)}</span>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground/70">{emptyHint}</p>
          )}
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-secondary/30 overflow-hidden">
        <div className={`h-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlanLimits({
  fiveHour,
  sevenDay,
  sevenDaySonnet,
  fetchStatus,
  errorDetail,
}: PlanLimitsProps) {
  const sessionPct = Math.round(fiveHour?.utilization ?? 0);

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">Plan limits</h3>
          <p className="text-xs text-muted-foreground">
            Live from Anthropic <code>/api/oauth/usage</code> — matches Claude Code{" "}
            <code>/usage</code>.
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-xs text-muted-foreground underline decoration-dotted"
            >
              source?
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Internal Anthropic OAuth endpoint, not publicly documented. Cached 60s; degrades
            gracefully on 429 / expired token.
          </TooltipContent>
        </Tooltip>
      </div>

      <StatusBanner status={fetchStatus} detail={errorDetail} />

      {/* Session — radial highlight + linear bar */}
      <div className="grid grid-cols-[auto_1fr] gap-5 items-center">
        <ProgressCircle value={sessionPct} radius={42} strokeWidth={7} color={tone(sessionPct)}>
          <span className="text-sm font-medium tabular-nums">{sessionPct}%</span>
        </ProgressCircle>
        <div className="space-y-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current session</p>
          <p className="text-sm text-foreground">5-hour rolling window</p>
          {fiveHour?.resets_at ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground tabular-nums cursor-help">
                  resets {relativeUntil(fiveHour.resets_at)}
                </p>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-mono text-xs">{absoluteLocal(fiveHour.resets_at)}</span>
              </TooltipContent>
            </Tooltip>
          ) : (
            <p className="text-xs text-muted-foreground/70">no active block</p>
          )}
        </div>
      </div>

      {/* Weekly bars */}
      <div className="space-y-4">
        <UsageBar
          label="Weekly · all models"
          scope="Opus + Sonnet + Haiku combined"
          window={sevenDay}
        />
        <UsageBar
          label="Weekly · Sonnet only"
          scope="separate cap, larger headroom"
          window={sevenDaySonnet}
        />
      </div>
    </Card>
  );
}
