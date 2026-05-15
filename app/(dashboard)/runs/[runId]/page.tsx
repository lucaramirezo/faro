import Link from "next/link";
import { RunView } from "@/components/runs/RunView";

export const dynamic = "force-dynamic";

/**
 * RSC shell — mounts the client <RunView>. The view tails the journal via
 * /api/runs/[runId]/stream (?after_seq=-1 on a fresh mount = full replay), so
 * a reload or a faro restart recovers the run. P2 will embed RunView as a
 * Dockview panel; it is kept self-contained for that.
 */
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
      <Link href="/runs" className="text-xs text-muted-foreground hover:text-foreground">
        ← Runs
      </Link>
      <RunView runId={runId} initialAfterSeq={-1} />
    </main>
  );
}
