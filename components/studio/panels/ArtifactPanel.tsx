"use client";

// Reuse-only Dockview panel: the exact StudioShell artifact composition
// (StudioWorkspace + ProvenanceTabs), unchanged. The per-artifact RSC nodes
// (`provenance`, `codeNode`) are produced by studio/page.tsx and passed as
// ReactNode props — they are NOT fetched here and NEVER put in Dockview
// `params`. Single active Artifact panel bound to the route artifactId (P2
// scope refinement — full multi-artifact = P3+).
import type { ReactNode } from "react";
import { ProvenanceTabs } from "@/components/studio/ProvenanceTabs";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import type { Artifact } from "@/lib/artifacts-types";

export function ArtifactPanel({
  artifact,
  provenance,
  codeNode,
}: {
  artifact: Artifact;
  provenance: ReactNode;
  codeNode: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0">
      <main className="flex-1 flex flex-col min-w-0">
        <StudioWorkspace artifact={artifact} codeNode={codeNode} />
      </main>
      <aside className="w-[320px] shrink-0 border-l border-border overflow-y-auto bg-sidebar/40 min-h-0">
        <ProvenanceTabs artifactId={artifact.artifact_id} provenance={provenance} />
      </aside>
    </div>
  );
}
