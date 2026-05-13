import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

/**
 * Vercel-style scope pill: `[faro/<slug>] [● status]`.
 *
 * NOTE (Phase 5+): clicking opens a placeholder popover. Real profile-switcher
 * state shared with TeamSwitcher in the sidebar is deferred to a later phase.
 */
export function LocatorPill() {
  const profile = getProfile();
  const isActive = profile.status === "active";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-0 rounded-full border border-border",
            "bg-background/50 text-xs font-medium leading-none transition-colors",
            "hover:bg-accent/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="Faro scope"
        >
          <span className="px-2.5 py-1 text-foreground">faro/{profile.profile}</span>
          <span aria-hidden="true" className="h-3 w-px bg-border/70" />
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-muted-foreground">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                isActive ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span>{profile.status}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{profile.display_name}</p>
          <p className="text-xs text-muted-foreground">Profile switcher coming soon.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
