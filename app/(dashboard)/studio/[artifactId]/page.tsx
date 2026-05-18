import { notFound } from "next/navigation";
import type { BoardRun } from "@/components/studio/Board";
import { CodeRenderer } from "@/components/studio/CodeRenderer";
import { Gallery } from "@/components/studio/Gallery";
import { Provenance } from "@/components/studio/Provenance";
import { StudioShellClient } from "@/components/studio/StudioShellClient";
import { getArtifact, getArtifacts, scanArtifacts } from "@/lib/artifacts";
import { ARTIFACT_ID_REGEX } from "@/lib/artifacts-types";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { getStudioLayout } from "@/lib/studio-layout";

export const dynamic = "force-dynamic";

/**
 * P2 — Studio deep-link. Same Dockview workspace as the root, but the route
 * artifactId binds the single active Artifact panel (P2 scope refinement:
 * one Artifact panel bound to the route id — per-artifact RSC nodes can't be
 * multiplexed in a client Dockview panel without re-architecting 4.5;
 * switching artifacts = navigation + layout restore + rebind. Full
 * multi-artifact = P3+). Run panels remain freely multi-instance.
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

  const initialLayout = getStudioLayout(profile.profile);
  const boardRuns = getDb()
    .prepare(
      "SELECT run_id, status, skill_name, created_at, cost_usd FROM runs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(profile.profile) as BoardRun[];

  return (
    <StudioShellClient
      initialLayout={initialLayout}
      galleryNode={<Gallery artifacts={artifacts} selectedId={selected.artifact_id} />}
      boardRuns={boardRuns}
      activeArtifact={{
        artifact: selected,
        provenanceNode: <Provenance artifact={selected} />,
        codeNode,
      }}
    />
  );
}
