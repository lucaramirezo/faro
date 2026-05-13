import {
  Activity01Icon,
  Brain02Icon,
  BulbIcon,
  Calendar01Icon,
  CoinsDollarIcon,
  ConnectIcon,
  Database01Icon,
  Home01Icon,
  PlugSocketIcon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { NavLink } from "@/components/nav/NavLink";
import { ProfileSlug } from "@/components/nav/ProfileSlug";
import { Kbd } from "@/components/ui/kbd";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home01Icon },
  { href: "/cost", label: "Cost", icon: CoinsDollarIcon },
  { href: "/dreams", label: "Dreams", icon: Brain02Icon },
  { href: "/skills", label: "Skills", icon: SparklesIcon },
  { href: "/memory", label: "Memory", icon: Database01Icon },
  { href: "/integrations", label: "Integrations", icon: PlugSocketIcon },
  { href: "/scheduled", label: "Scheduled", icon: Calendar01Icon },
  { href: "/activity", label: "Activity", icon: Activity01Icon },
  { href: "/recommender", label: "Recommender", icon: BulbIcon },
  { href: "/graph", label: "Graph", icon: ConnectIcon },
] as const;

export function TopBar() {
  return (
    <nav className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        <ProfileSlug />
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((it) => (
            <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={2} />
          </Link>
          <Kbd className="text-xs">⌘K</Kbd>
          <span className="text-xs text-muted-foreground">v0.1</span>
        </div>
      </div>
    </nav>
  );
}
