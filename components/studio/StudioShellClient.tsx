"use client";

// Next 16: `ssr: false` with next/dynamic is NOT allowed in Server Components
// (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). This thin
// client wrapper is where the ssr:false dynamic import lives; the RSC
// studio/page.tsx resolves all server data + RSC nodes and renders this,
// passing them straight through as props (RSC nodes travel fine as ReactNode
// props through a client boundary — they are NOT serialized like Dockview
// params).
import dynamic from "next/dynamic";
import type { ShellProps } from "@/components/studio/DockviewStudioShell";

function StudioSkeleton() {
  return (
    <div className="flex h-[calc(100vh-48px)] items-center justify-center text-sm text-muted-foreground">
      Loading workspace…
    </div>
  );
}

const Shell = dynamic(() => import("@/components/studio/DockviewStudioShell"), {
  ssr: false,
  loading: () => <StudioSkeleton />,
});

export function StudioShellClient(props: ShellProps) {
  return <Shell {...props} />;
}
