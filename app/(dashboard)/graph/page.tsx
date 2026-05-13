import { GraphLegend } from "@/components/graph/GraphLegend";
import { GraphView } from "@/components/graph/GraphView";
import { buildKnowledgeGraph } from "@/lib/graph";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const profile = getProfile();
  const data = await buildKnowledgeGraph({
    agentRoot: profile.agent_root,
    includeWiki: true,
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {data.nodes.length} nodes · {data.edges.length} edges from{" "}
          <code>{`${profile.agent_root}/memory/`}</code> and{" "}
          <code>{`${profile.agent_root}/wiki/`}</code>.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
          <GraphView data={data} agentRoot={profile.agent_root} vaultName="lwiki" />
        </div>
        <GraphLegend
          nodeCount={data.nodes.length}
          edgeCount={data.edges.length}
          brokenLinks={data.brokenLinks}
        />
      </div>
    </main>
  );
}
