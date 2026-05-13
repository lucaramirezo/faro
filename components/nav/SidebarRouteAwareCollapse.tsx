"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";

const STORAGE_KEY = "faro:studio-sidebar-manual-open";

/**
 * Auto-collapses the sidebar when navigating into `/studio/*` unless the user
 * has manually re-opened it during this browser session.
 *
 * Manual override detection: if the user expands the sidebar while inside
 * `/studio`, we flip the session-storage flag so subsequent /studio routes
 * keep it expanded for the rest of the session.
 *
 * Returns null — this is a behavior-only island.
 */
export function SidebarRouteAwareCollapse() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();
  // Track previous open state to detect user-driven expansions while inside /studio.
  const prevOpenRef = useRef(open);

  const inStudio = pathname?.startsWith("/studio") ?? false;

  // Effect 1: on /studio entry, collapse unless manual override is set.
  // Runs on pathname change; setOpen is stable enough for the deps array.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setOpen intentionally omitted to avoid loops.
  useEffect(() => {
    if (!inStudio) return;
    if (typeof window === "undefined") return;
    const manual = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    if (!manual && open) {
      setOpen(false);
    }
  }, [pathname, inStudio]);

  // Effect 2: detect manual collapsed -> expanded transition inside /studio.
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!inStudio) return;
    if (typeof window === "undefined") return;
    if (!prev && open) {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    }
  }, [open, inStudio]);

  return null;
}
