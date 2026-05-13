"use client";

import { Notification02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Notification bell with two empty sections.
 *
 * NOTE: Real data wiring (e.g. `/api/heartbeat/pending`) is a future task.
 * For v1, both sections render an empty state and the indicator dot is hidden.
 */
export function NotificationBell() {
  const hasPending = false;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Notifications"
              className="relative"
            >
              <HugeiconsIcon icon={Notification02Icon} size={16} strokeWidth={2} />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-1 top-1 size-1.5 rounded-full bg-amber-500",
                  hasPending ? "" : "hidden",
                )}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 text-sm">
        <div className="space-y-3">
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending heartbeat items
            </h4>
            <p className="text-xs text-muted-foreground">Nothing pending.</p>
          </section>
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pending pipeline runs
            </h4>
            <p className="text-xs text-muted-foreground">Nothing pending.</p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
