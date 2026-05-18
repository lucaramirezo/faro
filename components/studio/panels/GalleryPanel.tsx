"use client";

// Reuse-only Dockview panel: hosts the RSC <Gallery> node resolved by
// studio/page.tsx and passed down as a ReactNode (RSC nodes never travel
// through Dockview `params` — they ride component closures via props).
import type { ReactNode } from "react";

export function GalleryPanel({ node }: { node: ReactNode }) {
  return <div className="h-full overflow-auto">{node}</div>;
}
