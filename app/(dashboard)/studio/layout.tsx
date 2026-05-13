import type { ReactNode } from "react";

/**
 * Full-bleed wrapper for /studio/*.
 *
 * The dashboard layout (app/(dashboard)/layout.tsx) wraps every page in
 * `<main className="flex-1 px-4 py-6">`. The studio's three-pane layout
 * computes its own height as `100vh - 48px` (top-bar) and wants edge-to-edge
 * width, so we absorb the parent padding with negative margins. No siblings
 * touched; the override is scoped to this route segment.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -my-6 h-[calc(100vh-3rem)] overflow-hidden">{children}</div>;
}
