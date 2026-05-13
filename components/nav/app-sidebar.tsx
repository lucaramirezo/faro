import {
  Activity01Icon,
  Brain02Icon,
  BulbIcon,
  Calendar01Icon,
  CoinsDollarIcon,
  ConnectIcon,
  Database01Icon,
  Home01Icon,
  LayoutBottomIcon,
  LighthouseIcon,
  PlugSocketIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { NavGroups } from "@/components/nav/NavGroups";
import { NavUser } from "@/components/nav/nav-user";
import { SidebarRouteAwareCollapse } from "@/components/nav/SidebarRouteAwareCollapse";
import { TeamSwitcher } from "@/components/nav/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getProfile } from "@/lib/profiles";

/**
 * AppSidebar is a server component: it reads the active faro profile via
 * `getProfile()` (sync fs) and passes serializable data to client children.
 * The shadcn Sidebar primitives below are themselves client components.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const profile = getProfile();
  const ownerLogin = profile.owner_logins[0] ?? "owner@example.com";

  const teams = [
    {
      name: `faro/${profile.profile}`,
      logo: <HugeiconsIcon icon={LighthouseIcon} strokeWidth={2} />,
      plan: `v0.1 · ${profile.status}`,
    },
  ];

  const groups = [
    {
      label: "Today",
      items: [
        { title: "Home", url: "/home", icon: Home01Icon },
        { title: "Cost", url: "/cost", icon: CoinsDollarIcon },
        { title: "Dreams", url: "/dreams", icon: Brain02Icon },
      ],
    },
    {
      label: "Build",
      items: [
        { title: "Studio", url: "/studio", icon: LayoutBottomIcon },
        { title: "Recommender", url: "/recommender", icon: BulbIcon },
        { title: "Skills", url: "/skills", icon: SparklesIcon },
        { title: "Graph", url: "/graph", icon: ConnectIcon },
      ],
    },
    {
      label: "Ops",
      items: [
        { title: "Memory", url: "/memory", icon: Database01Icon },
        { title: "Integrations", url: "/integrations", icon: PlugSocketIcon },
        { title: "Scheduled", url: "/scheduled", icon: Calendar01Icon },
        { title: "Activity", url: "/activity", icon: Activity01Icon },
      ],
    },
  ];

  const user = {
    name: "Luca",
    email: ownerLogin,
    avatar: "/avatars/shadcn.jpg",
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavGroups groups={groups} />
      </SidebarContent>
      <SidebarRouteAwareCollapse />
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
