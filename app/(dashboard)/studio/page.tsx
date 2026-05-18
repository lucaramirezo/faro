import type { BoardRun } from "@/components/studio/Board";
import { Gallery } from "@/components/studio/Gallery";
import { StudioShellClient } from "@/components/studio/StudioShellClient";
import { getArtifacts, scanArtifacts } from "@/lib/artifacts";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profiles";
import { getStudioLayout } from "@/lib/studio-layout";

export const dynamic = "force-dynamic";

/**
 * P2 — Studio root, now a Dockview workspace.
 *
 * Stays RSC: it resolves all server data (artifact scan + list, persisted
 * layout, the P1 runs board query) and the RSC <Gallery> node, then hands
 * them to the ssr:false Dockview shell via StudioShellClient. The shell
 * reuses Gallery / StudioWorkspace / ProvenanceTabs / Chat / RunView
 * verbatim as panel contents — nothing here re-architects 4.5 or P1.
 *
 * Root has no selected artifact → activeArtifact is null (the Artifact panel
 * opens via deep-link /studio/<id>; see [artifactId]/page.tsx). The Board
 * query is the P1 recent-runs query (mirrors app/(dashboard)/runs/page.tsx).
 */
export default async function StudioPage() {
  const profile = getProfile();
  await scanArtifacts({ profile });
  const artifacts = await getArtifacts(profile, { limit: 200 });

  const initialLayout = getStudioLayout(profile.profile);
  const boardRuns = getDb()
    .prepare(
      "SELECT run_id, status, skill_name, created_at, cost_usd FROM runs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(profile.profile) as BoardRun[];

  return (
    <StudioShellClient
      initialLayout={initialLayout}
      galleryNode={<Gallery artifacts={artifacts} selectedId="" />}
      boardRuns={boardRuns}
      activeArtifact={null}
    />
  );
}
