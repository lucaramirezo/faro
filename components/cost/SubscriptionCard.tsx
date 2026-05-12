import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface SubscriptionCardProps {
  name: string;
  monthlyUsd: number | null;
  badge?: string;
  primaryStat?: { label: string; value: string };
  secondary?: Array<{ label: string; value: string }>;
  status?: "live" | "manual" | "unset";
  hint?: string;
  icon?: IconSvgElement;
}

const STATUS_BADGE: Record<NonNullable<SubscriptionCardProps["status"]>, string> = {
  live: "live",
  manual: "manual entry",
  unset: "API key not configured",
};

function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function SubscriptionCard({
  name,
  monthlyUsd,
  badge,
  primaryStat,
  secondary = [],
  status = "live",
  hint,
  icon,
}: SubscriptionCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <span className="mt-0.5 rounded-md bg-muted/40 p-1.5">
              <HugeiconsIcon icon={icon} size={16} strokeWidth={2} className="text-foreground/80" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{name}</h3>
            <p className="text-xs text-muted-foreground tabular-nums">
              {monthlyUsd !== null ? `${fmtUsd(monthlyUsd)} / mo` : "no monthly fee"}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          {badge && (
            <Badge variant="outline" className="text-xs">
              {badge}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{STATUS_BADGE[status]}</span>
        </div>
      </div>
      {primaryStat && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {primaryStat.label}
          </p>
          <p className="text-xl font-semibold tabular-nums">{primaryStat.value}</p>
        </div>
      )}
      {secondary.length > 0 && (
        <ul className="space-y-1 text-xs">
          {secondary.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-2 text-foreground/85"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <span className="tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
    </Card>
  );
}
