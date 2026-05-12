import {
  Activity01Icon,
  Brain02Icon,
  CoinsDollarIcon,
  Database01Icon,
  Home01Icon,
  PlugSocketIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { NavLink } from "@/components/nav/NavLink";
import { ProfileSlug } from "@/components/nav/ProfileSlug";
import { Kbd } from "@/components/ui/kbd";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home01Icon },
  { href: "/cost", label: "Cost", icon: CoinsDollarIcon },
  { href: "/dreams", label: "Dreams", icon: Brain02Icon },
] as const;

const DISABLED_ITEMS = [
  { href: "/skills", label: "Skills", icon: SparklesIcon },
  { href: "/memory", label: "Memory", icon: Database01Icon },
  { href: "/integrations", label: "Integrations", icon: PlugSocketIcon },
  { href: "/activity", label: "Activity", icon: Activity01Icon },
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
          <span className="mx-2 text-muted-foreground/30">·</span>
          {DISABLED_ITEMS.map((it) => (
            <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} disabled />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Kbd className="text-xs">⌘K</Kbd>
          <span className="text-xs text-muted-foreground">v0.1</span>
        </div>
      </div>
    </nav>
  );
}
