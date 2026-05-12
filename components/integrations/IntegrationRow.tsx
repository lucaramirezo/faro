import { ErrorTail } from "@/components/integrations/ErrorTail";
import { cn } from "@/lib/utils";

export type IntegrationStatusDot = "green" | "amber" | "red" | "neutral";

export interface IntegrationRowProps {
  name: string;
  status: IntegrationStatusDot;
  statusLabel?: string;
  lastRun?: string | null;
  nextScheduled?: string | null;
  meta?: Array<{ label: string; value: string }>;
  errors?: string[];
}

const DOT_CLASS: Record<IntegrationStatusDot, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  neutral: "bg-muted-foreground/40",
};

export function IntegrationRow({
  name,
  status,
  statusLabel,
  lastRun,
  nextScheduled,
  meta = [],
  errors = [],
}: IntegrationRowProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={cn("inline-block size-2 rounded-full shrink-0", DOT_CLASS[status])}
          />
          <span className="text-sm font-medium truncate">{name}</span>
          {statusLabel && (
            <span className="text-xs text-muted-foreground shrink-0">{statusLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums shrink-0">
          {lastRun && (
            <span>
              last <span className="text-foreground/80">{lastRun}</span>
            </span>
          )}
          {nextScheduled && (
            <span>
              next <span className="text-foreground/80">{nextScheduled}</span>
            </span>
          )}
        </div>
      </div>
      {meta.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-4">
          {meta.map((m) => (
            <li key={m.label}>
              <span>{m.label}:</span> <span className="text-foreground/80">{m.value}</span>
            </li>
          ))}
        </ul>
      )}
      <ErrorTail errors={errors} />
    </div>
  );
}
