import {
  ActivitySparkIcon,
  Cancel01Icon,
  HelpCircleIcon,
  PauseIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Card } from "@/components/ui/card";
import type { UnitStatus } from "@/lib/systemd";

const TONE: Record<UnitStatus, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  inactive: "bg-slate-500/20 text-slate-300",
  failed: "bg-rose-500/20 text-rose-300",
  unknown: "bg-slate-500/10 text-muted-foreground",
};

const STATUS_ICON: Record<UnitStatus, IconSvgElement> = {
  active: Tick02Icon,
  inactive: PauseIcon,
  failed: Cancel01Icon,
  unknown: HelpCircleIcon,
};

export function BotServices({ statuses }: { statuses: Record<string, UnitStatus> }) {
  const entries = Object.entries(statuses);
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
        <HugeiconsIcon
          icon={ActivitySparkIcon}
          size={16}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        Bot services
      </h2>
      <div className="flex flex-wrap gap-2">
        {entries.map(([name, status]) => (
          <span
            key={name}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${TONE[status]}`}
          >
            <HugeiconsIcon icon={STATUS_ICON[status]} size={11} strokeWidth={2.5} />
            {name.replace(/\.service$|\.timer$/, "")}
            <span className="text-[10px] opacity-70">·{status}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}
