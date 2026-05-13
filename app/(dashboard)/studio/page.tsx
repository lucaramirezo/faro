import Link from "next/link";
import { CodeRenderer } from "@/components/studio/CodeRenderer";
import { Gallery } from "@/components/studio/Gallery";
import { Provenance } from "@/components/studio/Provenance";
import { ProvenanceTabs } from "@/components/studio/ProvenanceTabs";
import { StudioWorkspace } from "@/components/studio/StudioWorkspace";
import { Card } from "@/components/ui/card";
import { getArtifacts, scanArtifacts } from "@/lib/artifacts";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

/**
 * Phase 4 — Studio root.
 *
 * Three-pane layout per DESIGN.md §6.1:
 *   [Gallery 280px][Renderer flex][Provenance 320px]
 *
 * Sidebar auto-collapses to 48px icons on /studio/* via B1's
 * SidebarRouteAwareCollapse component. Total budget on a 1440px viewport:
 *   1440 − 48 (sidebar) − 280 (gallery) − 320 (provenance) = 792px renderer.
 *
 * On every visit we scanArtifacts() to pick up newly-emitted files. The scan
 * is bounded by the size of drafts/artifacts + wiki/artifacts dirs; the
 * unstable_cache around getArtifacts handles the read side. Until a row
 * count makes scanning expensive, scan-on-visit is the simplest UX.
 */
export default async function StudioPage() {
  const profile = getProfile();
  await scanArtifacts({ profile });
  const artifacts = await getArtifacts(profile, { limit: 200 });

  if (artifacts.length === 0) {
    return <EmptyState />;
  }

  const selected = artifacts[0];
  return <StudioShell artifacts={artifacts} selected={selected} />;
}

function EmptyState() {
  return (
    <div className="flex h-[calc(100vh-48px)] items-center justify-center p-8">
      <Card className="p-8 max-w-md space-y-3 text-center">
        <h2 className="text-lg font-semibold">No artifacts yet</h2>
        <p className="text-sm text-muted-foreground">
          Agents have not yet emitted any HTML / Markdown / SVG / JSON / code artifacts. Approve
          dream claims (or wait for the next cron) to generate the first one.
        </p>
        <Link
          href="/dreams"
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          Go to /dreams →
        </Link>
      </Card>
    </div>
  );
}

export function StudioShell({
  artifacts,
  selected,
}: {
  artifacts: Awaited<ReturnType<typeof getArtifacts>>;
  selected: Awaited<ReturnType<typeof getArtifacts>>[number];
}) {
  // For text/x-code artifacts, pre-render CodeRenderer (RSC) and pass it
  // through to StudioWorkspace's codeNode prop — keeps Shiki out of the
  // client bundle. See components/studio/Renderer.tsx leading comment.
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
