import { LockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import type { SessionLock } from "@/lib/scheduled-types";

export interface SessionLockBadgeProps {
  lock: SessionLock;
}

function relativeFromMs(ms: number): string {
  const diffMs = Date.now() - ms;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function SessionLockBadge({ lock }: SessionLockBadgeProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon icon={LockIcon} size={14} strokeWidth={2} />
      <span>
        Session lock held by PID <span className="text-foreground font-mono">{lock.pid}</span> since{" "}
        <span className="text-foreground">{relativeFromMs(lock.acquiredAt)}</span>
      </span>
      <Badge variant="outline" className="text-xs">
        {lock.sessionId.slice(0, 8)}
      </Badge>
    </div>
  );
}
