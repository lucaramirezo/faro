"use client";

import { CommandIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/nav/NotificationBell";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 48px sticky top bar above all dashboard content.
 * Layout: [SidebarTrigger] [LocatorPill] [path hint] ... [⌘K] [Bell] [Theme]
 *
 * The ⌘K button dispatches a `faro:open-command-palette` CustomEvent so the
 * CommandPalette island (mounted at layout level) can react without prop
 * drilling.
 */
export function TopLocator({ pill }: { pill: React.ReactNode }) {
  const pathname = usePathname();

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent("faro:open-command-palette"));
  };

  return (
    <header className="sticky top-0 z-30 h-12 border-b border-border bg-background/60 backdrop-blur">
      <div className="flex h-full items-center gap-3 px-4">
        <SidebarTrigger />
        {pill}
        <span className="hidden text-xs text-muted-foreground sm:inline-block">/ {pathname}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openPalette}
                aria-label="Open command palette"
                className="gap-2"
              >
                <HugeiconsIcon icon={CommandIcon} size={14} strokeWidth={2} />
                <Kbd className="text-[10px]">⌘K</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Command palette</TooltipContent>
          </Tooltip>
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
