import { notFound } from "next/navigation";
import { CodeRenderer } from "@/components/studio/CodeRenderer";
import { Gallery } from "@/components/studio/Gallery";
import { Provenance } from "@/components/studio/Provenance";
import { ProvenanceTabs } from "@/components/studio/ProvenanceTabs";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import { getArtifact, getArtifacts, scanArtifacts } from "@/lib/artifacts";
import { ARTIFACT_ID_REGEX } from "@/lib/artifacts-types";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

/**
 * Phase 4 — Studio deep-link.
 *
 * /studio/<artifact_id> selects a specific artifact in the three-pane shell.
 * Falls back to notFound() when the id format is invalid or the row is
 * missing. Shell layout matches `studio/page.tsx`.
 */
export default async function StudioDeepLinkPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  if (!ARTIFACT_ID_REGEX.test(artifactId)) notFound();

  const profile = getProfile();
  await scanArtifacts({ profile });
  const selected = getArtifact(artifactId, profile);
  if (!selected) notFound();

  const artifacts = await getArtifacts(profile, { limit: 200 });
  const codeNode = selected.mime === "text/x-code" ? <CodeRenderer artifact={selected} /> : null;

  return (
    <div className="flex h-[calc(100vh-48px)] min-h-0">
      <aside className="w-[280px] shrink-0 border-r border-border overflow-y-auto bg-sidebar/40">
        <Gallery artifacts={artifacts} selectedId={selected.artifact_id} />
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <StudioWorkspace artifact={selected} codeNode={codeNode} />
      </main>
      <aside className="w-[320px] shrink-0 border-l border-border overflow-y-auto bg-sidebar/40 min-h-0">
        <ProvenanceTabs
          artifactId={selected.artifact_id}
          provenance={<Provenance artifact={selected} />}
        />
      </aside>
    </div>
  );
}
